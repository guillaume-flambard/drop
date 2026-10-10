## ADDED Requirements

### Requirement: Message lan_key
Le message `lan_key` SHALL porter `key`, exactement 32 octets encodés en base64url (43 caractères), et voyager dans une enveloppe chiffrée et signée comme tout message.

#### Scenario: AC: clé de découverte au bon format
<!-- openspec-guard:test="local network privacy (T4.2c) > carries a discovery key only as a 32-byte value" -->
- **WHEN** un `lan_key` porte 32 octets, puis 31, puis une chaîne quelconque
- **THEN** seul le premier est valide
