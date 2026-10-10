# protocol Specification

## Purpose
Protocole commun de drop, porté par `packages/protocol` : identité, appairage, enveloppes signées et chiffrées, messages, reçus et limites, ainsi que le modèle de données et le cycle de vie d'un Drop dont ce package est la source de vérité.

## Requirements

### Requirement: Package protocol sans I/O
Le package `packages/protocol` MUST se limiter à des schémas zod, des fonctions pures et de la crypto, sans aucune I/O. Il SHALL être testé à 100 %.

#### Scenario: Aucune I/O dans protocol
<!-- openspec-guard:test="protocol contract > imports nothing that does I/O: only zod, libsodium, node:crypto for hashes and random bytes, node:net isIP" -->
- **WHEN** un relecteur inspecte `packages/protocol`
- **THEN** il n'y trouve aucun accès réseau, fichier ou processus, seulement des schémas zod, des fonctions pures et de la crypto

#### Scenario: Couverture complète
- **WHEN** la suite de tests de `packages/protocol` s'exécute avec mesure de couverture
- **THEN** la couverture est de 100 %

### Requirement: Schémas zod source de vérité du modèle de données
Les schémas zod de `packages/protocol` SHALL être la source de vérité de `NodeId`, `OwnerKind`, `Owner`, `CapabilityCard`, des états du cycle de vie d'un Drop, de l'`Envelope`, des messages et du `Receipt`.

#### Scenario: Import depuis protocol
<!-- openspec-guard:test="protocol contract > is the only package that declares the cards, envelopes, messages and receipts" -->
- **WHEN** un autre package a besoin d'une `CapabilityCard` ou d'un message
- **THEN** il importe le schéma depuis `packages/protocol` au lieu d'en déclarer un

### Requirement: Export JSON Schema des schémas zod
Les schémas zod SHALL exporter leur JSON Schema, notamment pour les cartes de capacité (`inputSchema`, `outputSchema`) et pour le MCP demandeur.

#### Scenario: AC: les schémas zod exportent leur JSON Schema
<!-- openspec-guard:test="cards, receipts, invites, lifecycle, schemas > zod schemas export their JSON Schema" -->
- **WHEN** on demande le JSON Schema d'un schéma zod du protocole, par exemple l'entrée d'une capacité
- **THEN** un JSON Schema valide est produit, utilisable dans une `CapabilityCard` et par `requester-mcp`

### Requirement: Type NodeId
`NodeId` SHALL être une chaîne valant le base64url de la clé publique Ed25519 du Node.

#### Scenario: NodeId dérivé de la clé publique
<!-- openspec-guard:test="protocol contract > derives the NodeId from the Ed25519 public key, in base64url" -->
- **WHEN** un Node possède la clé publique Ed25519 `pk`
- **THEN** son `NodeId` est exactement base64url(`pk`)

### Requirement: Type OwnerKind
`OwnerKind` SHALL être l'une des valeurs `'human'`, `'team'`, `'machine'`, `'service'`.

#### Scenario: Valeur hors énumération
<!-- openspec-guard:test="protocol contract > refuses an owner kind outside human, team, machine and service" -->
- **WHEN** un `OwnerKind` vaut `'bot'`
- **THEN** la validation zod échoue

### Requirement: Type Owner
`Owner` SHALL avoir la forme `{ kind: OwnerKind; displayName: string; nodeId: NodeId }`.

#### Scenario: Owner valide
<!-- openspec-guard:test="protocol contract > accepts a complete owner and refuses one without a nodeId" -->
- **WHEN** un objet `{ kind: 'human', displayName: 'Guillaume', nodeId: <NodeId> }` est validé
- **THEN** la validation réussit

#### Scenario: Owner incomplet
<!-- openspec-guard:test="protocol contract > accepts a complete owner and refuses one without a nodeId" -->
- **WHEN** un `Owner` n'a pas de `nodeId`
- **THEN** la validation zod échoue

### Requirement: CapabilityCard identité et rôles
Une `CapabilityCard` SHALL porter `id: string` (ex. `"production.error_summary"`), `version: string` en semver, `owner: Owner`, `executorNodeId: NodeId` (qui exécute) et `approverNodeIds: NodeId[]` (qui peut approuver), cette liste MUST contenir au moins 1 élément.

#### Scenario: Aucun approbateur
<!-- openspec-guard:test="protocol contract > refuses a card without approver, with a non-semver version, an unknown sensitivity or no maxSeconds" -->
- **WHEN** une `CapabilityCard` a `approverNodeIds: []`
- **THEN** la validation zod échoue

#### Scenario: Version non semver
<!-- openspec-guard:test="protocol contract > refuses a card without approver, with a non-semver version, an unknown sensitivity or no maxSeconds" -->
- **WHEN** une `CapabilityCard` a `version: "v1"`
- **THEN** la validation zod échoue

### Requirement: CapabilityCard contenu de consentement
Une `CapabilityCard` SHALL porter `title: string` (phrase courte pour la carte de consentement, ex. `"Résumer les erreurs de production"`), `sensitivity: 'low' | 'high'`, `receives: string[]` (phrases lisibles : ce que le demandeur recevra) et `neverReceives: string[]` (phrases lisibles : ce qu'il ne recevra jamais).

#### Scenario: Sensibilité inconnue
<!-- openspec-guard:test="protocol contract > refuses a card without approver, with a non-semver version, an unknown sensitivity or no maxSeconds" -->
- **WHEN** une `CapabilityCard` a `sensitivity: 'medium'`
- **THEN** la validation zod échoue

### Requirement: CapabilityCard schémas d'entrée et de sortie
Une `CapabilityCard` SHALL porter `inputSchema` et `outputSchema` de type JSON Schema, l'`inputSchema` étant dérivé du schéma zod de la capacité.

#### Scenario: Schémas présents
<!-- openspec-guard:test="buildCard > completes the card with publication fields and JSON schemas" -->
- **WHEN** une carte est construite pour une capacité
- **THEN** `inputSchema` et `outputSchema` sont des JSON Schema issus des schémas zod de cette capacité

### Requirement: CapabilityCard mode d'approbation
Une `CapabilityCard` SHALL porter `approval: 'always' | 'auto_low'`. En v1, la valeur par défaut MUST être `'always'`.

#### Scenario: Défaut v1
<!-- openspec-guard:test="protocol contract > defaults approval to always when the card does not say" -->
- **WHEN** une carte est construite sans préciser `approval`
- **THEN** `approval` vaut `'always'`

### Requirement: CapabilityCard limites de sortie et budget
Une `CapabilityCard` SHALL porter `maxOutputChars: number` (taille max de la sortie sérialisée) et `budget: { maxSeconds: number; maxUsd?: number; maxToolCalls?: number }`.

#### Scenario: Budget sans maxSeconds
<!-- openspec-guard:test="protocol contract > refuses a card without approver, with a non-semver version, an unknown sensitivity or no maxSeconds" -->
- **WHEN** une carte a `budget: { maxUsd: 1 }`
- **THEN** la validation zod échoue car `maxSeconds` est obligatoire

### Requirement: États du cycle de vie d'un Drop
L'état d'un Drop SHALL être l'un de `proposed`, `awaiting_approval`, `denied`, `expired`, `not_now`, `approved`, `running`, `failed`, `in_review`, `delivered`, `receipted`.

#### Scenario: État inconnu
<!-- openspec-guard:test="protocol contract > refuses a drop state outside the lifecycle" -->
- **WHEN** un `drop_status` porte `state: 'cancelled'`
- **THEN** la validation zod échoue

### Requirement: Transitions du cycle de vie d'un Drop
Les transitions SHALL suivre `proposed → awaiting_approval → (denied | expired | not_now)` et `awaiting_approval → approved → running → (failed | in_review) → delivered → receipted`. Une réponse humaine SHALL suivre `awaiting_approval → approved → (failed | delivered) → receipted`, sans `running` ni `in_review`.

#### Scenario: Chemin nominal
<!-- openspec-guard:test="the protocol as the nodes play it > walks a low drop through proposed, awaiting_approval, approved, running, delivered, receipted, never in_review" -->
- **WHEN** un Drop est autorisé, exécuté puis livré
- **THEN** il passe par `proposed`, `awaiting_approval`, `approved`, `running`, `delivered`, `receipted`

#### Scenario: Transition interdite
<!-- openspec-guard:test="cards, receipts, invites, lifecycle, schemas > enforces the drop lifecycle" -->
- **WHEN** un Drop en `awaiting_approval` tenterait de passer directement à `running`
- **THEN** la transition est refusée

#### Scenario: AC: chemin d'une réponse humaine
<!-- openspec-guard:test="human answer (T4.3) > allows approved to delivered for a hand-written answer, never awaiting_approval to delivered" -->
- **WHEN** un Drop approuvé reçoit une réponse humaine
- **THEN** `approved → delivered` et `approved → failed` sont permis, `awaiting_approval → delivered` reste refusé

### Requirement: État in_review réservé à la sensibilité haute
L'état `in_review` MUST n'exister que pour une capacité `sensitivity: 'high'` : l'approbateur y voit la sortie avant envoi.

#### Scenario: Capacité high
<!-- openspec-guard:test="the protocol as the nodes play it > puts a high drop in review before delivering it" -->
- **WHEN** un Drop d'une capacité `high` termine son exécution sans erreur
- **THEN** il passe en `in_review` avant `delivered`

#### Scenario: Capacité low
<!-- openspec-guard:test="the protocol as the nodes play it > walks a low drop through proposed, awaiting_approval, approved, running, delivered, receipted, never in_review" -->
- **WHEN** un Drop d'une capacité `low` termine son exécution
- **THEN** il ne passe jamais par `in_review`

### Requirement: Paire de clés Ed25519
Chaque Node SHALL posséder une paire Ed25519 générée par `crypto_sign_keypair`, et son `NodeId` MUST valoir base64url(clé publique).

#### Scenario: Génération d'identité
<!-- openspec-guard:test="protocol contract > derives the NodeId from the Ed25519 public key, in base64url" -->
- **WHEN** une identité de Node est créée
- **THEN** la paire vient de `crypto_sign_keypair` et `nodeId` vaut base64url de la clé publique

### Requirement: Dérivation X25519 pour le chiffrement
Pour chiffrer, un Node SHALL dériver sa paire X25519 de sa paire Ed25519 avec `crypto_sign_ed25519_pk_to_curve25519` et `crypto_sign_ed25519_sk_to_curve25519`.

#### Scenario: Clés de chiffrement dérivées
<!-- openspec-guard:test="protocol contract > encrypts the body with crypto_box for the X25519 keys derived from both Ed25519 identities" -->
- **WHEN** un Node chiffre un message pour un pair
- **THEN** les clés X25519 utilisées sont dérivées des clés Ed25519 par ces deux fonctions

### Requirement: Format du fichier identity.json
`identity.json` SHALL contenir `{ nodeId, publicKey, secretKey, createdAt, displayName }` et MUST avoir le mode fichier `0600`.

#### Scenario: Fichier d'identité écrit
<!-- openspec-guard:test="the protocol as the nodes play it > writes identity.json with exactly the identity fields, in mode 0600" -->
- **WHEN** l'identité est enregistrée
- **THEN** `identity.json` contient exactement ces champs et son mode est `0600`

### Requirement: Code d'invitation
`drop invite` SHALL produire un code d'invitation valant le base64url de `{ relayUrl, nodeId, displayName, oneTimeToken, expiresAt, admission? }`, avec une expiration de 24 h : c'est un lien envoyé par message, ouvert plus tard (D26).

#### Scenario: Contenu du code
<!-- openspec-guard:test="cards, receipts, invites, lifecycle, schemas > encodes invites that expire after a day" -->
- **WHEN** on décode en base64url un code produit par `drop invite`
- **THEN** on obtient `relayUrl`, `nodeId`, `displayName`, `oneTimeToken`, `expiresAt` et un ticket `admission`, et `expiresAt` est 24 h après l'émission

### Requirement: Financement par le demandeur
`drop_request` MAY porter `funding: { kind: 'capped_key', baseUrl, apiKey, maxUsd (≤ 50), model? }` : une clé de modèle
créée pour cette seule demande et plafonnée à `maxUsd` (D27). Elle voyage dans l'enveloppe chiffrée vers l'exécuteur
seulement ; elle MUST NOT figurer dans `approval_request`, un reçu, un log ou un fichier. Le financement MUST NOT remplacer la destination ni le modèle choisis par le propriétaire. La carte de consentement
MUST dire qui paie (`paidBy: 'owner' | 'requester'`).

#### Scenario: Clé visible de l'exécuteur seulement
<!-- openspec-guard:test="the requester pays with a capped key (T2.3, D27) > sends the key to the executor only, shows who pays on the card, and deletes the key when the drop ends" -->
- **WHEN** Guillaume demande une capacité avec une clé plafonnée à 0,10 $
- **THEN** l'exécution reçoit la clé, la carte de l'approbateur affiche « Coût max : 0,10 $, payé par Guillaume » sans la clé
- **AND** aucun reçu ne contient la clé, et le demandeur supprime la clé quand la demande se termine

### Requirement: Message team_roster
`team_roster` SHALL porter `team: { teamId, name }` et `members: { nodeId, displayName, ownerKind, agents[] }[]` (200
au plus) ; un code d'invitation MAY porter `team`. Une équipe est un cercle de confiance : un membre se porte garant de
qui il invite (T2.9).

#### Scenario: Liste partagée à l'appairage
<!-- openspec-guard:test="team (T2.9) > everyone invited by any member ends up paired with every member, and sees their agents and tools" -->
- **WHEN** un membre invite quelqu'un et que l'appairage aboutit
- **THEN** l'invité reçoit `team_roster` avec tous les membres, et l'équipe adopte l'invité

### Requirement: Ticket d'admission
Un ticket d'admission `{ v: 1, sponsor, nonce, expiresAt, sig }` MUST être signé en Ed25519 par le Node `sponsor` sur `canonical({ v, sponsor, nonce, expiresAt })` et expirer 24 h après l'émission (T2.1, D26). Il ne nomme pas le nouveau venu. Un ticket dont `expiresAt` dépasse l'instant de vérification de plus de 24 h et 5 min (dérive d'horloge) MUST être refusé (D69).

#### Scenario: Ticket falsifié ou expiré
<!-- openspec-guard:test="cards, receipts, invites, lifecycle, schemas > signs single-use admission tickets that only the sponsor can produce" -->
- **WHEN** un ticket est modifié, attribué à un autre sponsor, présenté après `expiresAt`, ou signé avec un `expiresAt` à plus de 24 h et 5 min
- **THEN** sa vérification échoue

#### Scenario: Code expiré
<!-- openspec-guard:test="joining the relay by invitation (T2.1) > the inviter ignores a pair request whose code expired, a day after it was issued" -->
- **WHEN** un `pair_request` utilise le `oneTimeToken` d'un code dont `expiresAt` est passé
- **THEN** l'invitant le rejette et ne répond pas `pair_accept`

### Requirement: Échange pair_request et pair_accept
`drop pair <code>` SHALL envoyer un `pair_request` signé portant le `oneTimeToken` ; l'invitant MUST valider le token puis répondre `pair_accept`.

#### Scenario: Appairage réussi
<!-- openspec-guard:test="the protocol as the nodes play it > pairs with a signed pair_request carrying the token, answered by pair_accept, and both sides write peers.json" -->
- **WHEN** `drop pair <code>` est lancé avec un code valide
- **THEN** l'invitant reçoit un `pair_request` signé avec le `oneTimeToken`, le valide et répond `pair_accept`

### Requirement: Enregistrement des pairs dans peers.json
Après appairage, les deux côtés SHALL écrire l'autre dans `peers.json` sous la forme `{ nodeId, displayName, ownerKind, pairedAt }`.

#### Scenario: Pairs enregistrés des deux côtés
<!-- openspec-guard:test="the protocol as the nodes play it > pairs with a signed pair_request carrying the token, answered by pair_accept, and both sides write peers.json" -->
- **WHEN** un appairage se termine par `pair_accept`
- **THEN** chaque Node a une entrée `{ nodeId, displayName, ownerKind, pairedAt }` pour l'autre dans son `peers.json`

### Requirement: Rejet des émetteurs inconnus
Un Node MUST rejeter toute enveloppe dont l'émetteur n'est pas dans `peers.json`, sauf un `pair_request` porteur d'un token valide.

#### Scenario: Émetteur inconnu
<!-- openspec-guard:test="envelope > accepts an unknown sender only for a pair_request with a valid token" -->
- **WHEN** un Node reçoit une enveloppe d'un `from` absent de `peers.json` qui n'est pas un `pair_request` à token valide
- **THEN** l'enveloppe est rejetée avec `E_UNKNOWN_PEER`

#### Scenario: Appairage depuis un inconnu
<!-- openspec-guard:test="envelope > accepts an unknown sender only for a pair_request with a valid token" -->
- **WHEN** un Node reçoit d'un émetteur inconnu un `pair_request` avec un `oneTimeToken` valide
- **THEN** l'enveloppe n'est pas rejetée pour émetteur inconnu

### Requirement: Champs de l'enveloppe
L'`Envelope` SHALL valider : `v` = littéral `1` ; `id` UUID (v7) ; `from` et `to` de type `NodeId` ; `ts` entier en ms epoch ; `exp` entier en ms epoch ; `nonce` base64url de 24 octets ; `body` chaîne ; `sig` chaîne.

#### Scenario: Version inconnue
<!-- openspec-guard:test="protocol contract > refuses an envelope of another version, or with a decimal ts, as E_SCHEMA" -->
- **WHEN** une enveloppe porte `v: 2`
- **THEN** la validation échoue avec `E_SCHEMA`

#### Scenario: ts non entier
<!-- openspec-guard:test="protocol contract > refuses an envelope of another version, or with a decimal ts, as E_SCHEMA" -->
- **WHEN** une enveloppe porte un `ts` décimal
- **THEN** la validation échoue avec `E_SCHEMA`

### Requirement: Borne de l'expiration d'enveloppe
Le champ `exp` d'une enveloppe MUST être inférieur ou égal à `ts + 15 min`.

#### Scenario: Expiration trop lointaine
<!-- openspec-guard:test="protocol contract > refuses an envelope that expires more than 15 minutes after its ts" -->
- **WHEN** une enveloppe a `exp` = `ts` + 16 min
- **THEN** elle est invalide

### Requirement: Chiffrement du corps
`body` SHALL valoir le base64url de `crypto_box_easy(JSON du message, nonce, pk_to, sk_from)`, avec le `nonce` de l'enveloppe et les clés X25519 du destinataire et de l'émetteur.

#### Scenario: Déchiffrement par le destinataire
<!-- openspec-guard:test="protocol contract > encrypts the body with crypto_box for the X25519 keys derived from both Ed25519 identities" -->
- **WHEN** le destinataire `to` déchiffre `body` avec `nonce`, la clé publique de `from` et sa clé secrète
- **THEN** il obtient le JSON du message d'origine

### Requirement: Type de message masqué au relais
Le `type` du message MUST se trouver uniquement dans le corps chiffré, de sorte que le relais ne puisse pas distinguer une requête d'un résultat.

#### Scenario: Enveloppe opaque
<!-- openspec-guard:test="protocol contract > shows no message type in the clear fields of an envelope" -->
- **WHEN** on inspecte les champs en clair d'une enveloppe
- **THEN** aucun ne révèle le `type` du message

### Requirement: Signature de l'enveloppe
`sig` SHALL être une signature Ed25519 de l'émetteur sur `canonical({v,id,from,to,ts,exp,nonce,body})`.

#### Scenario: Enveloppe altérée
<!-- openspec-guard:test="protocol contract > fails E_SIG when any signed field changes after signing" -->
- **WHEN** un champ signé d'une enveloppe est modifié après signature
- **THEN** la vérification échoue avec `E_SIG`

#### Scenario: AC: vecteurs de test fixes pour la signature
<!-- openspec-guard:test="signature > fixed vectors for the signature" -->
- **WHEN** la suite de tests signe une enveloppe fixe avec une clé fixe
- **THEN** la signature produite est égale au vecteur de test attendu

### Requirement: Sérialisation canonical()
`canonical()` SHALL produire un JSON aux clés triées, sans espaces.

#### Scenario: Clés triées sans espaces
<!-- openspec-guard:test="protocol contract > sorts keys and adds no whitespace in canonical()" -->
- **WHEN** on appelle `canonical({ b: 1, a: 2 })`
- **THEN** le résultat est `{"a":2,"b":1}`

#### Scenario: AC: vecteurs de test fixes pour canonical()
<!-- openspec-guard:test="canonical() > fixed vectors for canonical()" -->
- **WHEN** la suite de tests applique `canonical()` à des entrées fixes
- **THEN** chaque sortie est égale octet pour octet au vecteur attendu

### Requirement: Ordre des vérifications à la réception
À la réception, un Node MUST vérifier dans cet ordre, chaque échec ayant un code stable : `E_SCHEMA` → `E_SIG` → `E_UNKNOWN_PEER` → `E_EXPIRED` → `E_REPLAY` → `E_DECRYPT` → `E_MESSAGE_SCHEMA`. La première vérification en échec détermine le code.

#### Scenario: AC: aller-retour signer, chiffrer, vérifier, déchiffrer
<!-- openspec-guard:test="envelope > round trip sign, encrypt, verify, decrypt" -->
- **WHEN** un message est signé et chiffré par un Node puis vérifié et déchiffré par son pair
- **THEN** le pair retrouve le message d'origine

#### Scenario: AC: chaque code d'erreur dans l'ordre spécifié
<!-- openspec-guard:test="envelope > every error code in the specified order" -->
- **WHEN** on fournit une enveloppe qui échoue à une étape donnée et réussit toutes les étapes précédentes, pour chacune des sept étapes
- **THEN** le code renvoyé est celui de cette étape, dans l'ordre `E_SCHEMA`, `E_SIG`, `E_UNKNOWN_PEER`, `E_EXPIRED`, `E_REPLAY`, `E_DECRYPT`, `E_MESSAGE_SCHEMA`

#### Scenario: Plusieurs défauts
<!-- openspec-guard:test="protocol contract > reports E_SIG for an envelope that is both forged and expired" -->
- **WHEN** une enveloppe a une signature invalide et est aussi expirée
- **THEN** le code renvoyé est `E_SIG`

### Requirement: Condition E_EXPIRED
Une enveloppe MUST être rejetée avec `E_EXPIRED` si `exp` est passé ou si `ts` est à plus de 5 min dans le futur.

#### Scenario: exp passé
<!-- openspec-guard:test="envelope > every error code in the specified order" -->
- **WHEN** une enveloppe arrive après son `exp`
- **THEN** elle est rejetée avec `E_EXPIRED`

#### Scenario: ts dans le futur
<!-- openspec-guard:test="envelope > every error code in the specified order" -->
- **WHEN** une enveloppe a un `ts` à 6 min dans le futur
- **THEN** elle est rejetée avec `E_EXPIRED`

### Requirement: Protection contre le rejeu
Une enveloppe dont l'`id` a déjà été vu MUST être rejetée avec `E_REPLAY` ; le cache des `id` vus SHALL couvrir 30 min.

#### Scenario: Enveloppe rejouée
<!-- openspec-guard:test="protocol contract > remembers an envelope id for 30 minutes" -->
- **WHEN** la même enveloppe est reçue deux fois dans les 30 min
- **THEN** la seconde est rejetée avec `E_REPLAY`

### Requirement: Union discriminée des messages
Le corps déchiffré SHALL être une union discriminée sur `type`. Tous les messages MUST porter `dropId`, sauf les messages d'appairage (`pair_request`, `pair_accept`) et de catalogue (`catalog_request`, `catalog`).

#### Scenario: Type inconnu
<!-- openspec-guard:test="envelope > every error code in the specified order" -->
- **WHEN** un corps déchiffré a un `type` hors de l'union
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: dropId manquant
<!-- openspec-guard:test="protocol contract > refuses a drop message without dropId, as E_MESSAGE_SCHEMA" -->
- **WHEN** un `drop_result` n'a pas de `dropId`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

### Requirement: Messages pair_request et pair_accept
`pair_request` et `pair_accept` SHALL circuler entre le nouveau Node et l'invitant et porter `oneTimeToken`, `displayName` et `ownerKind`.

#### Scenario: Champs d'appairage
<!-- openspec-guard:test="protocol contract > requires the token, name and owner kind in pair_request and pair_accept" -->
- **WHEN** un `pair_request` est validé
- **THEN** il contient `oneTimeToken`, `displayName` et `ownerKind`

### Requirement: Messages catalog_request et catalog
`catalog_request` SHALL aller du demandeur à l'exécuteur sans champ métier. `catalog` SHALL aller de l'exécuteur au demandeur avec `cards: CapabilityCard[]`, chaque carte MUST être signée par l'exécuteur.

#### Scenario: Catalogue signé
<!-- openspec-guard:test="the protocol as the nodes play it > keeps only the catalog cards signed by the executor that sent them" -->
- **WHEN** un demandeur reçoit un `catalog`
- **THEN** chaque carte de `cards` porte une signature valide de l'exécuteur

### Requirement: Message drop_request
`drop_request` SHALL aller du demandeur à l'exécuteur avec `dropId`, `capabilityId`, `capabilityVersion`, `input` (JSON), `purpose` (≤ 140 car.) et `requestedBy` (`{ nodeId, displayName, agent: 'claude_code' | 'codex' | 'cursor' | 'other' }`). Le `dropId` d'une nouvelle demande MUST être un UUIDv7 horodaté ; un UUID d'une autre version MUST être rejeté avant tout consentement. Les lettres hexadécimales d'un UUIDv7 MUST être normalisées en minuscules avant l'admission et le stockage anti-rejeu.

#### Scenario: purpose trop long
<!-- openspec-guard:test="protocol contract > refuses a drop_request with a purpose over 140 characters or an unknown agent, as E_MESSAGE_SCHEMA" -->
- **WHEN** un `drop_request` a un `purpose` de 141 caractères
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: agent inconnu
<!-- openspec-guard:test="protocol contract > refuses a drop_request with a purpose over 140 characters or an unknown agent, as E_MESSAGE_SCHEMA" -->
- **WHEN** `requestedBy.agent` vaut `'copilot'`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: AC: identifiant UUIDv7 obligatoire
<!-- openspec-guard:test="drop request id > rejects UUIDv4 for a new drop request" -->
- **WHEN** une nouvelle demande porte un `dropId` UUIDv4
- **THEN** elle est rejetée à la validation du message avant toute approbation

#### Scenario: AC: casse canonique du nouvel identifiant
<!-- openspec-guard:test="drop request id > normalizes uppercase UUIDv7 before dispatch" -->
- **WHEN** une nouvelle demande porte un `dropId` UUIDv7 en majuscules
- **THEN** le message validé présente ce même identifiant en minuscules

### Requirement: Message drop_status
`drop_status` SHALL aller de l'exécuteur au demandeur avec `dropId` et `state`, une valeur du cycle de vie d'un Drop.

#### Scenario: Statut transmis
<!-- openspec-guard:test="the protocol as the nodes play it > walks a low drop through proposed, awaiting_approval, approved, running, delivered, receipted, never in_review" -->
- **WHEN** un Drop passe en `running`
- **THEN** le demandeur peut recevoir un `drop_status` avec `state: 'running'`

### Requirement: Message approval_request
`approval_request` SHALL aller de l'exécuteur à l'approbateur avec `dropId`, `card` (titre, `receives`, `neverReceives`, sensibilité), `inputPreview` (rendu lisible de l'entrée), `purpose`, `requestedBy` et `expiresAt`.

#### Scenario: Contenu de la demande d'approbation
<!-- openspec-guard:test="protocol contract > requires every consent field in approval_request" -->
- **WHEN** un approbateur reçoit un `approval_request`
- **THEN** il contient `dropId`, `card` (titre, `receives`, `neverReceives`, sensibilité), `inputPreview`, `purpose`, `requestedBy` et `expiresAt`

### Requirement: Message approval_decision
`approval_decision` SHALL aller de l'approbateur à l'exécuteur avec `dropId`, `decision: 'allow_once' | 'deny' | 'not_now'` et `decidedAt`.

#### Scenario: Décision inconnue
<!-- openspec-guard:test="protocol contract > refuses an approval decision other than allow_once, deny and not_now, as E_MESSAGE_SCHEMA" -->
- **WHEN** un `approval_decision` porte `decision: 'allow_always'`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

### Requirement: Message review_request
`review_request` SHALL aller de l'exécuteur à l'approbateur avec `dropId` et `output`, cette sortie MUST être déjà validée et scannée avant envoi.

#### Scenario: Sortie relue déjà filtrée
<!-- openspec-guard:test="the protocol as the nodes play it > sends for review only an output that passed the schema and the secret scan" -->
- **WHEN** un approbateur reçoit un `review_request`
- **THEN** son `output` a déjà passé la validation de schéma et le scanner de secrets

### Requirement: Message review_decision
`review_decision` SHALL aller de l'approbateur à l'exécuteur avec `dropId`, `decision: 'send' | 'discard'` et `redactions?: string[]` (chemins JSON à retirer).

#### Scenario: Envoi avec retraits
<!-- openspec-guard:test="protocol contract > accepts a review decision that sends with JSON paths to withhold" -->
- **WHEN** l'approbateur envoie `{ decision: 'send', redactions: ['/stack'] }`
- **THEN** le message est valide et désigne les chemins JSON à retirer

### Requirement: Message drop_result
`drop_result` SHALL aller de l'exécuteur au demandeur avec `dropId`, `output` et `outputSchemaHash`.

#### Scenario: Résultat livré
<!-- openspec-guard:test="protocol contract > requires dropId, output and outputSchemaHash in drop_result" -->
- **WHEN** un demandeur reçoit un `drop_result`
- **THEN** il contient `dropId`, `output` et `outputSchemaHash`

### Requirement: Message drop_error
`drop_error` SHALL aller de l'exécuteur au demandeur avec `dropId`, `code` parmi `E_SCHEMA`, `E_DENIED`, `E_NOT_NOW`, `E_EXPIRED`, `E_RATE`, `E_BUDGET`, `E_OUTPUT_INVALID`, `E_SECRET_DETECTED`, `E_RUNNER`, et `message` lisible MUST NOT contenir de détail interne.

#### Scenario: Code hors liste
<!-- openspec-guard:test="protocol contract > refuses a drop_error code outside the closed list, as E_MESSAGE_SCHEMA" -->
- **WHEN** un `drop_error` porte `code: 'E_FOO'`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: Pas de détail interne
<!-- openspec-guard:test="the protocol as the nodes play it > reports an internal failure as a readable E_RUNNER, without stack or path" -->
- **WHEN** le runner échoue sur une exception interne
- **THEN** le `message` du `drop_error` est lisible et ne contient ni pile d'appels ni chemin interne

#### Scenario: AC: quota local explicite
<!-- openspec-guard:test="replay admission through the engine > reports a full replay store as E_RATE before consent" -->
- **WHEN** le Node refuse une demande parce que le stockage anti-rejeu est plein
- **THEN** le demandeur reçoit un `drop_error` `E_RATE` sans détail interne

### Requirement: Message receipt
Le message `receipt` SHALL aller de l'exécuteur au demandeur et à l'approbateur et porter un `Receipt`.

#### Scenario: Reçu diffusé
<!-- openspec-guard:test="end to end, in memory: relay and three nodes > allow once: the requester gets the filtered result and every side keeps a signed receipt" -->
- **WHEN** un Drop se termine
- **THEN** l'exécuteur envoie un `receipt` au demandeur et un à l'approbateur

### Requirement: Sémantique de not_now
`not_now` SHALL être un refus poli : le demandeur MUST recevoir `E_NOT_NOW` et peut redemander plus tard.

#### Scenario: Pas maintenant puis nouvelle demande
<!-- openspec-guard:test="the protocol as the nodes play it > treats not now as a polite refusal: the same capability can be asked again" -->
- **WHEN** l'approbateur décide `not_now`
- **THEN** le demandeur reçoit un `drop_error` `E_NOT_NOW` et un nouveau `drop_request` pour la même capacité reste accepté

### Requirement: Champs d'identification du reçu
Un `Receipt` SHALL porter `dropId`, `capabilityId`, `capabilityVersion`, `requester: NodeId`, `executor: NodeId` et `approver: NodeId`.

#### Scenario: Reçu identifié
<!-- openspec-guard:test="protocol contract > requires the six identification fields in a receipt, and accepts a refusal without run timestamps" -->
- **WHEN** un `Receipt` est validé
- **THEN** il contient ces six champs

### Requirement: Hash d'entrée et de sortie du reçu
Un `Receipt` SHALL porter `inputHash`, le SHA-256 en hex du JSON canonique de l'entrée, et `outputHash` optionnel.

#### Scenario: inputHash calculé
<!-- openspec-guard:test="the protocol as the nodes play it > hashes the canonical input into the receipt, with neither the input nor the output" -->
- **WHEN** un reçu est produit pour une entrée `input`
- **THEN** `inputHash` vaut SHA-256 hex de `canonical(input)`

### Requirement: Décision et relecture du reçu
Un `Receipt` SHALL porter `decision` parmi `'allow_once'`, `'deny'`, `'not_now'`, `'expired'` et `reviewed: boolean`.

#### Scenario: Reçu d'un Drop expiré
<!-- openspec-guard:test="end to end, in memory: relay and three nodes > expired: an undecided drop expires after 10 minutes on a simulated clock" -->
- **WHEN** un Drop expire sans décision
- **THEN** son reçu a `decision: 'expired'`

### Requirement: Outils, coût et horodatages du reçu
Un `Receipt` SHALL porter `toolCalls: { name: string; count: int }[]`, `costUsd` optionnel et `timestamps: { requested, decided, started, finished, delivered }`, chaque horodatage étant optionnel selon l'issue.

#### Scenario: Reçu d'un refus
<!-- openspec-guard:test="protocol contract > requires the six identification fields in a receipt, and accepts a refusal without run timestamps" -->
- **WHEN** un Drop est refusé
- **THEN** le reçu est valide sans `started`, `finished` ni `delivered`

### Requirement: Signature du reçu
Un `Receipt` SHALL porter `sig`, la signature de l'exécuteur.

#### Scenario: Reçu falsifié
<!-- openspec-guard:test="cards, receipts, invites, lifecycle, schemas > signs receipts that carry hashes only" -->
- **WHEN** un champ d'un reçu est modifié après signature
- **THEN** la vérification de `sig` avec la clé de l'exécuteur échoue

### Requirement: Aucun contenu dans le reçu
Un `Receipt` MUST NOT contenir de contenu d'entrée ou de sortie : seulement des hash.

#### Scenario: Reçu sans contenu
<!-- openspec-guard:test="the protocol as the nodes play it > hashes the canonical input into the receipt, with neither the input nor the output" -->
- **WHEN** on inspecte un reçu produit pour un Drop livré
- **THEN** il ne contient ni l'entrée ni la sortie, seulement `inputHash` et `outputHash`

### Requirement: Taille maximale d'enveloppe
Une enveloppe MUST NOT dépasser 256 Ko. Au-delà, l'émetteur MUST échouer avec `E_TOO_LARGE` avant l'envoi.

#### Scenario: Enveloppe trop grosse
<!-- openspec-guard:test="envelope > refuses an oversized envelope before sending" -->
- **WHEN** un Node prépare une enveloppe de plus de 256 Ko
- **THEN** il échoue avec `E_TOO_LARGE` et n'envoie rien

### Requirement: Taille maximale de sortie par capacité
Chaque capacité SHALL déclarer sa propre taille max de sortie (ex. 1 500 caractères pour `repo.answer`).

#### Scenario: Limite déclarée
<!-- openspec-guard:test="capability registry > every capability declares its own maximum output size on its card" -->
- **WHEN** on lit la carte d'une capacité publiée
- **THEN** elle déclare sa propre taille max de sortie (`maxOutputChars`)

### Requirement: Financement incompatible refusé
En profil privé, un financement dont le fournisseur ou le modèle diffère du choix du propriétaire MUST être refusé sans appel réseau et sans journaliser sa clé.

#### Scenario: AC: non substitution du fournisseur
<!-- openspec-guard:test="private network > rejects incompatible funding without disclosing its key or replacing owner settings" -->
- **WHEN** une demande finance une autre URL ou un autre modèle
- **THEN** l’exécution échoue sans contacter ce fournisseur ni divulguer la clé.

### Requirement: Refus du financement non sollicité
En profil privé payé par le propriétaire, un financement reçu MUST être refusé avant consentement et exécution ; aucune clé reçue ne remplace celle du propriétaire.

#### Scenario: AC: financement non sollicité
<!-- openspec-guard:test="the requester pays with a capped key (T2.3, D27) > refuses unsolicited funding in an owner-paid private profile before consent" -->
- **WHEN** une demande financée arrive dans un profil privé payé par le propriétaire
- **THEN** elle échoue en E_DENIED sans carte d’accord ni utilisation de la clé

### Requirement: Cache anti-rejeu des enveloppes borné
Le cache des identifiants d'enveloppe MUST avoir un plafond fini. Lorsque ce plafond est atteint par des identifiants non expirés, il MUST refuser un nouvel identifiant avant déchiffrement plutôt que d'oublier un identifiant encore protégé. Les entrées expirées MUST pouvoir être retirées à l'arrivée d'une nouvelle enveloppe.

#### Scenario: AC: saturation du cache d'enveloppes
<!-- openspec-guard:test="bounded envelope replay cache > refuses new ids at capacity without forgetting an unexpired id" -->
- **WHEN** le cache contient le nombre maximal d'identifiants non expirés
- **THEN** un nouvel identifiant est refusé et un identifiant déjà vu reste refusé

#### Scenario: AC: place retrouvée après expiration
<!-- openspec-guard:test="bounded envelope replay cache > admits another id after entries expire without reopening a live id" -->
- **WHEN** des identifiants expirent dans un cache saturé
- **THEN** le prochain identifiant peut être admis sans rouvrir le rejeu des identifiants encore valides

### Requirement: Réponse humaine
Une réponse écrite à la main SHALL être un `HumanAnswer` : `kind: 'human'`, `text` de 8 000 caractères au plus, `file` facultatif (`name`, `mediaType` parmi `text/plain`, `text/markdown`, `text/csv`, `application/json`, `content` UTF-8 de 128 Kio au plus, sans caractère de contrôle C0 ou C1 hors tabulation et fins de ligne ; un nom sans caractère de contrôle ni de direction). Il MUST y avoir un texte non vide ou un fichier, et le JSON de la réponse MUST tenir en 160 Kio.

#### Scenario: AC: limites de la réponse humaine
<!-- openspec-guard:test="human answer (T4.3) > accepts a text or text-file answer within the limits and refuses an empty, oversized or non-text one" -->
- **WHEN** une réponse est vide, dépasse 8 000 caractères, porte un fichier de plus de 128 Kio, un fichier binaire ou un nom piégé
- **THEN** la validation échoue, alors qu'un texte seul ou un fichier texte dans les limites passe

#### Scenario: AC: la plus grande réponse tient dans une enveloppe
<!-- openspec-guard:test="human answer (T4.3) > fits the largest accepted answer into a sealed envelope" -->
- **WHEN** la plus grande réponse acceptée est scellée dans `human_answer` puis dans `drop_result`
- **THEN** chaque enveloppe reste sous `MAX_ENVELOPE_BYTES`

### Requirement: Message human_answer
Le message `human_answer` SHALL porter `dropId`, `answer: HumanAnswer` et `decidedAt`, et aller de l'approbateur à l'exécuteur à la place d'`approval_decision`. Le `drop_result` qui en découle MUST porter l'empreinte du schéma fixe `HUMAN_ANSWER_OUTPUT_SCHEMA`, pas celle du schéma de sortie de la capacité, et le demandeur MUST la présenter comme écrite à la main d'après cette seule empreinte.

#### Scenario: AC: réponse livrée sous le schéma fixe
<!-- openspec-guard:test="human answer (T4.3) > delivers a hand-written answer with the same consent and a receipt marked human" -->
- **WHEN** l'approbateur répond à la main à une demande en attente
- **THEN** le demandeur reçoit `drop_result` avec la réponse et l'empreinte de `HUMAN_ANSWER_OUTPUT_SCHEMA`

#### Scenario: AC: origine annoncée au demandeur
<!-- openspec-guard:test="human answer (T4.3) > presents a hand-written answer as such, from the hash of its fixed schema only" -->
- **WHEN** un agent demandeur lit une réponse humaine, puis le même contenu sous le schéma d'une capacité
- **THEN** seule la première est présentée comme écrite à la main

### Requirement: Reçu d'une réponse humaine
Un `Receipt` MAY porter `answeredBy` parmi `'capability'` et `'human'`, couvert par la signature. Le reçu d'une réponse humaine MUST porter `answeredBy: 'human'`, `decision: 'allow_once'`, `reviewed: true` et aucun appel d'outil.

#### Scenario: AC: reçu marqué humain
<!-- openspec-guard:test="human answer (T4.3) > signs and verifies a receipt that says a human answered" -->
- **WHEN** un reçu portant `answeredBy: 'human'` est signé puis modifié en `'capability'`
- **THEN** le reçu signé se vérifie et le reçu modifié ne se vérifie plus
