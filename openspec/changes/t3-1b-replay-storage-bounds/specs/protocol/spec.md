## MODIFIED Requirements

### Requirement: Message drop_request
`drop_request` SHALL aller du demandeur à l'exécuteur avec `dropId`, `capabilityId`, `capabilityVersion`, `input` (JSON), `purpose` (≤ 140 car.) et `requestedBy` (`{ nodeId, displayName, agent: 'claude_code' | 'codex' | 'cursor' | 'other' }`). Le `dropId` d'une nouvelle demande MUST être un UUIDv7 horodaté ; un UUID d'une autre version MUST être rejeté avant tout consentement. Les lettres hexadécimales d'un UUIDv7 MUST être normalisées en minuscules avant l'admission et le stockage anti-rejeu.

#### Scenario: purpose trop long
- **WHEN** un `drop_request` a un `purpose` de 141 caractères
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: agent inconnu
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

### Requirement: Message drop_error
`drop_error` SHALL aller de l'exécuteur au demandeur avec `dropId`, `code` parmi `E_SCHEMA`, `E_DENIED`, `E_NOT_NOW`, `E_EXPIRED`, `E_RATE`, `E_BUDGET`, `E_OUTPUT_INVALID`, `E_SECRET_DETECTED`, `E_RUNNER`, et `message` lisible MUST NOT contenir de détail interne.

#### Scenario: Code hors liste
- **WHEN** un `drop_error` porte `code: 'E_FOO'`
- **THEN** il est rejeté avec `E_MESSAGE_SCHEMA`

#### Scenario: Pas de détail interne
- **WHEN** le runner échoue sur une exception interne
- **THEN** le `message` du `drop_error` est lisible et ne contient ni pile d'appels ni chemin interne

#### Scenario: AC: quota local explicite
<!-- openspec-guard:test="private replay admission > refuses an old drop before consent and reports a corrupt replay store as E_RATE" -->
- **WHEN** le Node refuse une demande parce que le stockage anti-rejeu est plein
- **THEN** le demandeur reçoit un `drop_error` `E_RATE` sans détail interne
