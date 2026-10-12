# Preuves T4.42

Exécutées le 12 octobre 2026 sur la branche `t4-42-hardening-leftovers`, macOS (Apple Silicon, 10 cœurs), Node 24.21,
sur une machine partagée avec d'autres sessions (charge moyenne relevée à chaque mesure).

## Tests lancés sur l'ancien code avant la correction

| Test | Ancien code |
| --- | --- |
| tube nommé à la place de la configuration de Zed (`clients-auto.test.ts`, écrivain retardé de 3 s) | rouge : l'aperçu attend 3 020 ms l'écrivain |
| écriture du banc par un lien symbolique (script sur `owner-files.ts` d'`origin/main`) | la cible est réécrite (« overwritten ») et passe en 0600 |
| ajout du banc par un second lien physique | la cible reçoit l'ajout et passe en 0600 |
| tube nommé sous un nom de fichier du banc (première version de la branche, sans `O_NONBLOCK`) | l'ouverture attend un lecteur (3,8 s avec un lecteur retardé, sans fin sinon) ; trouvé par la revue adverse |
| `ownerOnlyDir`, `inParallel`, option `followLinks` | n'existaient pas (import en échec) |

## Démarrage du banc, avant et après

Mesure : `node packages/simulation/src/cli.ts run --nodes 6 --owners 2 --requests 1 --duration 2`, chronométrée de
son lancement à la ligne « all nodes serving », depuis un worktree détaché d'`origin/main` (avant) et depuis la
branche (après), en alternance pour partager les conditions. Chaque processus mesuré compte 6 `init`, 2 `publish`,
le relais et 6 `serve`.

| Conditions | Avant (s) | Après (s) | Médiane avant → après |
| --- | --- | --- | --- |
| charge ambiante 8 à 10 (4 paires) | 5,9 ; 11,3 ; 4,8 ; 5,8 | 2,8 ; 3,5 ; 5,3 ; 1,9 | 5,9 → 3,2 s |
| 10 boucles CPU ajoutées, une par cœur, charge 10 à 48 (3 paires) | 19,9 ; 7,2 ; 24,7 | 4,4 ; 9,1 ; 10,5 | 19,9 → 9,1 s |
| avant seul, charge ambiante 21 à 47 (3 runs) | 37,7 ; 39,2 ; 17,9 | | |

L'appairage (environ 7 s, deux appairages) ne change pas. La variance reste forte sur une machine partagée ; le gain
vient des démarrages à froid qui se recouvrent.

## Vérification

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint`, `pnpm -r typecheck` | verts (après fusion d'`origin/main`, puis après les retours de revue) |
| `pnpm -r test`, suite complète après fusion d'`origin/main` | 94 fichiers, 689 tests verts |
| après les retours de revue : `simulation`, `linear-parsing.test.ts`, `clients-auto.test.ts` | 10 fichiers, 51 tests verts |
| `openspec validate t4-42-hardening-leftovers --strict`, puis `openspec validate --all --strict` après archivage | valide ; 20 éléments valides (les nouvelles exigences sont scindées pour rester sous 500 caractères) |
| `openspec-guard@0.3.0 check --require-selector --baseline … --fail-on fail` | vert : 483 critères liés, dont les 7 nouveaux ; `--update-baseline` ne change pas la baseline |
| revue adverse indépendante (agent séparé, diff seul) | 1 défaut bloquant (tube nommé aux écritures du banc) et 8 remarques ; corrigés ou consignés dans `design.md` |
| `review` (gstack) | aucun défaut restant après correction |
| `cso` (gstack), `--code --diff --offline` | partiel : aucune faille établie dans la portée évaluée ; Windows prouvé seulement par la CI |

Windows : `O_NOFOLLOW`, `O_NONBLOCK` et `O_DIRECTORY` n'y existent pas ; les contrôles `lstat` et `fstat` et les tests
qui ne sont pas réservés à macOS et Linux ne sont prouvés que par la CI `test-windows`.
