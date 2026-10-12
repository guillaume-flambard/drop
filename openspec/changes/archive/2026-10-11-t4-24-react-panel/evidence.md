## Preuves (2026-10-11, sur macOS, Node 24.21.0)

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint` (eslint strict typé, prettier) | vert ; le panneau React est désormais lu par le lint, l'ancien script dans une chaîne ne l'était pas |
| `pnpm -r typecheck` | vert |
| `pnpm -r test` | 77 fichiers verts, 1 ignoré ; 592 tests verts |
| `packages/desktop-ui/test/panel.test.tsx` | 16 tests de composants verts dans happy-dom |
| `packages/node/test/panel.test.ts` | jeton exigé, `PANEL_CSP` égale à l'empreinte du script servi, aucune ressource externe |
| `node scripts/build-desktop-ui.ts --check` | vert après régénération |
| `npx openspec validate --all --strict` | vert |
| openspec-guard 0.3.0 | vert ; deux scénarios de la spec node sortent de la baseline (« Entrée au clavier », « l'UI échappe une entrée contenant script ») |
| Prévisualisation 380 × 620 dans Chromium, clair et sombre | captures fictives dans `docs/product/screenshots/react-panel/` |

## Ce qui n'est pas prouvé

- Rendu et lecteur d'écran dans les vrais WKWebView (macOS), WebView2 (Windows) et WebKitGTK (Linux) : seconde partie de T4.24.
- Matériau popover réel sous la page translucide : la capture Chromium montre la page sur fond blanc ou noir.
