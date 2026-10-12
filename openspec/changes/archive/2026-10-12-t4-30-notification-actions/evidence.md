# Preuves T4.30

Exécutées le 12 octobre 2026 sur la branche `t4-30-notification-actions` (après fusion de `origin/main`, T4.31 compris), macOS (Apple Silicon), Node 24.21.0, cargo 1.99.0.

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint && pnpm -r typecheck && pnpm -r test` | vert : 96 fichiers de test, 693 tests |
| `node --experimental-strip-types scripts/build-desktop-ui.ts --check` | vert |
| `openspec validate --all --strict` | 20 éléments valides |
| `openspec-guard@0.3.0 check --require-selector --baseline … --fail-on fail` | vert : 486 critères liés ; `--update-baseline` ne change pas la baseline |
| `cargo check`, `cargo clippy --all-targets`, `cargo test` dans `apps/desktop/src-tauri` | vert, 11 tests, aucun avertissement ; fichiers de ressources vides et ignorés par git créés pour la compilation locale, non commités |

Les tests nouveaux ont d'abord échoué sur le code de `main` (route absente, ligne `dropNotify` sans `dropId`, panneau qui ne se plaçait pas sur la carte), puis sont passés.

## Critères et tests

| Critère | Test |
| --- | --- |
| Demande nommée pour les actions | `notifications (T4.30) > AC names the request in the line handed to the app, so its actions reach the right card` |
| Même refus que la carte | `notification actions (T4.30) > AC refuses from the notification through the same decision path as the card` |
| Refus tardif ignoré avec un code stable | `notification actions (T4.30) > AC ignores a late Refuser with a stable code: decided, expired or unknown, nothing is sent` |
| Jamais d'autorisation depuis une notification | `notification actions (T4.30) > AC never authorizes from a notification, whatever its body says` |
| Deux actions, jamais Autoriser | `desktop notification actions (T4.30) > offers Voir and Refuser only on a request notification, never Autoriser, without breaking through Focus` et `notification_actions_only_view_or_deny_never_allow` (cargo) |
| Refuser passe par le Node | `desktop notification actions (T4.30) > sends Refuser to the node refusal route with the drop identifier only, and opens the card for Voir`, `deny_goes_to_the_node_refusal_route_and_reads_its_stable_codes` et `notification_steps_open_the_card_or_refuse_through_the_node` (cargo) |
| Carte complète de la demande notifiée | `notification entry (T4.30) > AC opens the full card of the notified request, focused on Pas maintenant, never on Autoriser` |
| Demande qui n'attend plus | `notification entry (T4.30) > AC says so when the notified request no longer waits, and decides nothing` |
| Panneau ouvert, brouillon gardé | `notification entry (T4.30) > AC lands on the notified card of an open panel without reloading it, so a draft answer survives` |
| Panneau protégé | `desktop notification actions (T4.30) > keeps the panel that shows requests out of screen sharing` |

## Revues

- Deux revues adverses indépendantes : aucun chemin vers une autorisation. Corrigé à leur suite : « Voir » ne recharge plus un panneau ouvert (fragment `#request=`), l'action tourne hors du rappel Objective-C et la lecture du port ne panique plus, un « Refuser » qui ne s'applique pas ouvre la carte, « Refuser » exige une session déverrouillée, corps trop gros refusé en 413 et chaque refus journalisé, test « rien n'est envoyé » complété.
- `cso` (statique, limité au diff) : aucun constat établi ; couverture partielle, le délégué natif et l'`eval` n'ont pas été exécutés.

## Non prouvé ici

- Le délégué UserNotifications, l'invite d'autorisation, les boutons, le mode Concentration, l'`eval` du fragment sous la CSP du panneau et la protection contre la capture sur macOS 15 et plus : recette manuelle de l'app signée (tâche 4.5).
- Windows et Linux : aucune notification affichée par la coque aujourd'hui ; la CI ne compile la coque qu'au build de release.
