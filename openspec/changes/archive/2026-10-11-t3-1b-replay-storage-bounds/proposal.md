# Proposal

## Why

T3.1b corrige un défaut critique confirmé par la revue de T3.1a : un pair admis peut provoquer l’écriture permanente de fichiers de demandes avant même une approbation. La limite du relais est perdue à chaque reconnexion. La croissance doit être bornée sans réutiliser un consentement après redémarrage.

## What Changes

- Exiger un `dropId` UUIDv7 récent sur les nouvelles demandes, puis rejeter les identifiants périmés avant le consentement. **BREAKING** pour les clients tiers émettant un UUIDv4 ; les clients Drop intégrés produisent déjà UUIDv7.
- Expirer les marqueurs après la fenêtre de fraîcheur, avec horloge persistante anti-retour, plafond de stockage et refus explicite lorsque ce plafond est atteint.
- Appliquer `rateLimitPerMinute` à l’identité authentifiée du Node, indépendamment des reconnexions au même relais.
- Ajouter des scénarios de reprise, saturation, horloge, doublons et reconnexion, ainsi que le guide de migration.

## Non-goals

Pas de modèle ou adaptateur agent (T3.2/T3.3), pas de publication externe, ni de modification de l’évaluation Hermes T3.1a hors actualisation de son statut après correction.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `protocol` : validité temporelle des identifiants de `drop_request` et code `E_RATE` pour quota local.
- `node` : anti-rejeu durable et borné, y compris après redémarrage et retour d’horloge.
- `relay` : fenêtre de débit portée par l’identité authentifiée plutôt que par la connexion.

## Impact

`packages/protocol`, `packages/node`, `packages/relay`, leurs tests, specs et guides. Aucun nouveau paquet ni service requis. Les nœuds existants migrent leurs marqueurs locaux sans toucher à l’identité, aux reçus ou aux clés.
