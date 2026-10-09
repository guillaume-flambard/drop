## MODIFIED Requirements

### Requirement: Limite de débit par Node
Le relais MUST limiter chaque identité de Node authentifiée à 60 tentatives d'envoi d'enveloppe par minute (`rateLimitPerMinute`), y compris les enveloppes rejetées pour taille excessive, indépendamment de ses connexions WebSocket successives au même processus relais. Au-delà, l'enveloppe MUST être rejetée avec `{ error: 'E_RATE' }`.

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
