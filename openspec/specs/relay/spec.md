# relay Specification

## Purpose
Relais WebSocket volontairement bête, porté par `packages/relay` sur le VPS derrière Caddy (TLS) : il authentifie les Nodes et route leurs enveloppes chiffrées de bout en bout sans jamais les déchiffrer.

## Requirements

### Requirement: Déploiement derrière Caddy
Le relais (`packages/relay`) SHALL tourner sur le VPS derrière Caddy, qui assure TLS ; les Nodes MUST s'y connecter en `wss`.

#### Scenario: Connexion chiffrée
- **WHEN** un Node se connecte au relais déployé
- **THEN** la connexion passe par Caddy en `wss` (TLS)

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
Le relais MUST limiter chaque Node à 60 enveloppes par minute (`rateLimitPerMinute`). Au-delà, l'enveloppe MUST être rejetée avec `{ error: 'E_RATE' }`.

#### Scenario: AC: rate limit
- **WHEN** dans un test d'intégration un Node envoie une 61e enveloppe dans la même minute
- **THEN** le relais la rejette avec `{ error: 'E_RATE' }` et ne la transmet pas

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
