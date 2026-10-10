## 1. Tests d'abord

- [x] 1.1 Test : `drop serve` avec `DROP_EXIT_WITH_PARENT=stdin` sort quand son entrée standard se ferme et libère son port ; sans la variable, il continue.

## 2. Réalisation

- [x] 2.1 `cli.ts` (`serve`) : surveillance de stdin dans ce mode, arrêt propre, journal `daemon_parent_gone`.
- [x] 2.2 `main.rs` : stdin en tube et variable d'environnement au lancement du daemon.
- [x] 2.3 Recette réelle : app notarisée tuée par `kill -9`, daemon arrêté, port libéré, relance sans `E_PORT`.

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `cargo clippy`, openspec-guard avec sélecteurs et baseline sans ajout.
- [x] 3.2 `/review` (gstack) et `/cso` (la change touche `node`).
