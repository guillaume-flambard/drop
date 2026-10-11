# drop desktop app

The native shell of drop for macOS, Windows and Linux, built with Tauri 2 (T2.4, T3.4, D30). See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for how it fits with the rest of the repository.

## What it does

- Owns the window, the menu bar or tray icon, autostart, the installer, signed updates and `drop://` deep links.
- Starts and stops the local drop Node (`packages/node`), which ships inside the app with its own Node runtime and `drop-iroh`.
- Shows what the Node serves on `127.0.0.1`: the panel (`/app`) and the React workspace (`/workspace`, built from `packages/desktop-ui`). These pages get no Tauri IPC.
- Holds no business logic: everything goes through the Node's local API, protected by its token.

## Layout

| Path                              | What it holds                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `src-tauri/src/main.rs`           | The whole shell: tray, windows, daemon lifecycle, deep links, autostart, update |
| `src-tauri/tauri.conf.json`       | Product name, bundle identifier, CSP of the startup page, bundled resources     |
| `src-tauri/capabilities/`         | Tauri permissions, granted to the startup page only                             |
| `src-tauri/icons/`                | App and tray icons (`node scripts/mac-icons.ts` regenerates the inputs)         |
| `web/index.html`                  | Startup page: boot and failure states with diagnostic codes                     |
| `updater.pub` (absent for now)    | Public key of the update channel, see `docs/MAC_RELEASE.md`                      |

Do not change `productName` or `identifier` in `tauri.conf.json`: they carry the notarized identity and the update channel.

## Run in development

On a Mac with Node 22+, Rust and Xcode, build an unsigned debug app:

```sh
node scripts/build-mac.ts --debug
```

The script bundles the Node and `drop-iroh` into `src-tauri/resources/`, then runs `tauri build`. To only check that the Rust compiles, without those resources:

```sh
cd apps/desktop/src-tauri
TAURI_CONFIG='{"bundle":{"resources":[]}}' cargo check
```

## Build per platform

- **macOS**: `node scripts/build-mac.ts`. Signed and notarized releases, updates, rollback and acceptance are described in [docs/MAC_RELEASE.md](../../docs/MAC_RELEASE.md), the only procedure to follow.
- **Windows and Linux**: same shell, build scripts not written yet. Platform-specific Rust stays in `src-tauri` behind `#[cfg(target_os = ...)]`.
