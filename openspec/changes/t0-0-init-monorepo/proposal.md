## Why

Tâche T0.0 de l'index. Aucune autre tâche ne peut se clore sans les contrôles communs de fin de tâche
(`pnpm -r lint && pnpm -r typecheck && pnpm -r test`). Le monorepo doit donc exister avant tout package.

## What Changes

- Monorepo pnpm workspaces (`packages/*`), Node 22+, pnpm figé par `packageManager`.
- TypeScript strict partagé, ESLint en flat config avec typescript-eslint (`any` explicite en erreur), Prettier, Vitest.
- Scripts racine `lint`, `typecheck`, `test`, `format`, `format:check`, qui couvrent la racine et tous les packages.
- `.gitignore` qui exclut `node_modules`, `dist`, `coverage`, `.drop*/` et `.env*`.
- Tests de configuration à la racine, liés aux scénarios de `monorepo-tooling`.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `monorepo-tooling` : la review a montré que le contrat d'origine laissait des trous (fichiers hors contrôle,
  `any` contournable, Node trop bas, clés commitables). Le delta resserre le contrat ; détail dans design.md.

## Non-goals

- Aucun package produit. `packages/blocked-observer` relève de T0.1, `packages/protocol` de T1.1.
- Aucune CI distante ni remote git.
- Aucun hook de pré-commit : rien dans la spec ne le demande.

## Impact

Fichiers racine de configuration uniquement. Dépendances de développement : typescript, eslint, @eslint/js,
typescript-eslint, globals, prettier, vitest, @types/node.
