# Preuves T4.35

Exécutées le 12 octobre 2026 sur la branche `t4-35-consent-card`, après fusion de `origin/main` (T4.30 compris), macOS (Apple Silicon), Node 24.21.0.

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint && pnpm -r typecheck && pnpm -r test` | vert : 99 fichiers de test, 702 tests |
| `node --experimental-strip-types scripts/build-desktop-ui.ts --check` | vert après régénération |
| `openspec validate t4-35-consent-card --strict`, puis `openspec validate --all --strict` après archivage | valide ; 20 éléments valides |
| `openspec-guard@0.3.0 check --require-selector --baseline … --fail-on fail` | vert : 494 critères liés (486 sur `main`, + 8) ; `--update-baseline` ne change pas la baseline |
| Revue (`review`) et revue adverse indépendante | aucun défaut critique ; trois remarques corrigées (lectures de l'espace ordonnées, carte partie annoncée avec reprise du focus, relecture de la liste après une réponse refusée) |
| Revue de sécurité (`cso --diff --code`, statique, hors ligne) | aucune constatation étayée ; partielle : pas de profil d'exécution ni de scanner |

Les tests du module pur ont été écrits avant le module et échouaient à l'import ; les tests de composants ont été écrits avec la carte.

## Critères et tests

| Critère | Test |
| --- | --- |
| Une phrase par état sur les données | `consent card model (T4.35) > names each state with a sentence that says what happened to the data` |
| Seule une carte en attente expire | `consent card model (T4.35) > lets only a pending card expire, and never withdraws a decision in flight` |
| Réponse illisible incertaine (modèle) | `consent card model (T4.35) > reads an unreadable or failed reply as uncertain, never as refused` |
| Demande encore listée remise en attente | `consent card model (T4.35) > puts back to pending a card the Node still lists, and keeps a confirmed decision` |
| Focus et annonce après décision, région unique | `consent card (T4.35) > after a decision the card takes the focus and the single live region announces its state` |
| Bouton bloqué focalisable | `consent card (T4.35) > keeps a blocked button focusable with its reason while the decision is in flight` |
| Réponse illisible montrée incertaine | `consent card (T4.35) > shows an unreadable reply as uncertain on the card, never as refused` |
| Décider depuis « Ton espace » | `workspace requests (T4.35) > lists pending requests, follows the live stream and decides through the same card as the panel` |
| Résultat annoncé et focalisé dans le panneau | `menu bar panel (T4.24) > announces each result, moves the focus to it, and shows the connection state in its own live region` |
| Arrivée par une notification sur la liste partagée (T4.30) | `notification-entry.test.tsx`, vert après fusion |

## Non prouvé ici

- Recette VoiceOver dans le vrai WKWebView, puis WebView2 et WebKitGTK : happy-dom seulement (seconde partie de T4.24).
- `E_EXPIRED` est lu d'après la réponse documentée de `/ui/decide` (T4.30) ; aucun test ne passe par un vrai Node pour ce cas.
