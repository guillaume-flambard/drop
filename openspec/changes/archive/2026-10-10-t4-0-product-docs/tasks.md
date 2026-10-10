## 1. Cadrage

- [x] 1.1 Consigner le grilling en D47 à D58 et ajouter T4.0 à T4.13 à l'index.

## 2. Documents

- [x] 2.1 PRD : problème, cible, positionnement, concurrents, promesse et limites, fonctions par niveau, hypothèses et critères, métriques, hors périmètre (AC-P0-1).
- [x] 2.2 TRD : architecture actuelle et visée, modes de connexion, sécurité, politique d'entreprise, modèles, simulation, dépendances candidates, contraintes (AC-P0-2).
- [x] 2.3 APP_FLOW : parcours du demandeur, du propriétaire avec et sans agent, de l'administrateur, de l'équipe, et chemins d'échec (AC-P0-3).
- [x] 2.4 UX_UI : principes, surfaces, écrans existants et visés, états, accessibilité, carte de simulation (AC-P0-4).
- [x] 2.5 BACKEND_SCHEMA : messages, identités, stockage local, relais, reçus, faits et contexte, politique, en renvoyant aux schémas zod (AC-P0-5).
- [x] 2.6 IMPLEMENTATION_PLAN : phases P0 à P5, lien avec T3 et T4, critères de sortie par phase (AC-P0-6).

## 3. Vérification

- [x] 3.1 Relire chaque affirmation « Existant » contre le code, les tests ou les preuves ; zéro contradiction avec D47 à D58 ; zéro tiret cadratin (AC-P0-7).
- [x] 3.2 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --strict`, openspec-guard et sa baseline sans ajout.
- [x] 3.3 `/review` (gstack) sur le diff. `/cso` non applicable : aucun code ni capacité touchés.
