## Why

La revue adverse de T4.2b l'a relevé, et la lecture du code le confirme : `openEnvelope` inscrit dans le cache anti-rejeu l'identifiant de toute enveloppe signée qui passe la signature et l'expiration, avant de savoir si un expéditeur inconnu apporte un appairage ou une liaison valides. Or ce cache est commun à tous les pairs et borné à 65 536 entrées ; une fois plein, il refuse tout (`E_REPLAY`) pendant 30 min.
- Un Node pendant une invitation vivante (24 h) peut ainsi être rendu sourd à tous ses pairs par un inconnu.
- La passerelle l'est en permanence, puisqu'elle accepte toujours une liaison d'un nœud inconnu.
- Chaque contrôle parcourt en plus tout le cache pour en retirer les entrées expirées, ce qui multiplie le coût d'une inondation.

Choix de Guillaume le 10 octobre 2026 (« oui aux 4 ») ; décision D78.

## What Changes

- **protocol** : pour un expéditeur inconnu, l'étape `E_REPLAY` vérifie seulement si l'identifiant est déjà connu ; il n'est retenu qu'une fois la demande d'appairage ou de liaison acceptée. L'ordre des vérifications ne change pas. La purge s'arrête à la première entrée encore valide.
- **node** et **gateway** : bénéficient du changement par `openEnvelope` ; le Node expose la taille du cache dans `memoryStats`, la passerelle aussi.

## Capabilities

### Modified Capabilities

- `protocol` : protection contre le rejeu.

## Non-goals

- Borne mémoire des états du Node et du cache : T3.1c.
- Quota par pair connu : un pair connu reste limité par le relais et par son appairage.
- Le budget des inconnus de T4.2b (10 enveloppes par minute) reste, en défense supplémentaire.

## Impact

`packages/protocol/src/envelope.ts`, `packages/node/src/engine.ts`, `packages/gateway/src/bridge.ts`, tests.
