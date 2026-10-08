# Tasks

## 1. Socle

- [x] 1.1 Écrire `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitignore`, `.prettierrc.json`, `.prettierignore` et vérifier que `pnpm install` réussit
- [x] 1.2 Écrire `tsconfig.base.json` et `tsconfig.json`, et vérifier que `pnpm typecheck` passe
- [x] 1.3 Écrire `eslint.config.js` et vérifier que `pnpm lint` passe

## 2. Tests du contrat

- [x] 2.1 Écrire `vitest.config.ts` et `test/tooling.test.ts` (un test par scénario `monorepo-tooling`), ajouter les sélecteurs `openspec-guard`, et vérifier que `pnpm test` passe
- [x] 2.2 Introduire une erreur de type, vérifier que `pnpm typecheck` échoue, puis l'annuler

## 3. Vérification

- [x] 3.1 Lancer `pnpm -r lint && pnpm -r typecheck && pnpm -r test` et `pnpm format:check`, et vérifier qu'ils sortent en code 0
- [x] 3.2 Vérifier que le contrôle `openspec-guard` passe pour les scénarios `monorepo-tooling`
- [x] 3.3 Lancer `/review` (gstack) sur le diff et traiter les constats

## 4. Corrections issues de la review

- [x] 4.1 Élargir tsconfig et vitest à tout fichier TS et de test, et vérifier par mutation qu'un `.mts` mal typé et un `tests/*.spec.ts` en échec font échouer le contrôle
- [x] 4.2 Activer le lint typé et `noInlineConfig`, inclure `prettier --check` dans `lint`, et vérifier qu'un `eslint-disable` + `any` échoue
- [x] 4.3 Passer à `allowOnly: false` et vérifier qu'un `it.only` fait échouer `pnpm test`
- [x] 4.4 Ignorer les clés, `.drop*` et `.env.example`, et n'exempter `@drop/*` qu'en `workspace:` ; tests ajoutés
- [x] 4.5 Écrire le delta de spec `monorepo-tooling`, et vérifier que `openspec validate --strict` passe et que chaque scénario a son test

## Workflow follow-up

- `openspec archive t0-0-init-monorepo`, passer T0.0 à `done` dans `docs/TASKS.md`, commiter.
