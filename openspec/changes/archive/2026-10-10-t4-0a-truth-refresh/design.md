## Context

T4.0 a fixé la référence descriptive dans `docs/product/` et listé les contradictions (APP_FLOW §6, revue adverse T4.0).

## Decisions

- `vision.md` et `architecture.md` restent, parce que `openspec/config.yaml` et AGENTS.md les citent ; ils deviennent des résumés courts qui renvoient au PRD et au TRD. Le contexte OpenSpec cite désormais `docs/product/`.
- PRODUCT.md reste au format lu par le skill impeccable, aligné sur le PRD et l'UX/UI.
- Le scénario de démonstration du guide garde Julie sur un dépôt de code, ce que fait réellement la démo (`repo.answer`) ; PRODUCT.md et le PRD présentent Figma comme un scénario visé, sans le confondre avec la démo.
- Le site décrit l'existant et le visé avec les mêmes statuts que le PRD.

## Risks / Trade-offs

- Les pages du site peuvent sur-promettre par habitude marketing. Mitigation : relecture adverse dédiée, chaque promesse renvoyée au PRD.
