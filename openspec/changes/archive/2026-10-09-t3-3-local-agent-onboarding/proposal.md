## Why

Le panneau installe actuellement drop dans un agent en un clic, sans aperçu fiable ni protection contre une modification concurrente de sa configuration. T3.3 doit rendre le raccordement local compréhensible et sûr avant de passer à l'app Mac distribuée.

## What Changes

- Analyser séparément les quatre adaptateurs connus, sans exécuter leurs serveurs MCP ni transmettre leurs configurations.
- Montrer un aperçu expurgé des ajouts et permettre de choisir les agents avant une seconde confirmation.
- Appliquer chaque changement avec contrôle de fraîcheur, détection des conflits, écriture ciblée et résultat par agent.
- Offrir la déconnexion sélective, les états de relance et d'équipe, et une voie manuelle pour un agent non pris en charge.

## Capabilities

### Modified Capabilities

- `node`: analyse locale, installation et retrait du connecteur.
- `owner-app`: parcours à deux confirmations dans le panneau local.
- `requester-mcp`: contrat historique de `drop install` adapté aux sauvegardes privées bornées et aux CLI sans retrait préalable.

## Impact

`packages/node` (service, API, panneau, tests), specs `node` et `owner-app`, guide de raccordement. Aucune publication de capacité ni nouvelle dépendance. Le catalogue existant reste inchangé lors du raccordement.

## Non-goals

Découverte universelle, exécution des outils découverts, sélection du modèle, invitation d'équipe, distribution Mac signée et publication automatique.
