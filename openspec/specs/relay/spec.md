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
Le relais SHALL envoyer un ping toutes les 25 s à chaque Node et MUST le déconnecter après 2 pings sans réponse.

#### Scenario: Node muet
<!-- openspec-guard:test="relay contract > closes a node that misses two pings" -->
- **WHEN** un Node ne répond pas à 2 pings
- **THEN** le relais ferme sa connexion

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
Le client relais (`RelayClient`) SHALL envoyer un ping toutes les 15 s et MUST abandonner la connexion si aucune trame (pong, ping, message) n'est arrivée pendant un intervalle complet, même sans fermeture reçue. La raison journalisée est `heartbeat`.

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

### Requirement: Délai d'acquittement du client relais
Chaque envoi du client relais MUST recevoir son acquittement ou son erreur en 15 s au plus ; sinon la connexion est abandonnée avec la raison `ack`.

#### Scenario: AC: envoi sans acquittement libéré
<!-- openspec-guard:test="relay client liveness > releases a send left without acknowledgement as offline after 15 s and reconnects" -->
- **WHEN** le relais répond aux pings mais n'acquitte pas une enveloppe
- **THEN** l'envoi reste en attente avant 15 s, puis se résout en `offline`, `E_RELAY_TIMEOUT` (`ack`) est journalisé et le client se reconnecte

### Requirement: Délai de connexion du client relais
Chaque tentative de connexion du client relais MUST atteindre `ready` en 15 s au plus, poignées de main TCP, TLS, HTTP et défi comprises ; sinon elle est abandonnée avec la raison `connect`.

#### Scenario: AC: tentative de connexion sans réponse
<!-- openspec-guard:test="relay client liveness > gives up a connection attempt whose handshake is never answered and tries again" -->
- **WHEN** le relais accepte la connexion TCP mais ne répond jamais à l'upgrade
- **THEN** le client abandonne la tentative au bout de 15 s, journalise `E_RELAY_TIMEOUT` (`connect`) et en ouvre une nouvelle

### Requirement: Abandon d'une connexion par le client relais
Abandonner une connexion MUST la détruire sans attendre sa fermeture, résoudre chaque envoi en attente par `offline`, signaler `disconnected`, journaliser le code stable `E_RELAY_TIMEOUT` avec sa raison et planifier la reconnexion avec le délai exponentiel habituel. La fermeture volontaire du client MUST aussi résoudre les envois en attente par `offline`.

#### Scenario: AC: fermeture du client
<!-- openspec-guard:test="relay client liveness > settles pending sends as offline on close" -->
- **WHEN** le client est fermé alors qu'un envoi attend son acquittement
- **THEN** cet envoi se résout aussitôt en `offline`
