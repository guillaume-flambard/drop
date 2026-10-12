## 1. Documentation d'abord

- [x] 1.1 Tauri 2.12.1 et son plugin notification : actions réservées au mobile ; tao 0.37.1 : `content_protected` sur macOS et Windows, sans effet sous Linux.
- [x] 1.2 Apple : `NSUserNotification` déprécié depuis macOS 11 ; actions UserNotifications (catégories, `didReceive`, `destructive`), niveaux d'interruption.
- [x] 1.3 `mac-notification-sys` 0.6.15 lu : actions multiples par clés privées, « fermer » confondu avec une fermeture. Décision : UserNotifications (design).
- [x] 1.4 Windows (toasts et activation) et freedesktop (capacité `actions` facultative) : ce que chaque plateforme permet, noté au design.

## 2. Tests d'abord

- [x] 2.1 Node : route de refus, même chemin que la carte, refus tardifs avec code, aucune autorisation (`packages/node/test/notification-actions.test.ts`) ; ligne `dropNotify` nommée (`packages/node/test/notify.test.ts`).
- [x] 2.2 Panneau : arrivée sur `request=<dropId>` (`packages/desktop-ui/test/notification-entry.test.tsx`).
- [x] 2.3 Coque : tests Rust de `notifications.rs` et contrat lisible par la CI JavaScript (`test/desktop-notifications.test.ts`).

## 3. Réalisation

- [x] 3.1 `packages/node` : `decideApproval`, `/ui/decide` avec code, `POST /ui/notification/deny`, `notify` et `daemon` qui nomment la demande.
- [x] 3.2 `packages/desktop-ui` : `notification-entry.ts`, branché dans `PanelApp.tsx` ; bundle régénéré.
- [x] 3.3 `apps/desktop/src-tauri` : `notifications.rs` (UserNotifications, deux actions, refus par le Node), `main.rs` (actions, `content_protected`), `Cargo.toml` sans `mac-notification-sys`.
- [x] 3.4 Docs : `docs/product/UX_UI.md`, `docs/product/APP_FLOW.md`, `docs/RELEASE.md`.

## 4. Vérification

- [x] 4.1 `pnpm -r lint && pnpm -r typecheck && pnpm -r test`, `build-desktop-ui.ts --check`.
- [x] 4.2 `cargo check`, `cargo clippy --all-targets`, `cargo test` dans `apps/desktop/src-tauri` (macOS).
- [x] 4.3 `openspec validate t4-30-notification-actions --strict` et `openspec-guard`.
- [x] 4.4 Revue du diff et revue de sécurité.
- [ ] 4.5 Recette manuelle de l'app signée par Guillaume (voir `evidence.md`).
