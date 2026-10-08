## Context

Le dépôt n'a aucun code. Versions lues sur npm le 2026-10-08 : typescript 7.0.2, typescript-eslint 8.71.1 (peer
`typescript >=4.8.4 <6.1.0`), eslint 10.12.0, vitest 5.0.3 (engines Node `^22.12.0 || ^24 || >=26`), prettier 3.9.9,
pnpm 11.27.0 installé (12.10.1 publié).

## Goals / Non-Goals

**Goals :** le contrat `monorepo-tooling`, un seul endroit pour l'outillage, et `pnpm -r X` qui équivaut à `pnpm X`.

**Non-Goals :** builds et émission de JavaScript par package (chaque package l'ajoutera avec son code).

## Decisions

- **TypeScript 6.0.x, pas 7.** typescript-eslint 8.71 refuse TypeScript `>=6.1`. Choisir TypeScript 7 casserait le
  lint, qui est un contrôle obligatoire.
- **L'outillage vit à la racine.** `eslint .`, `tsc --noEmit -p tsconfig.json` (qui inclut `packages/*/src` et
  `packages/*/test`) et `vitest run` avec `projects` couvrent tout le dépôt. Les packages ne définissent pas de script
  `lint`, `typecheck` ni `test`. `includeWorkspaceRoot: true` fait tourner les scripts racine par `pnpm -r`. On évite
  ainsi les doubles exécutions et la recursion d'un script racine qui appellerait `pnpm -r`. Écarté : un script par
  package, qui donne N configurations à maintenir et une commande racine qui doublerait les tests.
- **Options TypeScript explicites** (`module`/`moduleResolution` `nodenext`, `target` `es2023`, `types: ["node"]`). On
  ne dépend pas des défauts, qui ont changé entre TypeScript 5, 6 et 7.
- **pnpm 11.27.0 figé**, la version installée. Passer à pnpm 12 est une décision séparée.
- **Tests de configuration** dans `test/tooling.test.ts` : ils lisent les fichiers de configuration et lancent ESLint
  par son API sur un fichier `any` en mémoire. Chaque scénario `AC:` a un test, lié par un sélecteur `openspec-guard`.

## Risks / Trade-offs

- [`vitest` avec `projects: ['packages/*']` échoue s'il n'y a aucun package] : la racine est le seul projet tant que
  `packages/` est vide, et on vérifie le comportement quand le premier package arrive (T0.1).
- [`git check-ignore` exige un dépôt git] : le test le lance sur le dépôt réel, qui existe (`ecf96a8`).
