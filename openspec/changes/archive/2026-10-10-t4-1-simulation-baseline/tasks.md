## 1. Tests d'abord

- [x] 1.1 Tests du plan à graine, de la politique de décision et des statistiques du rapport (rouges).
- [x] 1.2 Test du refus de relais hors bouclage.

## 2. Banc

- [x] 2.1 Paquet `packages/simulation` : plan, politique, statistiques, événements, rapport.
- [x] 2.2 Orchestration : dossier de campagne, relais dédié, init et publication, serve, appairage, charge, décisions, mesures, arrêt propre.
- [x] 2.3 CLI `run` avec estimation mémoire et plafond de 80 nœuds.
- [x] 2.4 Test de bout en bout à 3 nœuds.

## 3. Campagne de référence

- [x] 3.1 Lancer 50 nœuds pendant 3 minutes, archiver le rapport dans la change comme preuve.

## 4. Vérification

- [x] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, puis openspec-guard avec sélecteurs et baseline sans ajout.
- [x] 4.2 `/review` (gstack) sur le diff et revue sécurité ciblée (isolation : relais de bouclage, `~/.drop` jamais touché, environnement filtré, processus arrêtés). La change touche `node` par `notify.ts` : `/cso` requis.
