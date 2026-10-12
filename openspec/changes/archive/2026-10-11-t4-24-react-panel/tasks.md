## 1. Lire et décider

- [x] 1.1 Ancien panneau (`panel.ts`, `panel-human.ts`), service et CSP de `/workspace`, `UX_UI.md` section 6, specs `owner-app` et `node` : liste de parité dans `design.md`.
- [x] 1.2 D90 dans `docs/DECISIONS.md` : panneau React, CSP à empreinte, `happy-dom` pour les tests.

## 2. Tests d'abord

- [x] 2.1 Tests de composants (`packages/desktop-ui/test/panel.test.tsx`) pour chaque scénario du panneau : texte des pairs, carte, relecture, réponse humaine, faits, analyse, secours, invitation, liaison, connexion OAuth.
- [x] 2.2 Comportement et accessibilité : onglets au clavier, résultat focalisé et annoncé, échec de chargement, réglages système.
- [x] 2.3 Tests HTTP et CSP du Node (`packages/node/test/panel.test.ts`) : jeton, empreinte du script servi, aucune ressource externe.

## 3. Réalisation

- [x] 3.1 `packages/desktop-ui/src/panel/` : logique, composants, styles du panneau.
- [x] 3.2 `scripts/build-desktop-ui.ts` : second bundle, porte `--check` étendue ; assets régénérés.
- [x] 3.3 `packages/node/src/workspace.ts` et `api.ts` : `/app` sous `PANEL_CSP` ; suppression de `panel.ts` et `panel-human.ts`.
- [x] 3.4 Captures fictives claires et sombres dans `docs/product/screenshots/react-panel/`, `UX_UI.md`, `TASKS.md`.

## 4. Vérification

- [x] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `node scripts/build-desktop-ui.ts --check`, `openspec validate --all --strict`, openspec-guard (la baseline ne fait que rétrécir).

Reste hors de cette change : la recette dans les vrais WKWebView, WebView2 et WebKitGTK, et la recette VoiceOver (T4.24, seconde partie).
