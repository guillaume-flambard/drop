# Preuves T4.37

Exécutées le 12 octobre 2026 sur la branche `t4-37-diagnostics`, après fusion d'`origin/main`, macOS (Apple Silicon), Node 24.

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint && pnpm -r typecheck && pnpm -r test` | vert : 97 fichiers de test, 694 tests ; fichiers touchés par la revue relancés ensuite (verts) |
| `node --experimental-strip-types scripts/build-desktop-ui.ts --check` | vert |
| `cargo test` dans `apps/desktop/src-tauri` (`TAURI_CONFIG='{"bundle":{"resources":[]}}'`) | vert : 9 tests, dont `redact_stray_masks_secrets_and_keeps_paths` et `append_capped_keeps_one_previous_file` |
| `openspec validate t4-37-diagnostics --strict` | valide |
| `openspec-guard@0.3.0 check --require-selector --baseline … --fail-on fail` | vert après archivage ; `--update-baseline` sans ajout |

## Critères et tests

| Critère | Test |
| --- | --- |
| Journal gardé au redémarrage (vrai `drop serve`, tué deux fois) | `daemon log (T4.37) > keeps the previous run instead of emptying the log at start` |
| Rotation par taille et âge, rétention | `daemon log (T4.37) > rotates by size and by age, keeps three files and deletes those older than fourteen days` |
| En-tête système, modes `0700` et `0600` | `daemon log (T4.37) > starts each file and each run with a system header, without host or user name` |
| Secrets plantés jamais écrits | `daemon log (T4.37) > redacts patterns, key names and known values in the writing itself` |
| Plantage et écritures égarées | `daemon log (T4.37) > logs a crash and every stray stderr write through the same redaction` |
| Aucun secret planté dans l'export | `redacted diagnostic (T4.37) > never exports a planted secret, from the daemon log, the app log or the node files` |
| Contenu et exclusions | `redacted diagnostic (T4.37) > exports versions, system and states, and leaves out keys, token, peers and request contents` |
| Routes derrière le jeton, dossier `logs` seul | `redacted diagnostic (T4.37) > serves the diagnostic and opens the logs folder only with the token` |
| Journal jamais vidé par l'app | `desktop logs (T4.37) > keeps daemon.log: the shell never empties it, hands the node its log and redacts what it writes` |
| Chemin du journal au démarrage | `desktop logs (T4.37) > gives the log path on the start page, as text, with the folder to open` |
| Version et dossier dans l'espace | `workspace diagnostic (T4.37) > shows the versions and the logs path, opens the folder and copies the path` |
| Diagnostic relu avant copie | `workspace diagnostic (T4.37) > shows the redacted diagnostic for review before offering to copy it` |
| Code reçu affiché | `workspace diagnostic (T4.37) > shows the code it receives with a sentence and copyable technical details` |

## Revue

Revue et revue de sécurité menées par l'agent sur le diff, en passe manuelle bornée (la machine était surchargée par les agents parallèles). Deux défauts corrigés : une rotation dont la réouverture échoue levait une exception dans l'écriture du daemon (elle passe maintenant au repli) ; les anciens `daemon.log` et `app.log` étaient déplacés bruts dans `logs/` alors que l'espace dit le dossier expurgé (ils sont maintenant réécrits ligne à ligne par l'expurgation).

## Non vérifié

App construite et lancée : copie dans WKWebView, WebView2 et WebKitGTK, ouverture du dossier par `open`, `explorer.exe` et `xdg-open`, page de démarrage en échec réel, plantage natif du runtime recueilli par la coque.

## Corrections après la revue adverse de la PR #82

Chaque point a son test de régression, en échec avant la correction : vecteurs partagés `test/fixtures/log-redaction-vectors.json` (Node : `daemon log redaction, review of PR #82 (T4.37) > redacts and keeps: …` ; coque : `redact_stray_follows_the_shared_vectors`), `never keeps the ending of a word that is not a real path`, `refuses to write through a symbolic link, for the log and for a moved legacy log`, `survives a failed close and a failed reopen, and reopens later`, `exports no ending of a key and no control or bidi character that could forge a section (review of PR #82)`, `read_capped_line_keeps_memory_bounded`, `append_stray_stops_past_its_cap_and_never_follows_a_link`. `keeps a legacy log when its redacted copy cannot be written` passait déjà ; il garde le comportement après le passage à l'écriture complète vérifiée.

## Seconde revue : masquer par défaut

Au lieu d'ajouter des motifs, une seule règle écrite dans `docs/LOG_REDACTION.md`, appliquée par le Node (`redactText`) et par la coque (`redact_stray`) : identifiants d'URL jusqu'au dernier `@`, valeur après `Bearer` et après tout nom contenant `pass`, `secret`, `token`, `key`, `auth`, `cred` ou `seed` (guillemets, guillemets échappés, espaces), suites hexadécimales coupées, et toute suite de 16 caractères de clé mêlant lettres et chiffres, chemins compris, sauf UUID et codes `E_…`. Les entrées des deux revues et les cas de la liste fermée sont dans `test/fixtures/log-redaction-vectors.json` (31 vecteurs), passés par les deux implémentations.
