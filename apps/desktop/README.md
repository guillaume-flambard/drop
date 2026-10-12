# drop desktop app

The native shell of drop for macOS, Windows and Linux, built with Tauri 2 (T2.4, T3.4, T3.7, T3.8, D30, D84). See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for how it fits with the rest of the repository.

## What it does

- Owns the window, the menu bar or notification area icon, autostart, the installer, signed updates (macOS) and `drop://` deep links.
- Starts and stops the local drop Node (`packages/node`), which ships inside the app with its own Node runtime and `drop-iroh`. The Node stops by itself when the app dies, even when killed (T4.18), on all three systems.
- Shows what the Node serves on `127.0.0.1`: the panel (`/app`) and the React workspace (`/workspace`, built from `packages/desktop-ui`). These pages get no Tauri IPC.
- Holds no business logic: everything goes through the Node's local API, protected by its token.

## Layout

| Path                                      | What it holds                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src-tauri/src/main.rs`                   | The whole shell: tray, windows, daemon lifecycle, deep links, autostart, update, single instance |
| `src-tauri/tauri.conf.json`               | Product name, bundle identifier, CSP of the startup page, resources shared by every system       |
| `src-tauri/tauri.<platform>.conf.json`    | Per system (`macos`, `windows`, `linux`): installer formats and the bundled program names        |
| `src-tauri/capabilities/`                 | Tauri permissions, granted to the startup page only                                              |
| `src-tauri/icons/`                        | App and tray icons (`node scripts/mac-icons.ts` regenerates the inputs)                          |
| `web/index.html`                          | Startup page: boot and failure states with diagnostic codes                                      |
| `updater.pub` (absent for now)            | Public key of the update channel, see `docs/MAC_RELEASE.md`                                       |

The Rust crate is `drop-desktop`, so the executable is `drop-desktop` (`drop-desktop.exe` on Windows). Do not change `productName` or `identifier` in `tauri.conf.json`: they carry the notarized identity, the install location and the update channel.

## Per system

| | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Icon | Menu bar, template image | Notification area, colour icon | AppIndicator, colour icon |
| Opening the panel | Left click, under the icon | Left click, above the taskbar icon | Menu only: Linux icons emit no click |
| Panel window | Borderless popover with the system material | Borderless, always on top | Small normal window, centred |
| Autostart | Login item | `Run` key of the user | `~/.config/autostart` entry |
| Second launch or `drop://` link | Handled by the system | Single instance plugin hands it to the running app | Same, over D-Bus |
| Bundled programs | `node`, `drop-iroh` | `node.exe`, `drop-iroh.exe`, started without a console window | `node`, `drop-iroh` |

The menu is the same everywhere: « Ouvrir le panneau », « Ouvrir mon espace », « Réessayer le démarrage », « Quitter ».

## Run in development

With Node 22+ and Rust (plus Xcode on macOS, the Visual Studio C++ build tools on Windows, or the WebKitGTK packages of the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) on Linux), build an unsigned debug app for the machine you are on:

```sh
node scripts/build-desktop.ts --debug
```

The script bundles the Node and `drop-iroh` into `src-tauri/resources/`, runs `tauri build`, and copies the installers to `dist/desktop/`. To only check that the Rust compiles, without those resources:

```sh
cd apps/desktop/src-tauri
TAURI_CONFIG='{"bundle":{"resources":[]}}' cargo clippy --all-targets
```

## Releases

`.github/workflows/release.yml` builds macOS (Apple silicon, Intel), Windows x64 and Linux x64 and arm64 on GitHub-hosted runners, smoke-tests each installer and drafts a GitHub Release on a `v*` tag. The procedure, the artifacts, signing per system and how a tester installs are in [docs/RELEASE.md](../../docs/RELEASE.md). Mac notarization from a Mac, signed updates and rollback stay in [docs/MAC_RELEASE.md](../../docs/MAC_RELEASE.md).
