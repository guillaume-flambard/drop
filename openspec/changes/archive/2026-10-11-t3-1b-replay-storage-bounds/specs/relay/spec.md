## MODIFIED Requirements

### Requirement: Limite de débit par Node
Le relais MUST limiter chaque Node authentifié à `rateLimitPerMinute` tentatives par minute (60 par défaut) à travers ses reconnexions, y compris les trames malformées ou trop grandes. Une tentative hors quota MUST recevoir `E_RATE`, sauf si WebSocket a déjà fermé la connexion pour dépassement de `maxPayload` ; cette trame MUST néanmoins compter pour l'identité authentifiée.

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

#### Scenario: AC: trame rejetée par WebSocket comptée
<!-- openspec-guard:test="relay > counts a frame rejected by the WebSocket payload limit before reconnect" -->
- **WHEN** un Node authentifié envoie une trame au-delà de la limite WebSocket et se reconnecte dans la même minute avec un quota d'une tentative
- **THEN** la connexion initiale est fermée sans interrompre le relais et l'enveloppe suivante reçoit `E_RATE`

#### Scenario: AC: trame mal encodée rejetée par WebSocket comptée
<!-- openspec-guard:test="relay > counts invalid UTF-8 frames rejected by WebSocket before reconnect" -->
- **WHEN** un Node authentifié envoie une trame texte UTF-8 invalide puis se reconnecte dans la même minute avec un quota d'une tentative
- **THEN** la connexion initiale est fermée et l'enveloppe suivante reçoit `E_RATE`

## ADDED Requirements

### Requirement: Refus de quota sans identifiant corrélable
Le relais MUST fermer la connexion après un refus `E_RATE` afin de libérer les envois en attente, même si le préfixe lu contient un identifiant qui pourrait être trompeur.

#### Scenario: AC: refus de quota sans identifiant corrélable
<!-- openspec-guard:test="relay > closes an exhausted connection when a valid frame has an uncorrelatable late id" -->
- **WHEN** une enveloppe valide hors quota place son identifiant après le préfixe lu par le relais
- **THEN** le relais envoie `E_RATE` puis ferme la connexion pour libérer les envois en attente

#### Scenario: AC: identifiant trompeur avant l'enveloppe
<!-- openspec-guard:test="relay > closes an exhausted connection even when a decoy id appears before the envelope id" -->
- **WHEN** une trame hors quota contient un autre identifiant avant celui de l'enveloppe
- **THEN** le relais ferme la connexion après `E_RATE`, sans laisser l'envoi réel en attente
