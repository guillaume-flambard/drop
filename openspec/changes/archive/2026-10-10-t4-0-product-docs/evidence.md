# Preuves T4.0

| Critère | Preuve |
|---|---|
| AC-P0-1 PRD | `docs/product/PRD.md` : problème, cible, positionnement, concurrents, promesse et limite, échelle des échanges, hypothèses H1 à H6 avec critères, mesures, hors périmètre, risques. |
| AC-P0-2 TRD | `docs/product/TRD.md` : architecture actuelle et visée, modes de connexion D53, sécurité, politique D54, modèles, simulation D56, dépendances candidates. |
| AC-P0-3 Parcours | `docs/product/APP_FLOW.md` : personas, quatorze parcours avec chemins d'échec, trois diagrammes, écarts E1 à E7. |
| AC-P0-4 UX/UI | `docs/product/UX_UI.md` : principes D46, écrans existants tirés du code, écrans visés par tâche, accessibilité, jetons de design. |
| AC-P0-5 Schéma | `docs/product/BACKEND_SCHEMA.md` : dix-sept messages avec leurs lignes zod, stockage local et relais, schémas cibles marqués comme propositions avec leur tâche. |
| AC-P0-6 Plan | `docs/product/IMPLEMENTATION_PLAN.md` : phases P0 à P5, sorties par phase, graphe aligné sur l'index (T3.1b, T3.1c, T4.14 inclus). |
| AC-P0-7 Vérité | Revue adverse : 50 affirmations « Existant » vérifiées dans le code, 2 fausses corrigées (notarisation non archivée, bouton par défaut absent du panneau), 1 surestimée corrigée, 6 précisions ; zéro cible présentée comme existante ; liens et ancres résolus ; zéro tiret cadratin. |

Vérification : `pnpm -s lint` vert ; `pnpm -s typecheck` vert ; `pnpm -r test` 353 tests verts ; `openspec validate --all --strict` 21 sur 21 ; `openspec-guard@0.3.0 check --require-selector --baseline` sans nouvel échec, baseline inchangée. `/review` gstack : 2 CRITICAL et 7 INFORMATIONAL corrigés, revérifiés mécaniquement (lint, tirets, OpenSpec) sans seconde passe adverse complète. `/cso` non applicable : aucun code.

Écarts de code découverts, non corrigés ici : T4.14 (panneau), T4.15 (configuration) ajoutées à l'index.
