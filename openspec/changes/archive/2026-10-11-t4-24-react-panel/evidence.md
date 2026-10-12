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

## Re-vérification du 12 octobre 2026, après fusion de `main` (`8126108`), macOS, Node 24.21.0

Les preuves ci-dessus sont celles de la session d'origine, sur `86f8720`. Celles-ci ont été refaites sur la fusion.

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint` | vert |
| `pnpm -r typecheck` | vert |
| `pnpm -r test` | 83 fichiers verts, 1 ignoré ; 634 tests verts, 1 ignoré. Un premier passage a échoué sur `tooling.test.ts` (« every dependency outside the imposed stack is recorded in DECISIONS ») : l'entrée renumérotée n'avait plus la forme `- **D97**` que lit ce test ; forme rétablie, test vert |
| `packages/desktop-ui/test/panel.test.tsx` | 17 tests verts, dont le nouveau « names the relay only when Rejoindre would move to it, and shows each refusal with the message of its stable code » |
| Contre-épreuve | carte sans la ligne du relais : le test T4.14 échoue ; refus remis à la phrase fixe d'avant T4.23 : le nouveau test échoue |
| `node scripts/build-desktop-ui.ts --check` | vert après régénération du module |
| `npx openspec validate --all --strict` | vert, 20 éléments |
| openspec-guard 0.3.0 `--fail-on fail` puis `--update-baseline` | vert ; baseline inchangée par la mise à jour ; par rapport à `main`, elle ne fait que perdre deux entrées (« Entrée au clavier », « l'UI échappe une entrée contenant script ») |

Porté depuis `main` : la correction de revue de T4.23 (D95) que `main` avait faite dans `panel.ts`. La carte d'invitation nomme le relais quand `POST /ui/pair/preview` répond `relay: 'adopt'`, et un refus de l'aperçu ou de « Rejoindre » affiche le message du Node suivi de son code stable (`failureText`), y compris pour un code que le panneau ne connaît pas. Le scénario node « AC: carte qui annonce le relais » pointe désormais vers le test qui l'affirme.

Revue de la fusion (`/review` et une relecture adverse indépendante, `/cso` en mode statique limité au diff) : aucune faille exploitable ; texte des pairs et de l'invitation rendu comme texte, seul lien de pair accepté en `https:`, empreinte de la CSP calculée sur le script servi. Une correction : un corps 500 opaque `{ error: 'internal' }` s'affichait tel quel (« internal ») ; `failureText` le rend désormais par la phrase calme de l'ancien panneau, affirmée par deux tests. Le passage `/cso` est partiel (analyse statique, aucun profil d'exécution) ; aucune constatation étayée dans le périmètre lu. Toutes les vérifications ci-dessus ont été refaites après cette correction, avec les mêmes résultats.

Écarts relevés et laissés ouverts, sans effet de sécurité :

- Si `GET /ui/admin/tools` échoue, la carte `drop://link` s'affiche avec « Autoriser » et l'avertissement de passerelle inconnue, là où l'ancien panneau n'affichait rien ; le Node revérifie la passerelle avant toute liaison.
- Antérieurs à cette fusion : « Partage et installation depuis le panneau » (le test attend 409 pour le retrait de Cursor), « Jeton exigé » (le test n'affirme pas `img-src`, `font-src`, `form-action`), « Entrée au clavier » (le test clique au lieu d'appuyer sur Entrée), « AC: onglets au clavier » (sélection et focus pas tous deux affirmés à chaque touche).
