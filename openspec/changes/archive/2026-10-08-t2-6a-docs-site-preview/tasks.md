# Tasks

Graphe fini : 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2. Toutes les tâches sont P1. Exigences et critères : `design.md`. Preuves : `evidence.md`. L'état de cette change ne qualifie pas l'achèvement de drop.

## 1. Documentation

- [x] 1.1 Rédiger le bilan sourcé et daté ; vérifier les 32 lignes produit et les résultats des commandes (REQ-DOC-1, AC-DOC-1). Preuves EV-01, EV-05.
- [x] 1.2 Écrire le guide et trois schémas, corriger l'entrée README ; vérifier commandes, liens, frontières de confidentialité et rendu (REQ-DOC-2, AC-DOC-2). Preuves EV-01, EV-03, EV-05.

## 2. Site

- [x] 2.1 Construire les trois pages et la simulation pédagogique accessible ; vérifier les liens, le clavier et les vues mobile / bureau (REQ-SITE-1, REQ-SITE-2, AC-SITE-1, AC-SITE-2). Preuves EV-02, EV-03, EV-05.
- [x] 2.2 Écrire les tests HTTP avant le serveur de prévisualisation, puis la construction et ses commandes ; vérifier l'allowlist et les refus de fichiers privés (REQ-SITE-3, AC-SITE-3). Preuves EV-02, EV-04.

## 3. Vérification

- [x] 3.1 Exécuter `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec-guard` puis la mise à jour de baseline (retraits seuls), et `openspec validate` (REQ-VERIFY-1, AC-VERIFY-1). Preuve EV-04.
- [x] 3.2 Effectuer `/review` (gstack), vérifier les affirmations et les liens, consigner preuves, risques et recette ; positionner `state.json` selon les résultats (tous les critères). Preuves EV-05, EV-06.

## Workflow follow-up

- Archiver après les vérifications et committer les fichiers de cette change uniquement.
- Présenter le résultat en `READY_FOR_MANUAL_ACCEPTANCE` pour cette documentation et cette prévisualisation.
- T2.6 reste ouverte pour la vidéo, les boutons de distribution publique et la publication soumise à l'accord prévu dans l'index. Les installateurs locaux sont désormais livrés par T2.5.
