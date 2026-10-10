## Context

Le grilling du 10 octobre 2026 a fixé la cible (D47 à D58). Trois recherches l'ont nourri : douleurs des entreprises multi-agents et concurrents, connexion pair à pair et entreprise, modes d'interaction A2A et contexte partagé. Leurs sources sont citées dans le PRD et le TRD.

## Goals / Non-Goals

**Goals :** un jeu de documents produit cohérent, vrai et vérifiable, qui sert de base aux tâches T4.1 à T4.13.

**Non-Goals :** voir la proposal.

## Decisions

- Chaque document sépare trois statuts, marqués explicitement : **Existant** (avec chemin et preuve), **Visé** (avec la tâche T4.* ou T3.* qui le livre), **Hypothèse** (avec le critère qui la confirme ou l'invalide).
- Aucun document ne recopie une exigence normative : il cite la spec (`openspec/specs/<capacité>/spec.md`). Aucun ne recopie l'ordre : il cite `docs/TASKS.md`.
- Français, sans tiret cadratin ni demi-cadratin, phrases simples.
- Le PRD remplacera la vision et PRODUCT.md, et le TRD remplacera l'architecture descriptive, mais seulement en T4.0a, quand ces fichiers seront réécrits ou réduits à un renvoi.

## Risks / Trade-offs

- Risque de doublon avec la vision et PRODUCT.md tant que T4.0a n'est pas faite. Mitigation : chaque nouveau document l'annonce en tête, et T4.0a suit immédiatement.
- Risque d'affirmer comme existant ce qui ne l'est pas. Mitigation : chaque « Existant » cite un chemin de code, un test ou une preuve archivée ; la vérification finale relit chaque affirmation.
