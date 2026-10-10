# Tasks

## 1. Régressions avant correction

- [x] 1.1 Ajouter aux tests API les cas jeton attendu vide, en-tête vide, query vide, accès valide et UI/SSE ; vérifier que la régression actuelle échoue sur le cas vide.
- [x] 1.2 Ajouter un test de profil temporaire pour le fichier de jeton absent, vide et blanc ; vérifier que `startDaemon` échoue avant `RelayClient.start` et qu'aucun listener n'est ouvert.

## 2. Refus fermé

- [x] 2.1 Valider `DropHome.localToken()` et charger le jeton une fois avant le relais dans `startDaemon` ; vérifier les cas fichier absent/vide et le parcours valide.
- [x] 2.2 Refuser le jeton attendu ou présenté vide dans `startLocalApi` et la comparaison ; vérifier API, panneau et SSE, avec une erreur `E_TOKEN` sans contenu sensible.

## 3. Vérification

- [x] 3.1 Passer `pnpm -r lint && pnpm -r typecheck && pnpm -r test`, OpenSpec strict et openspec-guard sur la change puis sur les specs canoniques ; consigner les résultats dans `proof/verification.md`.
- [x] 3.2 Relire le diff avec `/review` et `/cso` gstack, résoudre les constats, puis faire une contre-vérification de sécurité et mettre `proof/state.json` à jour.

## Workflow follow-up

- Synchroniser les scénarios de la change, archiver et passer T3.4a à `done` seulement après toutes les vérifications requises ; consigner le commit et l'état de T3.4 dans l'index.
