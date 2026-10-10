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
- **WHEN** un Node ouvre `wss://<relay>/v1`
- **THEN** le premier message du relais est `{ challenge }` contenant 32 octets encodés en base64url

### Requirement: Réponse au défi signée
Le Node SHALL répondre `{ nodeId, sig, admission? }` où `sig` = Ed25519(challenge) avec la clé de `nodeId`. Le relais MUST vérifier cette signature, puis vérifier que `nodeId` figure dans `allowedNodeIds` ou parmi les Nodes admis par invitation ; sinon il MUST fermer la connexion avec le code `4401`.

#### Scenario: Node autorisé
- **WHEN** un Node listé dans `allowedNodeIds` répond au défi avec une signature valide
- **THEN** la connexion est authentifiée pour ce `nodeId`

#### Scenario: AC: rejet d'un Node non autorisé
- **WHEN** un Node absent de `allowedNodeIds` répond au défi avec une signature valide
- **THEN** le relais ferme la connexion avec le code `4401`

### Requirement: Validation minimale des enveloppes
Après authentification, le relais MUST valider **seulement** le schéma `Envelope` et la taille de chaque enveloppe reçue. Il MUST NOT déchiffrer `body`.

#### Scenario: Enveloppe hors schéma
- **WHEN** un Node authentifié envoie un objet qui ne respecte pas le schéma `Envelope`
- **THEN** le relais ne le transmet pas

#### Scenario: Corps jamais déchiffré
- **WHEN** le relais route une enveloppe valide
- **THEN** il ne déchiffre pas `body`

### Requirement: Anti-usurpation de l'émetteur
Le relais MUST vérifier que le champ `from` de chaque enveloppe est égal au `nodeId` authentifié sur cette connexion ; sinon il MUST répondre par le code `4403` et ne pas transmettre l'enveloppe.

#### Scenario: AC: rejet d'usurpation de from
- **WHEN** un Node authentifié comme A envoie une enveloppe avec `from` = B
- **THEN** le relais applique le code `4403` et ne transmet pas l'enveloppe

### Requirement: Livraison directe
Si le destinataire `to` est connecté, le relais SHALL lui transmettre l'enveloppe.

#### Scenario: AC: livraison directe entre deux Nodes en mémoire
- **WHEN** dans un test d'intégration avec deux Nodes en mémoire connectés, A envoie une enveloppe à B
- **THEN** B reçoit l'enveloppe inchangée

### Requirement: File d'attente pour destinataire déconnecté
Si `to` n'est pas connecté, le relais SHALL mettre l'enveloppe en file (max 100 enveloppes par destinataire, `maxQueuePerNode`), MUST purger chaque enveloppe à son `exp`, et SHALL livrer la file à la reconnexion du destinataire.

#### Scenario: AC: livraison différée après reconnexion
- **WHEN** dans un test d'intégration avec deux Nodes en mémoire, A envoie une enveloppe à B déconnecté, puis B se reconnecte avant `exp`
- **THEN** B reçoit l'enveloppe à la reconnexion

#### Scenario: Purge à l'expiration
- **WHEN** B se reconnecte après l'`exp` d'une enveloppe en file
- **THEN** cette enveloppe n'est pas livrée

#### Scenario: Plafond de file
- **WHEN** 100 enveloppes sont déjà en file pour un destinataire
- **THEN** la file de ce destinataire ne dépasse pas 100 enveloppes

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
Le relais MUST garder les Nodes admis et les `nonce` utilisés dans `admittedPath` (mode `0600`), pour qu'un redémarrage
ne les oublie pas, et journaliser chaque admission avec son sponsor. `allowedNodeIds` ne sert plus qu'à l'amorçage.

#### Scenario: Admission gardée au redémarrage
<!-- openspec-guard:test="relay > admits a newcomer who presents a ticket signed by an admitted node, once, and remembers it" -->
- **WHEN** le relais redémarre après avoir admis un Node par invitation
- **THEN** ce Node est encore authentifié, et `admittedPath` est en mode `0600`

### Requirement: Aucun stockage hors de la file
Le relais MUST NOT stocker autre chose que la file courte des enveloppes en attente et l'état d'admission
(`admittedPath`) : ni contenu déchiffré, ni historique des enveloppes livrées.

#### Scenario: Rien gardé après livraison
- **WHEN** une enveloppe a été livrée à son destinataire
- **THEN** le relais n'en garde aucune copie, ni en mémoire ni sur disque

### Requirement: Journalisation sans contenu
Le relais MUST NOT journaliser `body`. Il SHALL journaliser seulement `id`, `from`, `to`, la taille et l'issue de chaque enveloppe.

#### Scenario: AC: aucun champ body dans les logs
- **WHEN** un test route des enveloppes puis inspecte la sortie de log du relais
- **THEN** aucune entrée ne contient de champ `body` ni sa valeur

#### Scenario: Champs journalisés
- **WHEN** une enveloppe est routée
- **THEN** l'entrée de log contient `id`, `from`, `to`, la taille et l'issue

### Requirement: Ping de maintien
Le relais SHALL envoyer un ping toutes les 25 s à chaque Node et MUST le déconnecter après 2 pings sans réponse.

#### Scenario: Node muet
- **WHEN** un Node ne répond pas à 2 pings
- **THEN** le relais ferme sa connexion

### Requirement: Limite de débit par Node
Le relais MUST limiter chaque Node authentifié à `rateLimitPerMinute` tentatives par minute (60 par défaut) à travers ses reconnexions, y compris les trames malformées ou trop grandes. Une tentative hors quota MUST recevoir `E_RATE`, sauf si WebSocket a déjà fermé la connexion pour dépassement de `maxPayload` ; cette trame MUST néanmoins compter pour l'identité authentifiée.

#### Scenario: AC: rate limit
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
- **WHEN** le relais redémarre avec des enveloppes en file
- **THEN** ces enveloppes sont perdues et ne sont pas livrées

### Requirement: Fichier de configuration du relais
Le relais SHALL lire `relay.config.json` de la forme `{ port, allowedNodeIds: string[], maxQueuePerNode, rateLimitPerMinute }`.

#### Scenario: Configuration chargée
- **WHEN** le relais démarre avec un `relay.config.json` valide
- **THEN** il écoute sur `port` et applique `allowedNodeIds`, `maxQueuePerNode` et `rateLimitPerMinute`

### Requirement: Commande drop relay allow
`drop relay allow <nodeId>` SHALL ajouter `nodeId` à `allowedNodeIds` en éditant `relay.config.json`. En v1, la prise en compte MUST nécessiter un redémarrage du relais.

#### Scenario: Ajout d'un Node autorisé
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
