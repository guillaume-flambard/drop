# Tasks

Graphe fini P1 : 1.1 → 1.2 → 2.1 → 2.2. Preuves dans evidence.md, exigences dans design.md.

## 1. Préparation

- [x] 1.1 Assembler les dix fichiers, créer la stack isolée et le manifeste, documenter les commandes (REQ-PUB-1, 2, 3, 4).
- [x] 1.2 Contrôler la configuration et les refus HTTP ; faire la revue indépendante et corriger ses défauts (REQ-PUB-2, 3, 5).

## 2. Vérification et publication

- [x] 2.1 Passer pnpm -r lint, pnpm -r typecheck, pnpm -r test, openspec-guard puis update-baseline sans ajout, openspec validate ; contrôle à blanc et déploiement ciblé après validation (REQ-PUB-4, 5).
- [x] 2.2 Vérifier le HTTPS, les hashes, les refus, le relais avant/après et le rendu ; consigner preuves, risques et recette, archiver et committer (tous les critères).

Preuves : 1.1 → EV-PUB-1 ; 1.2 → EV-PUB-1/2 ; 2.1 → EV-PUB-2/3 ; 2.2 → EV-PUB-3/4/5.
