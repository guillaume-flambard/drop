## MODIFIED Requirements

### Requirement: Code d'invitation
`drop invite` SHALL produire un code d'invitation valant le base64url de `{ relayUrl, nodeId, displayName, oneTimeToken, expiresAt, admission?, team?, iroh?, sig }`, avec une expiration de 24 h : c'est un lien envoyé par message, ouvert plus tard (D26). `sig` MUST signer en Ed25519, par la clé de `nodeId`, les autres champs (D95), sous un domaine propre (T4.33). Un code non signé, modifié, expiré ou piégé MUST être refusé avec un code stable (`E_INVITE`, `E_INVITE_EXPIRED`, `E_INVITE_SIG`).

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

### Requirement: Domaine de signature des invitations
La signature d'une invitation SHALL porter sur `drop-invite-v1|` suivi du JSON canonique des autres champs, comme la politique d'organisation signe sous `drop-policy-v1|` : aucune autre signature drop ne peut passer pour une invitation (T4.33). Une signature sans ce domaine MUST être refusée avec `E_INVITE_SIG`.

#### Scenario: AC: signature sous le domaine des invitations
<!-- openspec-guard:test="invite hardening (T4.33) > signs under the drop-invite-v1| domain: a bare or foreign-domain signature does not verify (E_INVITE_SIG)" -->
- **WHEN** une invitation porte la signature de son Node sur le JSON canonique nu (format de T4.23), ou sur ce JSON précédé d'un autre domaine comme `drop-policy-v1|`
- **THEN** elle est refusée avec `E_INVITE_SIG`, et seule la signature précédée de `drop-invite-v1|` est acceptée

### Requirement: Codes de verrou et de conflit
`ERROR_CODES` SHALL contenir `E_LOCKED` et `E_CONFLICT`, que le Node rend quand `config.json` est verrouillé par une autre opération ou a changé pendant sa réécriture (T4.33).

#### Scenario: AC: verrou et conflit dans la liste
<!-- openspec-guard:test="invite hardening (T4.33) > lists E_LOCKED and E_CONFLICT among the stable error codes" -->
- **WHEN** on lit `ERROR_CODES`
- **THEN** la liste contient `E_LOCKED` et `E_CONFLICT`
