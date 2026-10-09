# Proposal

## Why

T3.1a évalue Hermes comme demandeur MCP après le socle privé. Le propriétaire demande de continuer les chantiers ; cette évaluation doit distinguer compatibilité de transport, comportement d’un agent et qualification d’un vrai modèle.

## What Changes

- Recette reproductible isolée avec Hermes amont épinglé, connecteur stdio Drop et deux Nodes privés.
- Essais accord, refus, expiration et panne, avec preuves expurgées et observation réseau.
- Rapport de compatibilité, licence, maintenance et retrait ; aucun adaptateur automatique annoncé.

## Capabilities

### New Capabilities
Aucune.

### Modified Capabilities
Aucune : évaluation/outillage sans modification du contrat runtime ; skip_specs: true. Les contrats requester-mcp et node existants s’appliquent.

## Impact

Scripts de preuve, documentation et index. Dépendances Hermes isolées du runtime Drop, aucune installation personnelle ni service externe imposé. Aucun secret ou mémoire personnelle collecté.

## Non-goals

Qualité d’un modèle réel (T3.2), détection/raccordement groupé (T3.3), distribution signée (T3.4), ajout d’un provider SDK (T3.2a). Pas d’orchestrateur Hermes dans le runner.
