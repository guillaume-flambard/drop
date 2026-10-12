# Tasks : CI plus rapide sans retirer de contrôle

Aucune logique de produit (schéma, crypto, politique, filtre) n'est touchée. Les tests existants de
`monorepo-tooling` gardent leurs titres et leurs assertions ; ils servent de garde.

## 1. Cache du build Rust

- [x] 1.1 Ajouter `actions/cache` (v6.1.0, épinglé par SHA) et l'étape `Build drop-iroh` aux jobs `test` et
      `test-cross` de `.github/workflows/test.yml`. **Vérification** : `zizmor` passe sur la PR (run 38215254446).
- [x] 1.2 Enregistrer le cache juste après la compilation (`actions/cache/restore` puis `actions/cache/save`), pour
      qu'un test qui échoue ne prive pas un système de cache. **Vérification** : sur Windows, l'étape `save` s'exécute
      même si un test échoue, et le run suivant restaure le cache. Fait : `save` à 6 s sous Windows au run
      38216826027, restauré au run 38217630816 (`Build drop-iroh` de 278 s à 82 s).

## 2. Typecheck et format incrémentaux

- [x] 2.1 `typecheck` avec `--incremental --tsBuildInfoFile node_modules/.cache/drop/tsc.tsbuildinfo` ; `lint` avec
      Prettier `--cache --cache-strategy content`. **Vérification** : `pnpm typecheck` et `pnpm lint` sortent en 0,
      à froid puis à chaud.
- [x] 2.2 Contre-épreuve : cache chaud, un type changé dans un fichier rend invalide un autre fichier qui l'importe.
      **Vérification** : `pnpm typecheck` signale `TS2322` dans le second fichier.

## 3. Test d'outillage

- [x] 3.1 Dans « recursive and root lint and typecheck… », réutiliser la sortie de `pnpm -r typecheck`.
      **Vérification** : le test passe ; `openspec-guard check` passe sans changement de baseline.

## 4. Mesure

- [x] 4.1 Relever, sur un deuxième run de la PR (cache chaud), la durée de `internet.test.ts`, de
      `tooling.test.ts` et des trois jobs, et l'écrire dans design.md et dans D94.
      **Vérification** : `internet.test.ts` sous 30 s sur chaque système.
      Fait sur le run 38217630816 : 7,2 s au plus ; chiffres dans design.md et D94.
