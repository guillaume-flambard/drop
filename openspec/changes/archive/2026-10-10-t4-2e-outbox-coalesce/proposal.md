## Why

Relevé par la revue adverse de T4.2b : les messages qui annoncent un état (`lan_key`, `iroh_addr`, et aussi `team_roster`, `catalog`) sont mis en file pour un pair absent comme n'importe quel message. La file est bornée à 1 024 enveloppes et évince la plus ancienne. Un nœud qui change souvent d'adresse, avec plusieurs pairs absents, peut ainsi évincer de vraies demandes et réponses au profit d'états périmés. Choix de Guillaume le 10 octobre 2026 (« oui ») ; décision D79.

## What Changes

- **node** : pour un même pair, la file ne garde que le dernier message de chacun des types d'état d'une liste fermée (`lan_key`, `iroh_addr`, `team_roster`, `catalog`). Un nouveau remplace l'ancien au lieu de s'ajouter ; un ancien qui revient d'un envoi raté ne remplace jamais un plus récent.

## Capabilities

### Modified Capabilities

- `node` : file d'envoi.

## Non-goals

- Changer la taille de la file ou son ordre pour les autres messages.
- Fusionner des messages qui portent une demande, une décision ou un résultat.

## Impact

`packages/node/src/engine.ts`, tests.
