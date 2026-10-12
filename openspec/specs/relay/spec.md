# relay Specification

## Purpose
Relais WebSocket volontairement bête, porté par `packages/relay` sur le VPS derrière Caddy (TLS) : il authentifie les Nodes et route leurs enveloppes chiffrées de bout en bout sans jamais les déchiffrer.

## Requirements

### Requirement: Déploiement derrière Caddy
Le relais SHALL pouvoir tourner sur une machine interne choisie par le client, sans compte Memo Labs. Sur le réseau, un frontal TLS choisi par le client assure `wss` ; `ws` est réservé au loopback de test ou à un réseau isolé administré par le client. Caddy est une option, pas une dépendance obligatoire.

#### Scenario: Connexion chiffrée
<!-- openspec-guard:test="connects to the internal relay through trusted TLS and rejects an untrusted certificate" -->
- **WHEN** un Node se connecte au relais derrière le frontal TLS interne
- **THEN** la connexion utilise `wss` sans contacter le lab

### Requirement: Point d'entrée et défi d'authentification
Un Node SHALL ouvrir `wss://<relay>/v1`. Le relais MUST alors envoyer `{ challenge: <32 octets base64url> }`.

#### Scenario: Défi envoyé à l'ouverture
<!-- openspec-guard:test="relay contract > opens every connection with a 32-byte challenge" -->
- **WHEN** un Node ouvre `wss://<relay>/v1`
- **THEN** le premier message du relais est `{ challenge }` contenant 32 octets encodés en base64url

### Requirement: Réponse au défi signée
Le Node SHALL répondre `{ nodeId, sig, admission? }` où `sig` = Ed25519(challenge) avec la clé de `nodeId`. Le relais MUST vérifier cette signature, puis vérifier que `nodeId` figure dans `allowedNodeIds` ou parmi les Nodes admis par invitation ; sinon il MUST fermer la connexion avec le code `4401`.

#### Scenario: Node autorisé
<!-- openspec-guard:test="relay > direct delivery between two in-memory nodes" -->
- **WHEN** un Node listé dans `allowedNodeIds` répond au défi avec une signature valide
- **THEN** la connexion est authentifiée pour ce `nodeId`

#### Scenario: AC: rejet d'un Node non autorisé
<!-- openspec-guard:test="relay > rejects a node that is not allowed" -->
- **WHEN** un Node absent de `allowedNodeIds` répond au défi avec une signature valide
- **THEN** le relais ferme la connexion avec le code `4401`

#### Scenario: Une seule vérification par connexion
<!-- openspec-guard:test="relay hardening > ignores a second auth frame while the first is checked, and never closes its own socket as replaced" -->
- **WHEN** un Node envoie deux trames `auth` sur la même connexion avant la fin de la première vérification
- **THEN** le relais n'en vérifie qu'une, l'authentifie une fois et ne ferme pas cette connexion comme remplacée (`4409`)

### Requirement: Validation minimale des enveloppes
Après authentification, le relais MUST valider **seulement** le schéma `Envelope`, la taille, le destinataire et la durée de vie de chaque enveloppe reçue. Il MUST refuser avec `E_SCHEMA` une enveloppe dont `to` n'est pas un Node autorisé ou admis (ou est révoqué), ou dont `exp - ts` dépasse `MAX_TTL_MS` (15 min). Il MUST NOT déchiffrer `body`.

#### Scenario: Enveloppe hors schéma
<!-- openspec-guard:test="relay contract > refuses an envelope that breaks the schema, and routes one whose body it cannot read, unchanged" -->
- **WHEN** un Node authentifié envoie un objet qui ne respecte pas le schéma `Envelope`
- **THEN** le relais ne le transmet pas

#### Scenario: Destinataire inconnu ou durée de vie excessive
<!-- openspec-guard:test="relay hardening > refuses an envelope for a node it does not admit, or one that would outlive the maximum TTL" -->
- **WHEN** un Node authentifié envoie une enveloppe à un Node que le relais n'admet pas, ou dont `exp - ts` dépasse `MAX_TTL_MS`
- **THEN** le relais répond `E_SCHEMA`, ne la transmet pas et ne la met pas en file

#### Scenario: Corps jamais déchiffré
<!-- openspec-guard:test="relay contract > refuses an envelope that breaks the schema, and routes one whose body it cannot read, unchanged" -->
- **WHEN** le relais route une enveloppe valide
- **THEN** il ne déchiffre pas `body`

### Requirement: Anti-usurpation de l'émetteur
Le relais MUST vérifier que le champ `from` de chaque enveloppe est égal au `nodeId` authentifié sur cette connexion ; sinon il MUST répondre par le code `4403` et ne pas transmettre l'enveloppe.

#### Scenario: AC: rejet d'usurpation de from
<!-- openspec-guard:test="relay > rejects a spoofed from" -->
- **WHEN** un Node authentifié comme A envoie une enveloppe avec `from` = B
- **THEN** le relais applique le code `4403` et ne transmet pas l'enveloppe

### Requirement: Livraison directe
Si le destinataire `to` est connecté, le relais SHALL lui transmettre l'enveloppe.

#### Scenario: AC: livraison directe entre deux Nodes en mémoire
<!-- openspec-guard:test="relay > direct delivery between two in-memory nodes" -->
- **WHEN** dans un test d'intégration avec deux Nodes en mémoire connectés, A envoie une enveloppe à B
- **THEN** B reçoit l'enveloppe inchangée

### Requirement: File d'attente pour destinataire déconnecté
Si `to` n'est pas connecté, le relais SHALL mettre l'enveloppe en file (max 100 enveloppes par destinataire, `maxQueuePerNode`, et au plus `maxQueueBytes` octets pour toutes les files ensemble, 64 Mio par défaut ; au-delà, `E_QUEUE_FULL`), MUST purger chaque enveloppe à son `exp` et au plus tard `MAX_TTL_MS + MAX_CLOCK_SKEW_MS` (20 min) après sa réception, même si son destinataire ne revient jamais, et SHALL livrer la file à la reconnexion du destinataire.

#### Scenario: AC: livraison différée après reconnexion
<!-- openspec-guard:test="relay > deferred delivery after reconnect" -->
- **WHEN** dans un test d'intégration avec deux Nodes en mémoire, A envoie une enveloppe à B déconnecté, puis B se reconnecte avant `exp`
- **THEN** B reçoit l'enveloppe à la reconnexion

#### Scenario: Purge à l'expiration
<!-- openspec-guard:test="relay > drops a queued envelope once it expires" -->
- **WHEN** B se reconnecte après l'`exp` d'une enveloppe en file
- **THEN** cette enveloppe n'est pas livrée

#### Scenario: Plafond de file
<!-- openspec-guard:test="relay contract > caps the queue of an offline node at maxQueuePerNode" -->
- **WHEN** 100 enveloppes sont déjà en file pour un destinataire
- **THEN** la file de ce destinataire ne dépasse pas 100 enveloppes

#### Scenario: Plafond global et purge sans reconnexion
<!-- openspec-guard:test="relay hardening > bounds the deferred queue across all recipients and sweeps expired envelopes before their owner returns" -->
- **WHEN** les files de plusieurs destinataires déconnectés atteignent `maxQueueBytes`, puis que leurs enveloppes expirent ou dépassent la durée de garde, sans qu'aucun destinataire ne revienne
- **THEN** l'enveloppe suivante reçoit `E_QUEUE_FULL`, puis la place est libérée par le relais seul, y compris pour une enveloppe dont l'émetteur a daté `ts` loin dans le futur

### Requirement: Admission par invitation
Un Node inconnu qui présente avec sa réponse au défi un ticket d'admission (protocole) SHALL être admis si le ticket est
valide et non expiré, que son `sponsor` est lui-même admis, que son `nonce` n'a jamais servi, et que le sponsor a admis
moins de `maxAdmissionsPerSponsorPerDay` Nodes (20 par défaut) dans les dernières 24 h (T2.1, D26).

#### Scenario: Nouveau venu admis une seule fois
<!-- openspec-guard:test="relay > admits a newcomer who presents a ticket signed by an admitted node, once, and remembers it" -->
- **WHEN** un Node absent de `allowedNodeIds` présente un ticket signé par un Node admis
- **THEN** il est authentifié, et il l'est encore après un redémarrage du relais
- **AND** un autre Node qui présente le même ticket est refusé avec `4401`

#### Scenario: Ticket refusé
<!-- openspec-guard:test="relay > refuses tickets from a sponsor it does not admit, forged tickets and a sponsor over quota" -->
- **WHEN** le ticket vient d'un sponsor non admis, est falsifié, ou que le sponsor a dépassé son quota du jour
- **THEN** le relais ferme la connexion avec `4401` et journalise la raison

### Requirement: État d'admission persistant
Le relais MUST garder les Nodes admis et les `nonce` utilisés dans `admittedPath` (mode `0600`, même quand le fichier
existait déjà avec un mode plus large), pour qu'un redémarrage ne les oublie pas, et journaliser chaque admission avec son
sponsor. `allowedNodeIds` ne sert plus qu'à l'amorçage. `relay.config.json` et `revokedPath`, réécrits par
`drop-relay allow` et `drop-relay revoke`, sont eux aussi ramenés en mode `0600`.

#### Scenario: Admission gardée au redémarrage
<!-- openspec-guard:test="relay > admits a newcomer who presents a ticket signed by an admitted node, once, and remembers it" -->
- **WHEN** le relais redémarre après avoir admis un Node par invitation
- **THEN** ce Node est encore authentifié, et `admittedPath` est en mode `0600`

#### Scenario: Fichier existant ramené en 0600
<!-- openspec-guard:test="relay hardening > keeps relay files at 0600 even when they already existed with a wider mode" -->
- **WHEN** `admittedPath` ou `relay.config.json` existent déjà en mode `0644` et que le relais ou la commande les réécrit
- **THEN** ils sont en mode `0600` ensuite

### Requirement: Révocation sans redémarrage
`drop-relay revoke <nodeId> [--with-invited]` SHALL ajouter le Node à `revokedPath` (mode `0600`), que le relais relit
toutes les 2 s : il MUST alors couper la connexion du Node avec `4401`, oublier sa file, et le refuser ensuite, même
listé dans `allowedNodeIds` ou présentant un nouveau ticket, et refuser les tickets qu'il a signés. Avec
`--with-invited`, les Nodes qu'il a fait admettre sont révoqués aussi, de proche en proche (T2.19, D75).

#### Scenario: Node révoqué
<!-- openspec-guard:test="relay > revokes a node without a restart: cut off at once, never back, and no longer a sponsor (T2.19)" -->
- **WHEN** l'opérateur révoque Natha, admise par Julie, pendant qu'elle est connectée
- **THEN** sa connexion est coupée, un nouveau ticket de Julie ne la fait pas revenir, ses propres tickets sont refusés, et Julie reste admise

#### Scenario: Révocation avec ses invités
<!-- openspec-guard:test="relay > revoking with --with-invited also cuts off the nodes it admitted, transitively (T2.19)" -->
- **WHEN** l'opérateur révoque Natha avec `--with-invited`, après qu'elle a fait admettre Paul
- **THEN** Natha et Paul sont coupés, et Zoé, admise par Julie, reste connectée

#### Scenario: AC: révocation écrite pendant le démarrage
<!-- openspec-guard:test="relay > applies a revocation file written while the relay starts, even with a busy thread pool" -->
- **WHEN** le fichier de révocations est créé juste après le démarrage du relais, alors que la machine est chargée
- **THEN** la révocation est appliquée au contrôle suivant, sans attendre une autre modification du fichier

### Requirement: Plafond global d'admissions
Le relais MUST refuser une admission quand `maxAdmissionsPerDay` Nodes (100 par défaut) ont été admis dans les
dernières 24 h, tous sponsors confondus, ce qui borne la vitesse à laquelle les admissions se propagent (T2.19, D75).

#### Scenario: Plafond atteint
<!-- openspec-guard:test="relay > caps admissions per day across all sponsors (T2.19)" -->
- **WHEN** le plafond est de 2 et que deux Nodes ont été admis aujourd'hui par deux sponsors différents
- **THEN** un troisième ticket valide est refusé avec `4401`, et le relais journalise `global_quota`

### Requirement: Aucun stockage hors de la file
Le relais MUST NOT stocker autre chose que la file courte des enveloppes en attente, l'état d'admission
(`admittedPath`) et les révocations qu'il lit (`revokedPath`) : ni contenu déchiffré, ni historique des enveloppes
livrées.

#### Scenario: Rien gardé après livraison
<!-- openspec-guard:test="relay contract > logs the id, from, to, size and outcome of each envelope, and keeps no copy once delivered" -->
- **WHEN** une enveloppe a été livrée à son destinataire
- **THEN** le relais n'en garde aucune copie, ni en mémoire ni sur disque

### Requirement: Journalisation sans contenu
Le relais MUST NOT journaliser `body`. Il SHALL journaliser seulement `id`, `from`, `to`, la taille et l'issue de chaque enveloppe.

#### Scenario: AC: aucun champ body dans les logs
<!-- openspec-guard:test="relay > no body field in the logs" -->
- **WHEN** un test route des enveloppes puis inspecte la sortie de log du relais
- **THEN** aucune entrée ne contient de champ `body` ni sa valeur

#### Scenario: Champs journalisés
<!-- openspec-guard:test="relay contract > logs the id, from, to, size and outcome of each envelope, and keeps no copy once delivered" -->
- **WHEN** une enveloppe est routée
- **THEN** l'entrée de log contient `id`, `from`, `to`, la taille et l'issue

### Requirement: Ping de maintien
Le relais SHALL envoyer un ping toutes les 25 s à chaque Node et MUST le déconnecter après 2 pings sans réponse. Tout octet reçu d'un Node authentifié MUST compter comme une réponse : un Node dont la voie montante lente porte encore une grosse trame, et dont le pong attend derrière elle, n'est pas coupé (T4.39).

#### Scenario: Node muet
<!-- openspec-guard:test="relay contract > closes a node that misses two pings" -->
- **WHEN** un Node ne répond pas à 2 pings
- **THEN** le relais ferme sa connexion

#### Scenario: AC: trame lente reçue
<!-- openspec-guard:test="relay answers and liveness (T4.39) > keeps a node whose slow uplink is still carrying a frame, and cuts it once its bytes stop" -->
- **WHEN** un Node qui ne répond plus aux pings envoie encore, lentement, les octets d'une trame
- **THEN** le relais garde la connexion tant que des octets arrivent, puis la coupe après deux pings sans octet ni pong

### Requirement: Limite de débit par Node
Le relais MUST limiter chaque Node authentifié à `rateLimitPerMinute` tentatives par minute (60 par défaut) à travers ses reconnexions, y compris les trames malformées ou trop grandes. Une tentative hors quota MUST recevoir `E_RATE`, sauf si WebSocket a déjà fermé la connexion pour dépassement de `maxPayload` ; cette trame MUST néanmoins compter pour l'identité authentifiée.

#### Scenario: AC: rate limit
<!-- openspec-guard:test="relay > rate limit" -->
- **WHEN** dans un test d'intégration un Node envoie une 61e enveloppe dans la même minute
- **THEN** le relais la rejette avec `{ error: 'E_RATE' }` et ne la transmet pas

#### Scenario: AC: quota conservé après reconnexion
<!-- openspec-guard:test="relay > keeps a node rate limit after reconnect" -->
- **WHEN** un Node se reconnecte au même relais après avoir consommé son quota de la minute
- **THEN** sa prochaine enveloppe est rejetée avec `E_RATE` jusqu'à expiration de la fenêtre

#### Scenario: AC: enveloppe trop grande comptée
<!-- openspec-guard:test="relay > counts oversized envelopes against the sender rate limit" -->
- **WHEN** un Node authentifié envoie une enveloppe trop grande puis une autre dans la même minute avec un quota d'une tentative
- **THEN** la première reçoit `E_TOO_LARGE` et la suivante `E_RATE`

#### Scenario: AC: trame malformée comptée
<!-- openspec-guard:test="relay > counts malformed authenticated frames before parsing" -->
- **WHEN** un Node authentifié envoie une trame malformée puis une enveloppe valide dans la même minute avec un quota d'une tentative
- **THEN** la trame reçoit `E_SCHEMA` et l'enveloppe suivante reçoit `E_RATE`

#### Scenario: AC: trame rejetée par WebSocket comptée
<!-- openspec-guard:test="relay > counts a frame rejected by the WebSocket payload limit before reconnect" -->
- **WHEN** un Node authentifié envoie une trame au-delà de la limite WebSocket et se reconnecte dans la même minute avec un quota d'une tentative
- **THEN** la connexion initiale est fermée sans interrompre le relais et l'enveloppe suivante reçoit `E_RATE`

#### Scenario: AC: trame mal encodée rejetée par WebSocket comptée
<!-- openspec-guard:test="relay > counts invalid UTF-8 frames rejected by WebSocket before reconnect" -->
- **WHEN** un Node authentifié envoie une trame texte UTF-8 invalide puis se reconnecte dans la même minute avec un quota d'une tentative
- **THEN** la connexion initiale est fermée et l'enveloppe suivante reçoit `E_RATE`

### Requirement: Refus de quota sans identifiant corrélable
Le relais MUST fermer la connexion après un refus `E_RATE` afin de libérer les envois en attente, même si le préfixe lu contient un identifiant qui pourrait être trompeur.

#### Scenario: AC: refus de quota sans identifiant corrélable
<!-- openspec-guard:test="relay > closes an exhausted connection when a valid frame has an uncorrelatable late id" -->
- **WHEN** une enveloppe valide hors quota place son identifiant après le préfixe lu par le relais
- **THEN** le relais envoie `E_RATE` puis ferme la connexion pour libérer les envois en attente

#### Scenario: AC: identifiant trompeur avant l'enveloppe
<!-- openspec-guard:test="relay > closes an exhausted connection even when a decoy id appears before the envelope id" -->
- **WHEN** une trame hors quota contient un autre identifiant avant celui de l'enveloppe
- **THEN** le relais ferme la connexion après `E_RATE`, sans laisser l'envoi réel en attente

### Requirement: File non persistante en v1
En v1, un redémarrage du relais SHALL entraîner la perte de la file d'attente ; ce comportement est assumé.

#### Scenario: Redémarrage
<!-- openspec-guard:test="relay contract > loses its queue when it restarts, as v1 assumes" -->
- **WHEN** le relais redémarre avec des enveloppes en file
- **THEN** ces enveloppes sont perdues et ne sont pas livrées

### Requirement: Fichier de configuration du relais
Le relais SHALL lire `relay.config.json` de la forme `{ port, allowedNodeIds: string[], maxQueuePerNode, maxQueueBytes?, rateLimitPerMinute, admittedPath?, maxAdmissionsPerSponsorPerDay?, maxAdmissionsPerDay?, revokedPath? }`. Sans `admittedPath`, les admissions par invitation durent jusqu'au redémarrage.

#### Scenario: Configuration chargée
<!-- openspec-guard:test="relay > reads relay.config.json, with the admission settings optional" -->
- **WHEN** le relais démarre avec un `relay.config.json` valide
- **THEN** il écoute sur `port` et applique `allowedNodeIds`, `maxQueuePerNode`, `rateLimitPerMinute` et, s'ils sont fournis, `admittedPath` et `maxAdmissionsPerSponsorPerDay`

### Requirement: Chemins relatifs au fichier de configuration
Les chemins que nomme `relay.config.json` (`admittedPath`, `revokedPath`, `policyPath`, `tls`) MUST être résolus par rapport au dossier de ce fichier, pour le relais comme pour `drop-relay revoke`, quel que soit le dossier courant.

#### Scenario: Chemins relatifs au fichier de configuration
<!-- openspec-guard:test="relay hardening > resolves revokedPath next to the config file, where drop-relay revoke writes it from any folder" -->
- **WHEN** `revokedPath` est relatif et que `drop-relay revoke --config=<chemin>` est lancé depuis un autre dossier
- **THEN** la commande écrit le fichier à côté de `relay.config.json`, celui que le relais surveille

### Requirement: Commande drop relay allow
`drop relay allow <nodeId>` SHALL ajouter `nodeId` à `allowedNodeIds` en éditant `relay.config.json`. En v1, la prise en compte MUST nécessiter un redémarrage du relais.

#### Scenario: Ajout d'un Node autorisé
<!-- openspec-guard:test="relay contract > drop-relay allow adds a node to relay.config.json, which a restart applies" -->
- **WHEN** on lance `drop relay allow <nodeId>` puis on redémarre le relais
- **THEN** `nodeId` figure dans `allowedNodeIds` et peut s'authentifier

### Requirement: Révocation persistante
L’opérateur SHALL pouvoir révoquer un Node au redémarrage du relais. Un Node révoqué MUST être refusé même avec une nouvelle invitation ; il MUST NOT parrainer de nouveaux Nodes. La procédure de sauvegarde et restauration SHALL préserver admissions et révocations.

#### Scenario: AC: admission révocation restauration
<!-- openspec-guard:test="relay > keeps revoked members and their sponsored invitations refused after restore" -->
- **WHEN** un membre admis est révoqué et le relais est redémarré depuis un état sauvegardé
- **THEN** le membre reste refusé et ne peut parrainer de nouveau membre ; la recette VM ou conteneur conserve cette preuve.

### Requirement: Défi signé seulement au format attendu
Le Node MUST NOT signer pour un relais autre chose qu'un défi de 32 octets encodé en base64url ; tout autre texte reçu comme défi est ignoré. Ainsi un relais ne peut pas obtenir une preuve de session locale, un ticket ou un reçu signé.

#### Scenario: AC: défi hors format ignoré
<!-- openspec-guard:test="relay > signs only a 32-byte challenge, never another text a relay sends" -->
- **WHEN** un relais envoie comme défi un texte qui n'est pas 32 octets en base64url, puis un défi conforme
- **THEN** le Node ne répond qu'au défi conforme

### Requirement: Politique revérifiée par le relais
Avec `policyPath` et `policyIssuer` dans sa config (l'un sans l'autre est refusé), le relais SHALL vérifier la politique au démarrage et refuser de démarrer si elle est invalide ou expirée. Il MUST fermer (4401) la connexion d'un nœud qui ne présente pas l'empreinte de cette politique dans sa trame `auth`, ou qui en présente une autre, refuser toute connexion quand elle a expiré et couper alors les nœuds déjà connectés.

#### Scenario: AC: nœud sans la politique refusé
<!-- openspec-guard:test="enterprise policy (T4.10) > lets in only nodes that present the relay's policy" -->
- **WHEN** un relais avec politique reçoit un nœud qui présente son empreinte, un nœud sans empreinte et un nœud avec une autre
- **THEN** seul le premier est admis ; une config à moitié, une politique falsifiée ou déjà expirée empêchent le démarrage ; à l'expiration, un nœud qui arrive est refusé et un nœud connecté est coupé

### Requirement: TLS natif du relais
Avec `tls { certPath, keyPath }`, le relais SHALL servir `wss` et `https` lui-même.

#### Scenario: AC: relais en TLS natif
<!-- openspec-guard:test="enterprise policy (T4.10) > serves wss itself when given a certificate" -->
- **WHEN** le relais démarre avec un certificat et qu'un nœud qui fait confiance à ce certificat se connecte en `wss`
- **THEN** la connexion aboutit et `/health` répond en HTTPS

### Requirement: La sonde de santé porte l'identité de build

`GET /health` MUST répondre, outre le compte de connexions, avec l'identité de build du relais en marche, afin qu'un
déploiement soit vérifiable sans accès au serveur. Cette identité MUST provenir de la construction de l'image et MUST
rester une chaîne non secrète ; une construction qui n'en a pas fourni MUST répondre plutôt que mentir sur une version.

#### Scenario: AC: l'identité de build est lisible par une sonde

<!-- openspec-guard:test="relay > reports the build identity alongside the connection count" -->

- **WHEN** une demande `GET /health` atteint le relais
- **THEN** la réponse porte le compte de connexions et une identité de build non vide

#### Scenario: AC: un build sans identité ne laisse pas la sonde tomber

<!-- openspec-guard:test="relay > falls back to an explicit absence instead of failing the probe" -->

- **WHEN** le relais tourne sans identité de build dans son environnement
- **THEN** `GET /health` répond toujours en 200 avec une valeur explicite d'absence

### Requirement: Battement de cœur du client relais
Le client relais (`RelayClient`) SHALL envoyer un ping toutes les 15 s et MUST abandonner la connexion si rien n'est arrivé pendant un intervalle complet, même sans fermeture reçue. Tout octet reçu sur le socket compte (pong, ping, message, ou morceau d'une trame encore incomplète). La raison journalisée est `heartbeat`, sauf voie montante occupée (exigence suivante).

#### Scenario: AC: relais muet sans fermeture
<!-- openspec-guard:test="relay client liveness > reconnects within two heartbeat intervals when the relay stops answering without closing" -->
- **WHEN** le relais cesse de lire et de répondre sans fermer la connexion
- **THEN** le client abandonne la connexion en 30 s au plus, journalise `E_RELAY_TIMEOUT` (`heartbeat`) et se reconnecte

#### Scenario: AC: relais qui ferme à moitié
<!-- openspec-guard:test="relay client liveness > reconnects at once when the relay half-closes the connection without a close frame" -->
- **WHEN** le relais envoie la fin de connexion TCP sans trame de fermeture WebSocket et garde son côté ouvert
- **THEN** le client signale `disconnected` et se reconnecte

#### Scenario: AC: socket plus lu en CLOSE_WAIT
<!-- openspec-guard:test="relay client liveness > releases a socket it stopped reading, left in CLOSE_WAIT, and reconnects" -->
- **WHEN** le client ne lit plus son socket et que le relais ferme la connexion de son côté
- **THEN** le client détruit ce socket en 30 s au plus, sans attendre sa fermeture, et se reconnecte

#### Scenario: AC: grosse trame entrante lente
<!-- openspec-guard:test="relay client liveness > keeps a connection while a big inbound frame trickles in, and gives it up once the bytes stop" -->
- **WHEN** le relais, qui ne répond plus aux pings, envoie lentement une trame pendant plus de deux intervalles
- **THEN** le client garde la connexion tant que des octets arrivent, puis l'abandonne (`heartbeat`) dans les 30 s qui suivent le dernier octet

### Requirement: Délai d'acquittement du client relais
Chaque envoi du client relais MUST recevoir son acquittement ou son erreur dans un délai compté depuis l'appel : 15 s, plus le temps de transmettre à 32 kbit/s (4 000 octets par seconde) les octets envoyés sur cette connexion et encore sans réponse, les siens compris. Sinon la connexion est abandonnée avec la raison `ack`.

#### Scenario: AC: envoi sans acquittement libéré
<!-- openspec-guard:test="relay client liveness > releases a send left without acknowledgement as unconfirmed after 15 s and reconnects" -->
- **WHEN** le relais répond aux pings mais n'acquitte pas une petite enveloppe
- **THEN** l'envoi reste en attente pendant 15 s, puis se résout en `unconfirmed` à l'échéance de son délai, `E_RELAY_TIMEOUT` (`ack`) est journalisé et le client se reconnecte

### Requirement: Délai de connexion du client relais
Chaque tentative de connexion du client relais MUST atteindre `ready` en 15 s au plus, poignées de main TCP, TLS, HTTP et défi comprises ; sinon elle est abandonnée avec la raison `connect`.

#### Scenario: AC: tentative de connexion sans réponse
<!-- openspec-guard:test="relay client liveness > gives up a connection attempt whose handshake is never answered and tries again" -->
- **WHEN** le relais accepte la connexion TCP mais ne répond jamais à l'upgrade
- **THEN** le client abandonne la tentative au bout de 15 s, journalise `E_RELAY_TIMEOUT` (`connect`) et en ouvre une nouvelle

### Requirement: Abandon d'une connexion par le client relais
Abandonner une connexion MUST la détruire sans attendre sa fermeture, résoudre chaque envoi en attente par `unconfirmed` (sa trame a été confiée à la connexion et le relais a pu la recevoir), signaler `disconnected`, journaliser le code stable `E_RELAY_TIMEOUT` avec sa raison et planifier la reconnexion avec le délai exponentiel habituel. La fermeture volontaire du client, une fermeture de la connexion et le changement de relais MUST aussi résoudre les envois en attente par `unconfirmed`.

#### Scenario: AC: fermeture du client
<!-- openspec-guard:test="relay client liveness > settles pending sends as unconfirmed on close" -->
- **WHEN** le client est fermé alors qu'un envoi attend son acquittement
- **THEN** cet envoi se résout aussitôt en `unconfirmed`

### Requirement: Délai de reconnexion après un abandon
Après un abandon, `ready` MUST NOT ramener le délai entre tentatives au minimum : il n'y revient qu'après une réponse du relais à un envoi, ou un intervalle de battement vivant sans envoi en attente.

#### Scenario: AC: délai qui continue de croître après un abandon
<!-- openspec-guard:test="relay client liveness > keeps backing off after giving up, instead of redialing every second a relay that never acknowledges" -->
- **WHEN** le client abandonne deux connexions de suite à un relais qui accepte les trames sans jamais les acquitter
- **THEN** la deuxième reconnexion attend le double de la première au lieu de repartir du délai minimal

### Requirement: Changement de relais du client
Le client du relais SHALL pouvoir passer à un autre relais sans redémarrage (`switchUrl`, T4.23). Une autorité de certification supplémentaire (`ca`, T4.10), qui remplace les autorités par défaut, MUST rester attachée au nom d'hôte du relais pour lequel elle a été donnée : elle MUST NOT servir à un relais d'un autre hôte, où le client revient aux autorités par défaut (T4.33).

#### Scenario: AC: autorité gardée pour le même hôte seulement
<!-- openspec-guard:test="relay client switch (T4.33) > keeps the extra certificate authority for the same host only, never for a relay on another host" -->
- **WHEN** un client connecté en `wss` à un relais grâce à son autorité passe à un autre relais du même hôte, puis à un relais d'un autre nom d'hôte servi par un certificat de cette même autorité
- **THEN** il se connecte au premier, et pas au second, qu'un client neuf muni de l'autorité atteint

### Requirement: Réponses du relais dans l'ordre
Le relais MUST répondre à chaque trame `envelope` d'un Node authentifié par exactement une trame `ack` ou `error`, dans l'ordre de réception des trames sur cette connexion, ou fermer la connexion. Les enveloppes qu'il pousse vers ce Node ne sont pas des réponses.

#### Scenario: AC: une réponse par trame, dans l'ordre
<!-- openspec-guard:test="relay answers and liveness (T4.39) > answers every envelope frame once, in the order received, including an error without id" -->
- **WHEN** un Node envoie une enveloppe valide, une enveloppe hors schéma, puis une enveloppe valide
- **THEN** il reçoit dans cet ordre un `ack`, une `error` `E_SCHEMA` sans identifiant, puis un `ack`

### Requirement: Erreur du relais sans identifiant
Le client relais MUST attribuer une trame `error` sans identifiant à l'envoi le plus ancien encore sans réponse sur cette connexion, et résoudre cet envoi aussitôt avec ce code, tant que toutes les réponses précédentes de cette connexion sont arrivées dans l'ordre des envois. Si une réponse est arrivée hors de cet ordre, il MUST NOT l'attribuer : l'envoi est libéré par son délai.

#### Scenario: AC: erreur sans identifiant attribuée
<!-- openspec-guard:test="relay answers and liveness (T4.39) > resolves at once, with E_SCHEMA, a send the real relay answers without an id" -->
- **WHEN** le relais répond `E_SCHEMA` sans identifiant à une enveloppe hors schéma envoyée entre deux enveloppes valides
- **THEN** cet envoi se résout aussitôt en `E_SCHEMA`, les deux autres en `delivered` ou `queued`, sans attendre de délai ni abandonner la connexion

#### Scenario: AC: réponse hors ordre
<!-- openspec-guard:test="relay client liveness > does not attribute an error without id once the relay answered out of order" -->
- **WHEN** le relais acquitte la deuxième enveloppe avant la première, puis envoie une erreur sans identifiant
- **THEN** le client n'attribue pas cette erreur, et l'envoi restant est libéré par son délai

### Requirement: Renvoi borné d'une enveloppe
Après trois abandons `ack` causés par la même enveloppe, le client relais MUST NOT l'envoyer de nouveau : l'envoi se résout aussitôt en `E_RELAY_TIMEOUT`, journalisé avec la raison `ack_retries`. Le compteur par enveloppe MUST être borné en mémoire et oublié dès que l'enveloppe reçoit une réponse.

#### Scenario: AC: trois essais au plus
<!-- openspec-guard:test="relay client liveness > stops sending an envelope that caused three acknowledgement give-ups" -->
- **WHEN** la même enveloppe a causé trois abandons faute d'acquittement
- **THEN** le quatrième envoi se résout aussitôt en `E_RELAY_TIMEOUT` sans rien écrire au relais, avec `ack_retries` au journal

### Requirement: Voie montante occupée du client relais
Tant que les octets envoyés et encore sans réponse sur une connexion demandent plus d'un intervalle de battement au débit plancher de 32 kbit/s, un intervalle muet MUST NOT abandonner cette connexion : leur délai d'acquittement borne alors l'attente (T4.39).

#### Scenario: AC: voie montante saturée
<!-- openspec-guard:test="relay client liveness > waits for a big envelope at the floor rate, through silent heartbeat intervals, before giving up its acknowledgement" -->
- **WHEN** une enveloppe de 200 000 octets attend sa réponse et que plus rien n'arrive du relais
- **THEN** le client garde la connexion au-delà de 30 s, puis l'abandonne avec la raison `ack` à l'échéance du délai proportionnel à sa taille

### Requirement: Abandons comptés par enveloppe
Le délai d'acquittement d'un envoi MUST doubler à chaque abandon `ack` déjà compté contre la même enveloppe, jusqu'à quatre fois sa valeur de base. Un abandon MUST compter contre l'enveloppe seulement si la connexion a reçu des octets pendant que l'envoi attendait et que son écriture n'a pas échoué. Le changement de relais MUST oublier ces comptes (T4.39).

#### Scenario: AC: délai doublé pour la même enveloppe
<!-- openspec-guard:test="relay client liveness > doubles the acknowledgement delay for an envelope that already caused a give-up" -->
- **WHEN** la même enveloppe, déjà abandonnée une fois faute d'acquittement, est envoyée de nouveau à un relais qui n'acquitte pas
- **THEN** elle attend au-delà de 15 s, et son délai dépassé abandonne la connexion au double du premier

#### Scenario: AC: lien mort, enveloppe hors de cause
<!-- openspec-guard:test="relay client liveness > does not count a give-up against an envelope when nothing came back while it waited" -->
- **WHEN** une grosse enveloppe est abandonnée faute de réponse sur une connexion qui n'a plus rien reçu, puis renvoyée
- **THEN** son délai ne double pas

### Requirement: Envoi qui n'a pas quitté le Node
Un envoi demandé sans connexion prête, ou dont l'écriture a échoué, MUST se résoudre par `offline` : il n'a pas quitté le Node (T4.39).

#### Scenario: AC: envoi sans connexion
<!-- openspec-guard:test="relay client liveness > settles a send made without a ready connection as offline" -->
- **WHEN** un envoi est demandé alors qu'aucune connexion n'est prête
- **THEN** il se résout aussitôt en `offline`
