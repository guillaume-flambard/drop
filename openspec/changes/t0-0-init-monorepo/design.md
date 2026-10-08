## Context

Le dépôt n'a aucun code. Versions lues sur npm le 2026-10-08 : typescript 7.0.2, typescript-eslint 8.71.1 (peer
`typescript >=4.8.4 <6.1.0`), eslint 10.12.0, vitest 5.0.3 (engines Node `^22.12.0 || ^24 || >=26`), prettier 3.9.9,
pnpm 11.27.0 installé (12.10.1 publié).

## Goals / Non-Goals

**Goals :** le contrat `monorepo-tooling`, un seul endroit pour l'outillage, et `pnpm -r X` qui équivaut à `pnpm X`.

**Non-Goals :** builds et émission de JavaScript par package (chaque package l'ajoutera avec son code).

## Decisions

- **Contrat modifié après review** (gstack `/review`, passes adverses Claude et Codex) : plancher Node `>=22.13`,
  couverture complète, lint typé sans désactivation en ligne, format dans `lint`, tests focalisés refusés, clés et
  `.env.example` ignorés. Delta dans `specs/monorepo-tooling/spec.md` ; `skip_specs` retiré.

- **TypeScript 6.0.x, pas 7.** typescript-eslint 8.71 refuse TypeScript `>=6.1`. Choisir TypeScript 7 casserait le
  lint, qui est un contrôle obligatoire.
- **L'outillage vit à la racine.** `eslint . --max-warnings 0 && prettier --check .`, `tsc --noEmit -p tsconfig.json`
  (qui inclut tout `**/*.{ts,tsx,mts,cts}` hors dépendances et sorties) et `vitest run` (qui inclut tout
  `**/*.{test,spec}.*`, avec `allowOnly: false`) couvrent tout le dépôt. Un test de couverture compare la liste git des
  fichiers à ce que tsc et vitest voient réellement. Les packages ne définissent pas de script
  `lint`, `typecheck` ni `test`. `includeWorkspaceRoot: true` fait tourner les scripts racine par `pnpm -r`. On évite
  ainsi les doubles exécutions et la recursion d'un script racine qui appellerait `pnpm -r`. Écarté : un script par
  package, qui donne N configurations à maintenir et une commande racine qui doublerait les tests.
- **Options TypeScript explicites** (`module`/`moduleResolution` `nodenext`, `target` `es2023`, `types: ["node"]`). On
  ne dépend pas des défauts, qui ont changé entre TypeScript 5, 6 et 7.
- **pnpm 11.27.0 figé**, la version installée. Passer à pnpm 12 est une décision séparée.
- **Tests de configuration** dans `test/tooling.test.ts` : ils lisent les fichiers de configuration et lancent ESLint
  par son API sur un fichier `any` en mémoire. Chaque scénario `AC:` a un test, lié par un sélecteur `openspec-guard`.

## Risks / Trade-offs

- [Imports entre packages : un `exports` vers `dist/` casse le contrôle sans build, ou valide un `dist/` périmé] :
  convention à trancher en T1.1, premier package importé par d'autres (voir « À décider » dans DECISIONS).
- [Le `tsconfig.json` propre à un package n'est jamais lu par le contrôle racine] : un package qui a besoin d'options
  différentes (`jsx`, `lib: ["dom"]`) devra l'ajouter dans la config racine. On revoit ce point si cela arrive.
- [Lint typé plus lent] : accepté, car il bloque `any` implicite et promesses flottantes sur des entrées non fiables.
- [`git check-ignore` exige un dépôt git] : le test le lance sur le dépôt réel, qui existe (`ecf96a8`).
