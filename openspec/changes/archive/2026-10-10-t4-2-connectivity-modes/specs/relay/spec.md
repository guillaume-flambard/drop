## ADDED Requirements

### Requirement: Défi signé seulement au format attendu
Le Node MUST NOT signer pour un relais autre chose qu'un défi de 32 octets encodé en base64url ; tout autre texte reçu comme défi est ignoré. Ainsi un relais ne peut pas obtenir une preuve de session locale, un ticket ou un reçu signé.

#### Scenario: AC: défi hors format ignoré
<!-- openspec-guard:test="relay > signs only a 32-byte challenge, never another text a relay sends" -->
- **WHEN** un relais envoie comme défi un texte qui n'est pas 32 octets en base64url, puis un défi conforme
- **THEN** le Node ne répond qu'au défi conforme
