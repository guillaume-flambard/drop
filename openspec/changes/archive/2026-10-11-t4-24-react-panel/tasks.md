## 1. Lire et décider

- [x] 1.1 Ancien panneau (`panel.ts`, `panel-human.ts`), service et CSP de `/workspace`, `UX_UI.md` section 6, specs `owner-app` et `node` : liste de parité dans `design.md`.
- [x] 1.2 D97 dans `docs/DECISIONS.md` : panneau React, CSP à empreinte, `happy-dom` pour les tests.

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

## 5. Mise à jour sur `main` (2026-10-12)

- [x] 5.1 Fusion de `origin/main` (sans rebase) : `DECISIONS.md` (décision renumérotée D97, D90 étant prise par la PR #45 et D96 par la PR #63), `TASKS.md` (lignes et statuts de `main`), `ONBOARDING.md`, module généré reconstruit, suppression de `panel.ts` gardée.
- [x] 5.2 Correction de revue de T4.23 (D95) portée dans la carte React : relais nommé quand `relay` vaut `adopt`, refus de l'aperçu et de « Rejoindre » affichés avec le message de leur code stable, y compris un code inconnu du panneau.
- [x] 5.3 Assertions de `main` (`packages/node/test/panel.test.ts`) portées dans le test de composants ; le scénario node « AC: carte qui annonce le relais » pointe vers le test qui les porte.

Reste hors de cette change : la recette dans les vrais WKWebView, WebView2 et WebKitGTK, et la recette VoiceOver (T4.24, seconde partie).
