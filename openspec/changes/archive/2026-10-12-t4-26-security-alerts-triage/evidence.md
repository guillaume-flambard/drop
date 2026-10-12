# Preuves T4.26

Exécutées le 12 octobre 2026 sur la branche `t4-26-security-alerts-triage`, macOS (Apple Silicon), Node 24.21, sur
une machine chargée par d'autres sessions (charge moyenne jusqu'à 74).

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint` | vert |
| `pnpm -r typecheck` | vert |
| `pnpm -r test` | 637 tests verts, 3 en dépassement de délai sous la charge (`tooling.test.ts` 300 s, `detect.test.ts` 30 s, `private-replay.test.ts` 60 s) ; les trois fichiers relancés seuls : 49 tests verts |
| `npx openspec validate --all --strict` | 20 éléments valides |
| `openspec-guard@0.3.0 check --require-selector --baseline … --fail-on fail` | vert : 451 critères liés, dont les 13 nouveaux ; `--update-baseline` ne change pas la baseline |
| `review` (gstack) et revue adverse indépendante | voir la PR |
| `cso` (gstack) diff, portée code | partiel, aucune faille établie dans la portée évaluée ; écarts listés dans la PR |

## Tests lancés sur l'ancien code avant la correction

| Test | Ancien code |
| --- | --- |
| réponse pleine de `<think>` non fermés | comportement vert, 39 s au lieu de < 1,5 s |
| TOML de Codex | comportement vert, 28 s |
| YAML de goose | comportement vert, 5 s |
| heredocs non fermés | comportement vert, 86 s |
| `"command":[` répétés | comportement vert, 69 s |
| publication sous `../../escaped` | rouge : aucune erreur levée |

Les tests de lecture par descripteur (configuration, release, log Codex) et de mode 0600 passent aussi sur l'ancien code
pour le comportement : une course ne se rejoue pas de façon déterministe. Ils gardent le comportement de la nouvelle
lecture ; la course est fermée par construction (contrôle et lecture sur le même descripteur).

## Critères et tests

| Critère | Test |
| --- | --- |
| Identifiant qui serait un chemin refusé | `security alerts triage (T4.26) > publishes under a capability id only, never under a path that leaves DROP_HOME` |
| TOML de Codex linéaire | `configuration and reply parsing in linear time (T4.26) > reads Codex TOML arrays, inline tables and pairs as before, in linear time on hostile lines` |
| YAML de goose linéaire | `configuration and reply parsing in linear time (T4.26) > reads goose extensions as before, in linear time on hostile lines` |
| Configuration lue par descripteur | `configuration files read through one descriptor (T4.26) > reads a regular file, refuses a directory or an oversized file, and never waits on a named pipe` |
| Raccourci Windows | `security alerts triage (T4.26) > keeps cmd.exe metacharacters of a Windows shim path inside quotes, and never runs ComSpec` |
| Réponse du modèle linéaire | `configuration and reply parsing in linear time (T4.26) > drops closed reasoning blocks and stays linear on a reply full of unclosed <think>` |
| Heredocs | `noise filter in linear time (T4.26) > drops heredoc bodies as before, and stays linear on unterminated heredocs` |
| Commandes JSON | `noise filter in linear time (T4.26) > finds shell commands in JSON arguments as before, and stays linear on repeated command arrays` |
| Log Codex | `Codex sessions read through one descriptor (T4.26) > reads a log modified since the cut-off and skips an older one, as before` |
| Fichiers de campagne 0600 | `campaign files readable by their owner only (T4.26) > creates campaign files 0600 and narrows a file left wider by an earlier run` |
| Aucune écriture hors des fonctions | `campaign files readable by their owner only (T4.26) > leaves no file write in the campaign that bypasses the owner-only helpers` |
| Release par descripteur | `documentation site > checks a release through the handle it sends, answers 404 for a directory or a pipe and never waits on one (T4.26)` |
| Images épinglées | `container images pinned by digest (T4.26) > pins every base image of every Dockerfile by digest and keeps it under Dependabot` |

## Reste à constater

La fermeture des alertes corrigées par la prochaine analyse CodeQL et Scorecard sur `main`, et la lecture de
`osv-scanner.toml` par Scorecard (documentée, pas encore observée).
