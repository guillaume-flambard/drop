# Preuves T4.18

| Critère | Preuve |
|---|---|
| Pas de daemon orphelin | Test « daemon lifecycle (T4.18) > AC stops serving when the shell's stdin pipe closes, and only in that mode » : le daemon surveillé sort avec le code 0 et libère son port ; un `drop serve` sans la variable continue de tourner. |
| Coque tuée par un signal | Recette réelle le 10 octobre 2026 sur la build notarisée (`Notarized Developer ID`), instance séparée sur un `DROP_HOME` temporaire : coque tuée par `kill -9`, daemon arrêté 2 s plus tard, port libéré, ligne `daemon_parent_gone` dans `daemon.log`, relance sans `E_PORT`, second `kill -9` également suivi de l'arrêt du daemon. |

## Revue

Revue adverse et sécurité : aucun critique. Le tube n'est détenu que par le `Child` gardé dans l'état de l'app ; chaque redémarrage du superviseur repasse par `start_daemon` ; double arrêt sans effet. Corrigé : jalons du site plus exacts (invitation « sur test », preuve « consignée »), ports du test vérifiés libres avant usage. Noté : sur macOS, un processus lancé au même instant par un autre fil de la coque pourrait hériter du tube et retarder l'arrêt jusqu'à sa propre fin (risque faible, non corrigé). `/cso` gstack ciblé en mode diff : statut partiel, aucune faille démontrée (seule la coque détient le tube et fixe la variable ; la ligne de journal ne contient ni secret ni contenu).

Tâche prise à la demande explicite de Guillaume (« enchaîne sur T4.18 ») alors que sa dépendance T3.4 reste bloquée par des recettes humaines indépendantes.

Le même commit met à jour la landing et la page d'avancement (T4.1, T4.14, T4.18, limite de débit T3.1d).

## Vérification

`pnpm -s lint`, `pnpm -s typecheck`, `pnpm -r test` (371 tests), `cargo clippy --release` sans avertissement, `openspec validate --all --strict`, openspec-guard avec sélecteurs.
