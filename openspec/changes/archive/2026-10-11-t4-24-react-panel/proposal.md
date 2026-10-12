## Why

T4.24 (D84) demande une interface impeccable et cohérente sur Mac, Windows et Linux. Depuis D87 et D88, la fenêtre « Ton espace » utilise React, les composants shadcn/ui et l'accent violet, alors que le panneau de la barre de menus (`/app`) restait une chaîne HTML de 1 400 lignes (`panel.ts`, `panel-human.ts`) : un autre vert, un autre jeu de composants, et un script que ni le lint ni la vérification de types ne lisaient. Sa politique de contenu autorisait aussi tout script en ligne (`script-src 'unsafe-inline'`).

## What Changes

- **Deuxième entrée de `packages/desktop-ui`** : `src/panel/` construit le panneau 380 × 620 avec les mêmes composants (Tabs, Card, Button, Badge, Dialog, Switch, Checkbox, Textarea, Input) et les mêmes jetons que la fenêtre. Toutes les fonctions et tous les états du panneau sont repris, liste dans `design.md`.
- **Service par le Node** : `/app` sert le bundle compilé et intégré à `drop.mjs`, comme `/workspace`, sous `default-src 'none'`, `script-src 'sha256-…'` (le seul script de la page), `connect-src 'self'`, sans image, police ni formulaire. Le contrôle du jeton local ne change pas.
- **Suppression** de `packages/node/src/panel.ts` et `panel-human.ts`.
- **Tests de composants** dans happy-dom (dépendance de test, D90), qui remplacent les tests de chaînes de l'ancien panneau ; les marqueurs `openspec-guard` pointent vers les nouveaux titres.
- **Accessibilité** : onglets Radix (flèches, Début, Fin), région vivante et focus sur le résultat, « Pas maintenant » par défaut, réglages système (mouvement, transparence, contraste, thème).

## Capabilities

### Modified Capabilities

- `owner-app` : la politique de contenu du panneau passe à l'empreinte du script ; nouvelle exigence « Panneau accessible ».
- `node` : les scénarios « Entrée au clavier » et « l'UI échappe une entrée contenant script » reçoivent leur test (panneau React).

## Non-goals

- Recette dans les vrais WKWebView, WebView2 et WebKitGTK, et recette VoiceOver (T4.24, seconde partie ; T3.4).
- Coque native, empaquetage par plateforme, parcours du lien unique (T4.23) : autres chantiers en parallèle.
- Aucun changement de route de l'API locale ni de règle de sécurité côté Node.

## Impact

`packages/desktop-ui` (entrée panneau, tests), `scripts/build-desktop-ui.ts` (deux bundles, une feuille de style, porte `--check` étendue), `packages/node/src/workspace.ts` et `api.ts` (service du panneau), `packages/node/test`, `docs/product/UX_UI.md`, `docs/product/screenshots/react-panel/`, `docs/TASKS.md`, `docs/DECISIONS.md` (D90), racine `package.json` (`happy-dom`).
