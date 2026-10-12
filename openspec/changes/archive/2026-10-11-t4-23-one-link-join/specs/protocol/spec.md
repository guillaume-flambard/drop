## MODIFIED Requirements

### Requirement: Code d'invitation
`drop invite` SHALL produire un code d'invitation valant le base64url de `{ relayUrl, nodeId, displayName, oneTimeToken, expiresAt, admission?, team?, iroh?, sig }`, avec une expiration de 24 h : c'est un lien envoyé par message, ouvert plus tard (D26). `sig` MUST signer en Ed25519, par la clé de `nodeId`, le JSON canonique des autres champs (D95). Un code non signé, modifié, expiré ou piégé MUST être refusé avec un code stable (`E_INVITE`, `E_INVITE_EXPIRED`, `E_INVITE_SIG`).

#### Scenario: Contenu du code
<!-- openspec-guard:test="cards, receipts, invites, lifecycle, schemas > encodes invites that expire after a day" -->
- **WHEN** on décode en base64url un code produit par `drop invite`
- **THEN** on obtient `relayUrl`, `nodeId`, `displayName`, `oneTimeToken`, `expiresAt`, un ticket `admission` et `sig`, et `expiresAt` est 24 h après l'émission

#### Scenario: AC: invitation modifiée refusée
<!-- openspec-guard:test="invites (T4.23) > signs every field with the inviter node and refuses a modified invite (E_INVITE_SIG)" -->
- **WHEN** le relais, le nom, l'équipe, la date ou le `nodeId` d'une invitation change après sa signature
- **THEN** sa vérification échoue avec `E_INVITE_SIG`, et une invitation sans signature échoue avec `E_INVITE`

#### Scenario: AC: invitation expirée refusée
<!-- openspec-guard:test="invites (T4.23) > refuses an expired invite, or one meant to outlive a day (E_INVITE_EXPIRED)" -->
- **WHEN** une invitation est présentée 24 h après son émission, ou porte une date au delà de 24 h
- **THEN** elle est refusée avec `E_INVITE_EXPIRED`

#### Scenario: AC: invitation piégée refusée
<!-- openspec-guard:test="invites (T4.23) > refuses malformed codes, unsafe names and an admission sponsored by another node (E_INVITE)" -->
- **WHEN** le code est illisible ou trop long, le nom porte une marque bidirectionnelle, le relais n'est pas en `ws:` ou `wss:`, ou le ticket d'admission vient d'un autre Node
- **THEN** l'invitation n'est pas créée ou est refusée avec `E_INVITE`

## ADDED Requirements

### Requirement: Lien pour rejoindre
Le lien à envoyer SHALL être `https://drop.memolabs.dev/join#<code>` (ou la page `joinPage` de la configuration) : le code dans le fragment seulement, qu'aucun navigateur n'envoie au serveur. Le Node SHALL lire une invitation donnée sous forme de code, de lien de la page, de `drop://join?invite=<code>` ou de `drop://pair?code=<code>`, et refuser toute autre forme avec `E_INVITE`.

#### Scenario: AC: code lu depuis chaque forme de lien
<!-- openspec-guard:test="invites (T4.23) > reads the invite out of a code, a join link, drop://join and drop://pair" -->
- **WHEN** la personne colle le code, le lien de la page, un lien `drop://join` ou `drop://pair`
- **THEN** le Node en tire le même code, et refuse un lien `drop://link`, une page sans fragment ou un texte quelconque

### Requirement: Relais admissible
Un relais SHALL être admissible si c'est `ws:` vers une adresse privée ou de bouclage littérale, ou `wss:` vers une telle adresse ou un nom DNS, sans identifiants, requête ni fragment, sans adresse publique littérale ni écriture non canonique, en 512 caractères au plus (T4.23, D95).

#### Scenario: AC: relais admis et refusés
<!-- openspec-guard:test="invites (T4.23) > allows ws relays on private addresses only and wss relays by DNS name" -->
- **WHEN** on teste `wss://drop.memolabs.dev/v1`, `ws://127.0.0.1:7780/v1`, puis `ws://drop.memolabs.dev/v1`, `wss://8.8.8.8/v1`, un relais avec identifiants, requête ou fragment, `localhost` ou une adresse hexadécimale
- **THEN** les deux premiers sont admissibles, les autres non
