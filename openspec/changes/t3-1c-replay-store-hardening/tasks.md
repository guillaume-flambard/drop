# Tasks

## 1. Mémoire exécuteur

- [x] 1.1 Écrire les tests des issues résultat/refus/expiration et des doublons, puis retirer l'objet complet après issue ; vérifier `private-replay.test.ts`.
- [x] 1.2 Écrire le test de saturation active et appliquer le plafond 1 024 avant consentement ; vérifier `private-replay.test.ts` et le code `E_RATE`.

## 2. Mémoire demandeur et API

- [x] 2.1 Écrire les tests d'éviction des issues terminées et de saturation par 1 024 demandes actives, puis borner `outbound` avant financement ; vérifier les tests Node ciblés.
- [x] 2.2 Écrire les tests HTTP `/drops` et `/ask` pour `E_RATE`/429, implémenter le retour sans fausse erreur de capacité inconnue et documenter la rétention dans `docs/PRIVATE_PROFILE.md`.

## 3. Bornes des autres états et refus réseau

- [x] 3.1 Tester puis borner `inbox` et son `expiresAt` ; vérifier la saturation sans perte d'accord existant.
- [x] 3.2 Tester puis borner `outbox` pendant une panne prolongée et traiter une exception de transport sans exécution bloquée.
- [x] 3.3 Tester puis traiter `E_RATE`/`E_QUEUE_FULL`, la panne hors ligne et une exception de préparation de l'enveloppe initiale, avec libération du financement et de la place locale ; tester 429/413 et le refus temporaire pendant `flushOutbox`.
- [x] 3.4 Tester puis borner `ReplayCache` sans éviction d'un identifiant non expiré ; vérifier les tests protocole.

## 4. Vérification

- [x] 4.1 Synchroniser les specs canoniques, vérifier tous les scénarios `AC:` avec sélecteurs exacts et valider la change OpenSpec strictement.
- [x] 4.2 Exécuter `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, puis openspec-guard avec `--fail-on fail` et `--update-baseline` sans nouvel échec ; consigner les preuves.
- [ ] 4.3 Exécuter `/review` et `/cso` gstack sur le diff, corriger les constats P0/P1, puis faire chercher les manques par une vérification indépendante.

## Workflow follow-up

- Archiver la change après tous les contrôles verts, mettre T3.1c à `done` et committer la clôture.
