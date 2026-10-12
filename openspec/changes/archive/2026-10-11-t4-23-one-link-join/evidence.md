# Preuves T4.23

Exécutées le 11 octobre 2026 sur la branche `t4-23-one-link-join`, macOS (Apple Silicon), Node 24.

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint && pnpm -r typecheck && pnpm -r test` | vert : 81 fichiers de test, 601 tests (1 ignoré, déjà ignoré sur `main`) |
| `node scripts/build-desktop-ui.ts --check` | vert : ressources de Mon espace conformes aux sources |
| `cargo test` dans `apps/desktop/src-tauri` (`TAURI_CONFIG='{"bundle":{"resources":[]}}'`) | vert : 6 tests, dont `join_and_pair_links_open_the_invite_confirmation` |
| `npx openspec validate --all --strict` | 22 éléments valides |
| `openspec-guard@0.3.0 check --require-selector --baseline … --fail-on fail` | vert ; `--update-baseline` ne change pas la baseline (aucun ajout) |

## Critères et tests

| Critère | Test |
| --- | --- |
| Invitation modifiée refusée | `invites (T4.23) > signs every field with the inviter node and refuses a modified invite (E_INVITE_SIG)` |
| Invitation expirée refusée | `invites (T4.23) > refuses an expired invite, or one meant to outlive a day (E_INVITE_EXPIRED)` |
| Invitation piégée refusée | `invites (T4.23) > refuses malformed codes, unsafe names and an admission sponsored by another node (E_INVITE)` |
| Code lu depuis chaque forme de lien | `invites (T4.23) > reads the invite out of a code, a join link, drop://join and drop://pair` |
| Relais admis et refusés | `invites (T4.23) > allows ws relays on private addresses only and wss relays by DNS name` |
| Relais DNS du profil privé | `private configuration > initializes without cloud accounts and rejects forbidden profile settings` |
| Lien produit, nouveau poste sur le relais de l'équipe (vrai relais, deux daemons) | `one-link join (T4.23) > a fresh private node adopts the relay of the link, is admitted and joins the team after Rejoindre` |
| Relais gardé ou refusé | `one-link join (T4.23) > keeps the relay of a node that already joined someone, and refuses a relay it may not adopt (E_INVITE_RELAY)` |
| Refus à codes stables | `one-link join (T4.23) > answers each refusal with its stable code: modified, expired, own, reused, unreadable` |
| Lien accepté refusé après redémarrage | `one-link join (T4.23) > remembers accepted invites across a restart: a reused link stays refused (E_INVITE_USED)` |
| Lien honoré après redémarrage de l'inviteur, une fois | `one-link join (T4.23) > the inviter honours a link sent before its restart, once, and forgets it when it expires` |
| Page : politique | `join page (T4.23) > serves /join under a policy that pins its one script and allows no connection, other pages keep none` |
| Page : rien ne sort | `join page (T4.23) > never sends the invite anywhere and writes names as text only` |
| Page : affichage et bouton | `join page (T4.23) > shows who invites, offers the matching download, opens drop://join and drops the fragment` |
| Page : lien inutilisable | `join page (T4.23) > explains an incomplete, unreadable or expired link instead of a join button` |
| App : `drop://join` | `desktop join link (T4.23) > opens drop://join like drop://pair: the confirmation card, queued until the node answers` et `cargo test` |
| Carte T4.14 inchangée | `menu bar panel and its admin routes (T4.14) > previews an invitation without pairing and pairs only after Rejoindre` |

## Non prouvé ici

- Parcours sur de vrais postes : il demande le relais et la page déployés sur le VPS (T4.6a) et une release publiée ; prévu au banc maison (T4.6c).
- Sous Windows et Linux, un lien `drop://` lance un nouveau processus : sans le plugin `single-instance` (T4.25), le bouton de la page n'atteint pas une app déjà ouverte. Non observé, déduit de la documentation Tauri.
- Panneau de la barre de menus : son bouton « Inviter » donne encore `drop://pair` (T4.25).
