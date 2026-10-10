## 1. Tests d'abord

- [x] 1.1 Node : propriétaire désigné, ambiguïté refusée, `/capabilities` et `POST /drops`.
- [x] 1.2 Node : `ask_team` vise chaque propriétaire d'une capacité partagée.
- [x] 1.3 requester-mcp : `owner_node_id` dans `request_drop` et `request_drops`, refus d'un identifiant ambigu.

## 2. Réalisation

- [x] 2.1 Catalogue, `requestDrop`, API, routage, A2A entrant.
- [x] 2.2 Outils et client de requester-mcp.

## 3. Vérification

- [x] 3.1 lint, typecheck, test, `openspec validate --strict`, openspec-guard, revue adverse, `/cso`.
