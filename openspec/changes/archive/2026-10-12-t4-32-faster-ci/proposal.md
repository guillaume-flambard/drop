# T4.32 : CI plus rapide sans retirer de contrôle

## Why

Une PR attend environ 8 minutes sa CI, et c'est `test-windows` qui fixe cette durée. Le run 38185292252
(11 octobre 2026) montre que deux fichiers de test portent presque tout le temps, et que dans les deux cas il s'agit
d'un travail refait à chaque fois plutôt que d'une vérification :

| Fichier | Local | Linux CI | macOS CI | Windows CI |
| --- | --- | --- | --- | --- |
| `packages/node/test/internet.test.ts` | 5 s | 134 s | 322 s | 402 s |
| `test/tooling.test.ts` | 44 s | 124 s | 214 s | 260 s |
| suite complète (`vitest`, Duration) | 47 s | 142 s | 350 s | 409 s |

1. `internet.test.ts` lance `cargo build --release` du crate `crates/drop-iroh` dans un `beforeAll`. Aucun workflow
   ne garde de cache Cargo : chaque run recompile iroh et toutes ses dépendances. En local, `target/` existe déjà.
2. `tooling.test.ts` relance le lint et le typecheck du dépôt entier (2 lints, 5 typechecks complets), juste après
   l'étape de CI qui vient de les faire.

## What Changes

- **Cache du build Rust** dans les deux jobs de `.github/workflows/test.yml` : `actions/cache` v6.1.0, épinglé par
  SHA, clé par système sur `Cargo.lock`, `Cargo.toml` et `src/` du crate, avec une clé de repli qui garde les
  dépendances compilées quand seul notre code change. Une étape `Build drop-iroh` précède les tests, pour que la durée
  de compilation se lise dans son étape ; le `beforeAll` du test ne fait plus que constater que le binaire est à jour.
- **Typecheck incrémental** : le script `typecheck` passe `--incremental` avec son fichier d'état sous
  `node_modules/.cache/drop/`. Le script `lint` passe à Prettier `--cache --cache-strategy content`.
- **`tooling.test.ts`** : le test « recursive and root lint and typecheck… » réutilise la sortie de
  `pnpm -r typecheck` au lieu de relancer la commande une cinquième fois. Les quatre commandes du scénario
  `AC: contrôles de fin de tâche` restent exécutées.

## Capabilities

Aucun comportement du système ne change, donc `skip_specs: true`. La capacité concernée est `monorepo-tooling`, dont
les exigences (scripts racine, échec propagé, lint typé) restent identiques et couvertes par les mêmes tests, sous les
mêmes titres.

## Non-goals

- **Pas de retrait de Windows ni de macOS** des PR : D84 en fait des cibles de premier rang. On mesure d'abord l'effet
  de cette change ; filtrer par chemins reste une option à décider sur ces mesures.
- **Pas de cache eslint** : le lint typé lit d'autres fichiers que celui qu'il vérifie, ce que le cache d'eslint ne
  suit pas, et il pourrait taire une erreur.
- **Pas le flake de `campaign.test.ts`** sous charge : il a sa ligne, T4.25.

## Impact

- `.github/workflows/test.yml`, `package.json`, `test/tooling.test.ts`.
- `docs/DECISIONS.md` (D94), `docs/TASKS.md` (T4.32).
- Aucune dépendance npm, aucun schéma, aucun contrat. `actions/cache` est une action officielle de GitHub.
