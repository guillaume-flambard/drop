# Tasks : CI plus rapide sans retirer de contrôle

Aucune logique de produit (schéma, crypto, politique, filtre) n'est touchée. Les tests existants de
`monorepo-tooling` gardent leurs titres et leurs assertions ; ils servent de garde.

## 1. Cache du build Rust

- [ ] 1.1 Ajouter `actions/cache` (v6.1.0, épinglé par SHA) et l'étape `Build drop-iroh` aux jobs `test` et
      `test-cross` de `.github/workflows/test.yml`. **Vérification** : `zizmor` passe sur la PR.

## 2. Typecheck et format incrémentaux

- [ ] 2.1 `typecheck` avec `--incremental --tsBuildInfoFile node_modules/.cache/drop/tsc.tsbuildinfo` ; `lint` avec
      Prettier `--cache --cache-strategy content`. **Vérification** : `pnpm typecheck` et `pnpm lint` sortent en 0,
      à froid puis à chaud.
- [ ] 2.2 Contre-épreuve : cache chaud, un type changé dans un fichier rend invalide un autre fichier qui l'importe.
      **Vérification** : `pnpm typecheck` signale `TS2322` dans le second fichier.

## 3. Test d'outillage

- [ ] 3.1 Dans « recursive and root lint and typecheck… », réutiliser la sortie de `pnpm -r typecheck`.
      **Vérification** : le test passe ; `openspec-guard check` passe sans changement de baseline.

## 4. Mesure

- [ ] 4.1 Relever, sur un deuxième run de la PR (cache chaud), la durée de `internet.test.ts`, de
      `tooling.test.ts` et des trois jobs, et l'écrire dans design.md et dans D94.
      **Vérification** : `internet.test.ts` sous 30 s sur chaque système.
