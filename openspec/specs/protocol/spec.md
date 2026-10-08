# protocol Specification

## Purpose
Protocole commun de drop, porté par `packages/protocol` : identité, appairage, enveloppes signées et chiffrées, messages, reçus et limites, ainsi que le modèle de données et le cycle de vie d'un Drop dont ce package est la source de vérité.

## Requirements

### Requirement: Package protocol sans I/O
Le package `packages/protocol` MUST se limiter à des schémas zod, des fonctions pures et de la crypto, sans aucune I/O. Il SHALL être testé à 100 %.

#### Scenario: Aucune I/O dans protocol
- **WHEN** un relecteur inspecte `packages/protocol`
- **THEN** il n'y trouve aucun accès réseau, fichier ou processus, seulement des schémas zod, des fonctions pures et de la crypto

#### Scenario: Couverture complète
- **WHEN** la suite de tests de `packages/protocol` s'exécute avec mesure de couverture
- **THEN** la couverture est de 100 %

### Requirement: Schémas zod source de vérité du modèle de données
Les schémas zod de `packages/protocol` SHALL être la source de vérité de `NodeId`, `OwnerKind`, `Owner`, `CapabilityCard`, des états du cycle de vie d'un Drop, de l'`Envelope`, des messages et du `Receipt`.

#### Scenario: Import depuis protocol
- **WHEN** un autre package a besoin d'une `CapabilityCard` ou d'un message
- **THEN** il importe le schéma depuis `packages/protocol` au lieu d'en déclarer un

### Requirement: Export JSON Schema des schémas zod
Les schémas zod SHALL exporter leur JSON Schema, notamment pour les cartes de capacité (`inputSchema`, `outputSchema`) et pour le MCP demandeur.

#### Scenario: AC: les schémas zod exportent leur JSON Schema
- **WHEN** on demande le JSON Schema d'un schéma zod du protocole, par exemple l'entrée d'une capacité
- **THEN** un JSON Schema valide est produit, utilisable dans une `CapabilityCard` et par `requester-mcp`

### Requirement: Type NodeId
`NodeId` SHALL être une chaîne valant le base64url de la clé publique Ed25519 du Node.

#### Scenario: NodeId dérivé de la clé publique
- **WHEN** un Node possède la clé publique Ed25519 `pk`
- **THEN** son `NodeId` est exactement base64url(`pk`)

### Requirement: Type OwnerKind
`OwnerKind` SHALL être l'une des valeurs `'human'`, `'team'`, `'machine'`, `'service'`.

#### Scenario: Valeur hors énumération
- **WHEN** un `OwnerKind` vaut `'bot'`
- **THEN** la validation zod échoue

### Requirement: Type Owner
`Owner` SHALL avoir la forme `{ kind: OwnerKind; displayName: string; nodeId: NodeId }`.

#### Scenario: Owner valide
- **WHEN** un objet `{ kind: 'human', displayName: 'Guillaume', nodeId: <NodeId> }` est validé
- **THEN** la validation réussit

#### Scenario: Owner incomplet
- **WHEN** un `Owner` n'a pas de `nodeId`
- **THEN** la validation zod échoue

### Requirement: CapabilityCard identité et rôles
Une `CapabilityCard` SHALL porter `id: string` (ex. `"production.error_summary"`), `version: string` en semver, `owner: Owner`, `executorNodeId: NodeId` (qui exécute) et `approverNodeIds: NodeId[]` (qui peut approuver), cette liste MUST contenir au moins 1 élément.

#### Scenario: Aucun approbateur
- **WHEN** une `CapabilityCard` a `approverNodeIds: []`
- **THEN** la validation zod échoue

#### Scenario: Version non semver
- **WHEN** une `CapabilityCard` a `version: "v1"`
- **THEN** la validation zod échoue

### Requirement: CapabilityCard contenu de consentement
Une `CapabilityCard` SHALL porter `title: string` (phrase courte pour la carte de consentement, ex. `"Résumer les erreurs de production"`), `sensitivity: 'low' | 'high'`, `receives: string[]` (phrases lisibles : ce que le demandeur recevra) et `neverReceives: string[]` (phrases lisibles : ce qu'il ne recevra jamais).

#### Scenario: Sensibilité inconnue
- **WHEN** une `CapabilityCard` a `sensitivity: 'medium'`
- **THEN** la validation zod échoue

### Requirement: CapabilityCard schémas d'entrée et de sortie
Une `CapabilityCard` SHALL porter `inputSchema` et `outputSchema` de type JSON Schema, l'`inputSchema` étant dérivé du schéma zod de la capacité.

#### Scenario: Schémas présents
- **WHEN** une carte est construite pour une capacité
- **THEN** `inputSchema` et `outputSchema` sont des JSON Schema issus des schémas zod de cette capacité

### Requirement: CapabilityCard mode d'approbation
Une `CapabilityCard` SHALL porter `approval: 'always' | 'auto_low'`. En v1, la valeur par défaut MUST être `'always'`.

#### Scenario: Défaut v1
- **WHEN** une carte est construite sans préciser `approval`
- **THEN** `approval` vaut `'always'`

### Requirement: CapabilityCard limites de sortie et budget
Une `CapabilityCard` SHALL porter `maxOutputChars: number` (taille max de la sortie sérialisée) et `budget: { maxSeconds: number; maxUsd?: number; maxToolCalls?: number }`.

#### Scenario: Budget sans maxSeconds
- **WHEN** une carte a `budget: { maxUsd: 1 }`
- **THEN** la validation zod échoue car `maxSeconds` est obligatoire

### Requirement: États du cycle de vie d'un Drop
L'état d'un Drop SHALL être l'un de `proposed`, `awaiting_approval`, `denied`, `expired`, `not_now`, `approved`, `running`, `failed`, `in_review`, `delivered`, `receipted`.

#### Scenario: État inconnu
- **WHEN** un `drop_status` porte `state: 'cancelled'`
- **THEN** la validation zod échoue

### Requirement: Transitions du cycle de vie d'un Drop
Les transitions SHALL suivre `proposed → awaiting_approval → (denied | expired | not_now)` et `awaiting_approval → approved → running → (failed | in_review) → delivered → receipted`.

#### Scenario: Chemin nominal
- **WHEN** un Drop est autorisé, exécuté puis livré
- **THEN** il passe par `proposed`, `awaiting_approval`, `approved`, `running`, `delivered`, `receipted`

#### Scenario: Transition interdite
- **WHEN** un Drop en `awaiting_approval` tenterait de passer directement à `running`
- **THEN** la transition est refusée

### Requirement: État in_review réservé à la sensibilité haute
L'état `in_review` MUST n'exister que pour une capacité `sensitivity: 'high'` : l'approbateur y voit la sortie avant envoi.

#### Scenario: Capacité high
- **WHEN** un Drop d'une capacité `high` termine son exécution sans erreur
- **THEN** il passe en `in_review` avant `delivered`

#### Scenario: Capacité low
- **WHEN** un Drop d'une capacité `low` termine son exécution
- **THEN** il ne passe jamais par `in_review`

### Requirement: Paire de clés Ed25519
Chaque Node SHALL posséder une paire Ed25519 générée par `crypto_sign_keypair`, et son `NodeId` MUST valoir base64url(clé publique).

#### Scenario: Génération d'identité
- **WHEN** une identité de Node est créée
- **THEN** la paire vient de `crypto_sign_keypair` et `nodeId` vaut base64url de la clé publique

### Requirement: Dérivation X25519 pour le chiffrement
Pour chiffrer, un Node SHALL dériver sa paire X25519 de sa paire Ed25519 avec `crypto_sign_ed25519_pk_to_curve25519` et `crypto_sign_ed25519_sk_to_curve25519`.

#### Scenario: Clés de chiffrement dérivées
- **WHEN** un Node chiffre un message pour un pair
- **THEN** les clés X25519 utilisées sont dérivées des clés Ed25519 par ces deux fonctions

### Requirement: Format du fichier identity.json
`identity.json` SHALL contenir `{ nodeId, publicKey, secretKey, createdAt, displayName }` et MUST avoir le mode fichier `0600`.

#### Scenario: Fichier d'identité écrit
- **WHEN** l'identité est enregistrée
- **THEN** `identity.json` contient exactement ces champs et son mode est `0600`

### Requirement: Code d'invitation
`drop invite` SHALL produire un code d'invitation valant le base64url de `{ relayUrl, nodeId, displayName, oneTimeToken, expiresAt }`, avec une expiration de 15 min.

#### Scenario: Contenu du code
- **WHEN** on décode en base64url un code produit par `drop invite`
- **THEN** on obtient `relayUrl`, `nodeId`, `displayName`, `oneTimeToken` et `expiresAt`, et `expiresAt` est 15 min après l'émission

#### Scenario: Code expiré
- **WHEN** un `pair_request` utilise le `oneTimeToken` d'un code dont `expiresAt` est passé
- **THEN** l'invitant le rejette et ne répond pas `pair_accept`

### Requirement: Échange pair_request et pair_accept
`drop pair <code>` SHALL envoyer un `pair_request` signé portant le `oneTimeToken` ; l'invitant MUST valider le token puis répondre `pair_accept`.

#### Scenario: Appairage réussi
- **WHEN** `drop pair <code>` est lancé avec un code valide
- **THEN** l'invitant reçoit un `pair_request` signé avec le `oneTimeToken`, le valide et répond `pair_accept`

### Requirement: Enregistrement des pairs dans peers.json
Après appairage, les deux côtés SHALL écrire l'autre dans `peers.json` sous la forme `{ nodeId, displayName, ownerKind, pairedAt }`.

#### Scenario: Pairs enregistrés des deux côtés
- **WHEN** un appairage se termine par `pair_accept`
- **THEN** chaque Node a une entrée `{ nodeId, displayName, ownerKind, pairedAt }` pour l'autre dans son `peers.json`

### Requirement: Rejet des émetteurs inconnus
Un Node MUST rejeter toute enveloppe dont l'émetteur n'est pas dans `peers.json`, sauf un `pair_request` porteur d'un token valide.

#### Scenario: Émetteur inconnu
- **WHEN** un Node reçoit une enveloppe d'un `from` absent de `peers.json` qui n'est pas un `pair_request` à token valide
- **THEN** l'enveloppe est rejetée avec `E_UNKNOWN_PEER`

#### Scenario: Appairage depuis un inconnu
- **WHEN** un Node reçoit d'un émetteur inconnu un `pair_request` avec un `oneTimeToken` valide
- **THEN** l'enveloppe n'est pas rejetée pour émetteur inconnu

### Requirement: Champs de l'enveloppe
L'`Envelope` SHALL valider : `v` = littéral `1` ; `id` UUID (v7) ; `from` et `to` de type `NodeId` ; `ts` entier en ms epoch ; `exp` entier en ms epoch ; `nonce` base64url de 24 octets ; `body` chaîne ; `sig` chaîne.

#### Scenario: Version inconnue
- **WHEN** une enveloppe porte `v: 2`
- **THEN** la validation échoue avec `E_SCHEMA`

#### Scenario: ts non entier
- **WHEN** une enveloppe porte un `ts` décimal
- **THEN** la validation échoue avec `E_SCHEMA`

### Requirement: Borne de l'expiration d'enveloppe
Le champ `exp` d'une enveloppe MUST être inférieur ou égal à `ts + 15 min`.

#### Scenario: Expiration trop lointaine
- **WHEN** une enveloppe a `exp` = `ts` + 16 min
- **THEN** elle est invalide

### Requirement: Chiffrement du corps
`body` SHALL valoir le base64url de `crypto_box_easy(JSON du message, nonce, pk_to, sk_from)`, avec le `nonce` de l'enveloppe et les clés X25519 du destinataire et de l'émetteur.

#### Scenario: Déchiffrement par le destinataire
- **WHEN** le destinataire `to` déchiffre `body` avec `nonce`, la clé publique de `from` et sa clé secrète
- **THEN** il obtient le JSON du message d'origine

### Requirement: Type de message masqué au relais
Le `type` du message MUST se trouver uniquement dans le corps chiffré, de sorte que le relais ne puisse pas distinguer une requête d'un résultat.

#### Scenario: Enveloppe opaque
- **WHEN** on inspecte les champs en clair d'une enveloppe
- **THEN** aucun ne révèle le `type` du message

### Requirement: Signature de l'enveloppe
`sig` SHALL être une signature Ed25519 de l'émetteur sur `canonical({v,id,from,to,ts,exp,nonce,body})`.

#### Scenario: Enveloppe altérée
- **WHEN** un champ signé d'une enveloppe est modifié après signature
- **THEN** la vérification échoue avec `E_SIG`

#### Scenario: AC: vecteurs de test fixes pour la signature
- **WHEN** la suite de tests signe une enveloppe fixe avec une clé fixe
- **THEN** la signature produite est égale au vecteur de test attendu

### Requirement: Sérialisation canonical()
`canonical()` SHALL produire un JSON aux clés triées, sans espaces.

#### Scenario: Clés triées sans espaces
- **WHEN** on appelle `canonical({ b: 1, a: 2 })`
- **THEN** le résultat est `{"a":2,"b":1}`

#### Scenario: AC: vecteurs de test fixes pour canonical()
- **WHEN** la suite de tests applique `canonical()` à des entrées fixes
- **THEN** chaque sortie est égale octet pour octet au vecteur attendu

### Requirement: Ordre des vérifications à la réception
À la réception, un Node MUST vérifier dans cet ordre, chaque échec ayant un code stable : `E_SCHEMA` → `E_SIG` → `E_UNKNOWN_PEER` → `E_EXPIRED` → `E_REPLAY` → `E_DECRYPT` → `E_MESSAGE_SCHEMA`. La première vérification en échec détermine le code.

#### Scenario: AC: aller-retour signer, chiffrer, vérifier, déchiffrer
- **WHEN** un message est signé et chiffré par un Node puis vérifié et déchiffré par son pair
- **THEN** le pair retrouve le message d'origine

#### Scenario: AC: chaque code d'erreur dans l'ordre spécifié
- **WHEN** on fournit une enveloppe qui échoue à une étape donnée et réussit toutes les étapes précédentes, pour chacune des sept étapes
- **THEN** le code renvoyé est celui de cette étape, dans l'ordre `E_SCHEMA`, `E_SIG`, `E_UNKNOWN_PEER`, `E_EXPIRED`, `E_REPLAY`, `E_DECRYPT`, `E_MESSAGE_SCHEMA`

#### Scenario: Plusieurs défauts
- **WHEN** une enveloppe a une signature invalide et est aussi expirée
- **THEN** le code renvoyé est `E_SIG`

### Requirement: Condition E_EXPIRED
Une enveloppe MUST être rejetée avec `E_EXPIRED` si `exp` est passé ou si `ts` est à plus de 5 min dans le futur.

#### Scenario: exp passé
- **WHEN** une enveloppe arrive après son `exp`
- **THEN** elle est rejetée avec `E_EXPIRED`

#### Scenario: ts dans le futur
- **WHEN** une enveloppe a un `ts` à 6 min dans le futur
- **THEN** elle est rejetée avec `E_EXPIRED`

### Requirement: Protection contre le rejeu
Une enveloppe dont l'`id` a déjà été vu MUST être rejetée avec `E_REPLAY` ; le cache des `id` vus SHALL couvrir 30 min.

#### Scenario: Enveloppe rejouée
- **WHEN** la même enveloppe est reçue deux fois dans les 30 min
- **THEN** la seconde est rejetée avec `E_REPLAY`

### Requirement: Union discriminée des messages
Le corps déchiffré SHALL être une union discriminée sur `type`. Tous les messages MUST porter `dropId`, sauf les messages d'appairage (`pair_request`, `pair_accept`) et de catalogue (`catalog_request`, `catalog`).

#### Scenario: Type inconnu
- **WHEN** un corps déchiffré a un `type` hors de l'union
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: dropId manquant
- **WHEN** un `drop_result` n'a pas de `dropId`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

### Requirement: Messages pair_request et pair_accept
`pair_request` et `pair_accept` SHALL circuler entre le nouveau Node et l'invitant et porter `oneTimeToken`, `displayName` et `ownerKind`.

#### Scenario: Champs d'appairage
- **WHEN** un `pair_request` est validé
- **THEN** il contient `oneTimeToken`, `displayName` et `ownerKind`

### Requirement: Messages catalog_request et catalog
`catalog_request` SHALL aller du demandeur à l'exécuteur sans champ métier. `catalog` SHALL aller de l'exécuteur au demandeur avec `cards: CapabilityCard[]`, chaque carte MUST être signée par l'exécuteur.

#### Scenario: Catalogue signé
- **WHEN** un demandeur reçoit un `catalog`
- **THEN** chaque carte de `cards` porte une signature valide de l'exécuteur

### Requirement: Message drop_request
`drop_request` SHALL aller du demandeur à l'exécuteur avec `dropId`, `capabilityId`, `capabilityVersion`, `input` (JSON), `purpose` (≤ 140 car.) et `requestedBy` (`{ nodeId, displayName, agent: 'claude_code' | 'codex' | 'cursor' | 'other' }`).

#### Scenario: purpose trop long
- **WHEN** un `drop_request` a un `purpose` de 141 caractères
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: agent inconnu
- **WHEN** `requestedBy.agent` vaut `'copilot'`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

### Requirement: Message drop_status
`drop_status` SHALL aller de l'exécuteur au demandeur avec `dropId` et `state`, une valeur du cycle de vie d'un Drop.

#### Scenario: Statut transmis
- **WHEN** un Drop passe en `running`
- **THEN** le demandeur peut recevoir un `drop_status` avec `state: 'running'`

### Requirement: Message approval_request
`approval_request` SHALL aller de l'exécuteur à l'approbateur avec `dropId`, `card` (titre, `receives`, `neverReceives`, sensibilité), `inputPreview` (rendu lisible de l'entrée), `purpose`, `requestedBy` et `expiresAt`.

#### Scenario: Contenu de la demande d'approbation
- **WHEN** un approbateur reçoit un `approval_request`
- **THEN** il contient `dropId`, `card` (titre, `receives`, `neverReceives`, sensibilité), `inputPreview`, `purpose`, `requestedBy` et `expiresAt`

### Requirement: Message approval_decision
`approval_decision` SHALL aller de l'approbateur à l'exécuteur avec `dropId`, `decision: 'allow_once' | 'deny' | 'not_now'` et `decidedAt`.

#### Scenario: Décision inconnue
- **WHEN** un `approval_decision` porte `decision: 'allow_always'`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

### Requirement: Message review_request
`review_request` SHALL aller de l'exécuteur à l'approbateur avec `dropId` et `output`, cette sortie MUST être déjà validée et scannée avant envoi.

#### Scenario: Sortie relue déjà filtrée
- **WHEN** un approbateur reçoit un `review_request`
- **THEN** son `output` a déjà passé la validation de schéma et le scanner de secrets

### Requirement: Message review_decision
`review_decision` SHALL aller de l'approbateur à l'exécuteur avec `dropId`, `decision: 'send' | 'discard'` et `redactions?: string[]` (chemins JSON à retirer).

#### Scenario: Envoi avec retraits
- **WHEN** l'approbateur envoie `{ decision: 'send', redactions: ['/stack'] }`
- **THEN** le message est valide et désigne les chemins JSON à retirer

### Requirement: Message drop_result
`drop_result` SHALL aller de l'exécuteur au demandeur avec `dropId`, `output` et `outputSchemaHash`.

#### Scenario: Résultat livré
- **WHEN** un demandeur reçoit un `drop_result`
- **THEN** il contient `dropId`, `output` et `outputSchemaHash`

### Requirement: Message drop_error
`drop_error` SHALL aller de l'exécuteur au demandeur avec `dropId`, `code` parmi `E_DENIED`, `E_NOT_NOW`, `E_EXPIRED`, `E_BUDGET`, `E_OUTPUT_INVALID`, `E_SECRET_DETECTED`, `E_RUNNER`, et `message` lisible MUST NOT contenir de détail interne.

#### Scenario: Code hors liste
- **WHEN** un `drop_error` porte `code: 'E_FOO'`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: Pas de détail interne
- **WHEN** le runner échoue sur une exception interne
- **THEN** le `message` du `drop_error` est lisible et ne contient ni pile d'appels ni chemin interne

### Requirement: Message receipt
Le message `receipt` SHALL aller de l'exécuteur au demandeur et à l'approbateur et porter un `Receipt`.

#### Scenario: Reçu diffusé
- **WHEN** un Drop se termine
- **THEN** l'exécuteur envoie un `receipt` au demandeur et un à l'approbateur

### Requirement: Sémantique de not_now
`not_now` SHALL être un refus poli : le demandeur MUST recevoir `E_NOT_NOW` et peut redemander plus tard.

#### Scenario: Pas maintenant puis nouvelle demande
- **WHEN** l'approbateur décide `not_now`
- **THEN** le demandeur reçoit un `drop_error` `E_NOT_NOW` et un nouveau `drop_request` pour la même capacité reste accepté

### Requirement: Champs d'identification du reçu
Un `Receipt` SHALL porter `dropId`, `capabilityId`, `capabilityVersion`, `requester: NodeId`, `executor: NodeId` et `approver: NodeId`.

#### Scenario: Reçu identifié
- **WHEN** un `Receipt` est validé
- **THEN** il contient ces six champs

### Requirement: Hash d'entrée et de sortie du reçu
Un `Receipt` SHALL porter `inputHash`, le SHA-256 en hex du JSON canonique de l'entrée, et `outputHash` optionnel.

#### Scenario: inputHash calculé
- **WHEN** un reçu est produit pour une entrée `input`
- **THEN** `inputHash` vaut SHA-256 hex de `canonical(input)`

### Requirement: Décision et relecture du reçu
Un `Receipt` SHALL porter `decision` parmi `'allow_once'`, `'deny'`, `'not_now'`, `'expired'` et `reviewed: boolean`.

#### Scenario: Reçu d'un Drop expiré
- **WHEN** un Drop expire sans décision
- **THEN** son reçu a `decision: 'expired'`

### Requirement: Outils, coût et horodatages du reçu
Un `Receipt` SHALL porter `toolCalls: { name: string; count: int }[]`, `costUsd` optionnel et `timestamps: { requested, decided, started, finished, delivered }`, chaque horodatage étant optionnel selon l'issue.

#### Scenario: Reçu d'un refus
- **WHEN** un Drop est refusé
- **THEN** le reçu est valide sans `started`, `finished` ni `delivered`

### Requirement: Signature du reçu
Un `Receipt` SHALL porter `sig`, la signature de l'exécuteur.

#### Scenario: Reçu falsifié
- **WHEN** un champ d'un reçu est modifié après signature
- **THEN** la vérification de `sig` avec la clé de l'exécuteur échoue

### Requirement: Aucun contenu dans le reçu
Un `Receipt` MUST NOT contenir de contenu d'entrée ou de sortie : seulement des hash.

#### Scenario: Reçu sans contenu
- **WHEN** on inspecte un reçu produit pour un Drop livré
- **THEN** il ne contient ni l'entrée ni la sortie, seulement `inputHash` et `outputHash`

### Requirement: Taille maximale d'enveloppe
Une enveloppe MUST NOT dépasser 256 Ko. Au-delà, l'émetteur MUST échouer avec `E_TOO_LARGE` avant l'envoi.

#### Scenario: Enveloppe trop grosse
- **WHEN** un Node prépare une enveloppe de plus de 256 Ko
- **THEN** il échoue avec `E_TOO_LARGE` et n'envoie rien

### Requirement: Taille maximale de sortie par capacité
Chaque capacité SHALL déclarer sa propre taille max de sortie (ex. 1 500 caractères pour `repo.answer`).

#### Scenario: Limite déclarée
- **WHEN** on lit la carte d'une capacité publiée
- **THEN** elle déclare sa propre taille max de sortie (`maxOutputChars`)
