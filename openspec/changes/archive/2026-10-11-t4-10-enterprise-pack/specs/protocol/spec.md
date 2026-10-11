## ADDED Requirements

### Requirement: Politique d'entreprise signée
Une politique SHALL porter `v`, `policyId`, `version`, `issuer`, `issuedAt`, `expiresAt`, `relays`, `requireInternalRelay`, `gateways` et, facultatifs, `allowedClients` et `allowedProviders`. Elle MUST être signée en Ed25519 par `issuer` sur `drop-policy-v1|` suivi de sa forme canonique ; toute modification ou un autre émetteur MUST la rendre invalide. Son empreinte SHALL être le SHA-256 de la forme canonique de `{ policy, sig }`.

#### Scenario: AC: politique signée et vérifiée
<!-- openspec-guard:test="enterprise policy (T4.10) > signs a policy, verifies it against its issuer and refuses any change" -->
- **WHEN** une politique est signée, puis vérifiée avec son émetteur, avec un autre émetteur, et après la modification d'un champ
- **THEN** seule la première vérification réussit, et l'empreinte change avec la politique
