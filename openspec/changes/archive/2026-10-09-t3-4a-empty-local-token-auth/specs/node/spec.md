# Spec Delta

## MODIFIED Requirements

### Requirement: Jeton de l'API locale
L'API locale MUST exiger un jeton aléatoire non vide, écrit dans `DROP_HOME/local-token` en mode `0600` et présenté dans l'en-tête `Authorization: Bearer`, ou dans `?token=` pour l'UI et son flux SSE. Toute requête sans jeton valide MUST être refusée. `drop serve` MUST refuser de démarrer l'API locale si ce fichier est absent, vide ou réduit à des espaces ; il MUST signaler une erreur stable sans journaliser le jeton.

#### Scenario: AC: requête sans jeton refusée
<!-- openspec-guard:test="refuses a request without the token" -->
- **WHEN** une requête arrive sur l'API locale sans en-tête `Authorization: Bearer <jeton>` valide
- **THEN** elle est refusée (test)

#### Scenario: Fichier du jeton
<!-- openspec-guard:test="creates a local token with owner-only permissions" -->
- **WHEN** `drop serve` crée le jeton
- **THEN** `DROP_HOME/local-token` existe en mode `0600`

#### Scenario: AC: jeton local absent ou vide au démarrage
<!-- openspec-guard:test="refuses to start with a missing or empty local token" -->
- **WHEN** `drop serve` trouve `DROP_HOME/local-token` absent, vide ou composé uniquement d'espaces
- **THEN** il échoue avec `E_TOKEN` avant de lancer le relais ou d'ouvrir l'API locale, sans imprimer le contenu du fichier

#### Scenario: AC: présentation vide refusée
<!-- openspec-guard:test="rejects missing and empty presented tokens" -->
- **WHEN** un client appelle l'API, l'UI ou le flux SSE sans jeton, avec un `Bearer` vide ou avec `?token=` vide
- **THEN** la requête est refusée, même si la configuration du serveur est invalide ou vide

#### Scenario: AC: jeton valide préservé
<!-- openspec-guard:test="preserves authenticated local API and panel access" -->
- **WHEN** `drop serve` possède un jeton non vide et le client présente cette valeur
- **THEN** l'API et le panneau local restent accessibles selon leurs règles existantes
