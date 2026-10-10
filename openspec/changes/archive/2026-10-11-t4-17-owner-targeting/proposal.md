## Why

Trouvé par le banc de simulation de T4.1 : `POST /drops`, l'outil `request_drop` et le routage de `ask_team` et de l'A2A entrant prenaient la première entrée du catalogue qui porte l'identifiant demandé. Un partage s'appelle `mcp.answer.figma` chez tout le monde : si Julie et Marc partagent chacun leur Figma, une demande pour Marc pouvait partir chez Julie. Choix de Guillaume le 11 octobre 2026 (« oui ») ; décision D80.

## What Changes

- **node** : le catalogue local et `/capabilities` donnent l'identifiant du propriétaire (`owner_node_id`, l'`executorNodeId` vérifié de la carte). `POST /drops` accepte `ownerNodeId`. Sans lui, un identifiant publié par plusieurs pairs est refusé (409 `E_AMBIGUOUS_CAPABILITY`, avec la liste des propriétaires). Chaque route d'`ask_team` et de l'A2A entrant vise son propre propriétaire.
- **requester-mcp** : `request_drop` et `request_drops` acceptent `owner_node_id` ; `list_capabilities` le montre ; un identifiant ambigu est refusé avant tout envoi, avec les propriétaires possibles.

## Capabilities

### Modified Capabilities

- `node` : désignation du propriétaire.
- `requester-mcp` : désignation du propriétaire.

## Non-goals

- Changer le protocole : la carte porte déjà `executorNodeId`, vérifié à la réception du catalogue, et l'enveloppe est adressée au propriétaire.
- Renommer les identifiants de partage.

## Impact

`packages/node/src/engine.ts`, `api.ts`, `route.ts`, `a2a-inbound.ts`, `packages/requester-mcp/src/client.ts`, `tools.ts`, tests.
