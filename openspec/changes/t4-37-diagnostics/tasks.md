## 1. Documentation d'abord

- [ ] 1.1 Node.js 24 (`process` : `uncaughtException`, `unhandledRejection` ; `fs.openSync` et mode à la création), W3C Secure Contexts (`127.0.0.1`), chemins de journaux Tauri 2 (`app_log_dir`), partage de fichiers ouverts sous Windows (libuv, std Rust).
- [ ] 1.2 Relecture du code : `start_daemon` et `log_error` de `main.rs`, sorties d'erreur de `daemon.ts`, `api.ts`, `cli.ts`, scanner `scanSecrets`, `WorkspaceApiError`, page de démarrage.

## 2. Tests d'abord

- [ ] 2.1 Journal : gardé au redémarrage, rotation par taille et âge, en-tête, modes, expurgation des secrets plantés, plantage et écritures égarées (`packages/node/test/daemon-log.test.ts`).
- [ ] 2.2 Diagnostic : secret planté jamais exporté, contenu et exclusions, routes derrière le jeton (`packages/node/test/diagnostic.test.ts`).
- [ ] 2.3 Mon espace : page « Diagnostic », revue avant copie, code d'erreur et détails (`packages/desktop-ui/test/workspace.test.tsx`).
- [ ] 2.4 Coque et page de démarrage : contrats lus dans `main.rs` et `index.html` (`test/desktop-logs.test.ts`), `cargo test` pour `redact_stray` et `append_capped`.

## 3. Réalisation

- [ ] 3.1 `packages/node` : `logs.ts` (expurgation, journal tournant, installation), `diagnostic.ts`, `version.ts`, CLI `serve`, routes `/ui/admin/diagnostic` et `/ui/admin/logs/open`, versions dans `/ui/admin/status`.
- [ ] 3.2 `apps/desktop` : journal en ajout dans `logs/`, `DROP_LOG=file`, `DROP_APP_VERSION`, sortie brute recueillie et expurgée, `app.log` plafonné, commande `open_logs`, chemin du journal sur la page de démarrage.
- [ ] 3.3 `packages/desktop-ui` : code d'erreur lu dans `error`, bandeau avec détails, page « Diagnostic » ; ressources recompilées.
- [ ] 3.4 Docs : `docs/essais/README.md` (envoyer un diagnostic, dossier `logs/`), `docs/product/UX_UI.md`.

## 4. Vérification

- [ ] 4.1 `pnpm -r lint && pnpm -r typecheck && pnpm -r test`, `node --experimental-strip-types scripts/build-desktop-ui.ts --check`, `cargo test` de la coque, `openspec validate --strict`, openspec-guard (`--fail-on fail` puis `--update-baseline`).
- [ ] 4.2 Revue (`review`) et revue de sécurité (`cso`) du diff : node, journaux, secrets.
