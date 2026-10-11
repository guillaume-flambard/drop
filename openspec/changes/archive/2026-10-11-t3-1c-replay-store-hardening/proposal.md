# Proposal

## Why

T3.1c ferme un constat CSO de gravité HIGH : sous des demandes valides répétées, le Node garde indéfiniment les objets d'exécution terminés et peut épuiser sa mémoire. Le même problème existe côté demandeur pour l'historique des demandes.

## What Changes

- Fixer un plafond pour les demandes conservées en mémoire côté exécuteur et demandeur.
- Purger les issues terminées sans rouvrir un identifiant reçu ni effacer une demande encore active.
- Refuser explicitement une nouvelle demande lorsque toutes les places sont occupées par des demandes actives.
- Garder un historique local récent borné pour le panneau et documenter sa rétention.
- Borner également la boîte d'approbation, la file hors ligne et le cache des enveloppes ; un refus explicite du relais ne doit pas immobiliser une place active.
- Empêcher qu'un pair remplace une carte de consentement existante avec le même identifiant et conserver l'ordre réel de la file pendant une reconnexion concurrente.
- Pour une clé plafonnée facultative, conserver un hash borné et réessayer une révocation refusée par le fournisseur ; distinguer tentative et confirmation.

## Non-goals

- T3.1b garde la persistance anti-rejeu sur disque et le quota du relais ; sa revue formelle reste séparée.
- T3.1d traite la compatibilité des erreurs protocole. T3.1e traitera le coût des admissions, les quotas disque par pair, la récupération et Windows. T3.5 garde la preuve privée d'ensemble.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `node` : bornes mémoire et comportement observable lorsque la capacité est atteinte.
- `protocol` : plafond du cache anti-rejeu des enveloppes, avec refus fermé à saturation.

## Impact

`packages/node/src/engine.ts`, `packages/node/src/funding.ts`, `packages/protocol/src/envelope.ts`, l'API locale `/drops` et `/ask`, leurs tests, les specs `node`/`protocol` et le guide du profil privé. Aucune dépendance nouvelle.
