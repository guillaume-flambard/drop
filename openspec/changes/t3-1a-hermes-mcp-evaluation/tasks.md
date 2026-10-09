# Tasks

## 1. Environnement et contrat existant

- [x] 1.1 P1 — Épingler Hermes, vérifier licence/API MCP/config/fournisseur et consigner les sources ; preuve version et limites AC-HERMES-02/03.
- [x] 1.2 P1 — Préparer un profil de test isolé et une recette rejouable, sans config personnelle ; vérifier la liste des outils et la voie de retrait.

## 2. Expérimentation

- [x] 2.1 P0 — Après 1.2, exécuter Hermes MCP réel vers deux Nodes : accord/résultat, refus et expiration ; assertions et preuves AC-HERMES-01.
- [x] 2.2 P1 — Après 2.1, observer les destinations et la panne du modèle interne ; distinguer fixture, client réel et boucle agent ; rapport explicite de tout écart AC-HERMES-02.
- [x] 2.3 P1 — Conclure intégrer/adapter/différer, coût de maintenance et nettoyage ; guide et bilan cohérents, AC-HERMES-03.

## 3. Vérification

- [x] 3.1 P1 — pnpm -r lint, pnpm -r typecheck, pnpm -r test, openspec strict et guard avec baseline sans ajout.
- [ ] 3.2 P1 — /review gstack indépendante ; /cso si des packages runtime sont modifiés ; corriger les défauts et consigner les limites.
- [ ] 3.3 P1 — État, preuves et acceptation manuelle fidèles, tâches et documentation à jour.

## Workflow follow-up

- Archiver après vérification ; commit et arbre propre. Ne pas commencer T3.2 dans cette change.

Preuves : 1.1/2.3 → EV-01 ; 1.2/2.1/2.2 → EV-02/03 ; 3.1 → EV-04 ; 3.2 → EV-05 ; 3.3 → closure.md et state.json.
