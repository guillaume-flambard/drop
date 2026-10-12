# @drop/desktop-ui

The user interface of the drop desktop app: the menu bar panel (`/app`, a 380 x 620 popover under the tray icon) and the workspace window opened from the tray menu. Both use the same components and design tokens. See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Stack

- React 19, written in TSX.
- shadcn/ui components (`components.json`, style `new-york`) on Radix primitives, under `src/components/ui/`.
- Tailwind CSS 4 (`src/styles.css`), lucide icons.
- Panel: entry `src/panel/main.tsx`, tabs Demandes, Équipe and Mes outils; pure rules and wording in `src/panel/logic.ts`.
- Workspace: entry `src/main.tsx`, screens in `src/views/`.
- `src/api.ts` talks to the local Node API.
- Component tests run in happy-dom: `packages/desktop-ui/test/`.

The UI holds no security logic. The Node decides; the UI shows and asks.

## Build

The UI is compiled offline and embedded in the Node, which serves the panel at `/app` and the workspace at `/workspace` on `127.0.0.1`:

```sh
node scripts/build-desktop-ui.ts
```

esbuild bundles `src/main.tsx` and `src/panel/main.tsx`, the Tailwind CLI builds the one stylesheet they share, and both are written gzipped and base64-encoded to `packages/node/src/workspace-assets.generated.ts`. Commit that file with your source change. Never edit it by hand.

CI runs the gate below, which fails with `E_WORKSPACE_STALE` when the committed assets do not decode to a fresh build of the sources:

```sh
node scripts/build-desktop-ui.ts --check
```

Tailwind scans the whole package folder for class names, not only `src/`. A new non-source file here (like this README) must be excluded with `@source not` in `src/styles.css`, or its words end up in the stylesheet and the gate fails.

## Content security policy

The Node serves each page with a strict CSP (`PANEL_CSP` and `WORKSPACE_CSP` in `packages/node/src/workspace.ts`): the inline script is allowed by its SHA-256 hash, `connect-src 'self'`, and images, fonts and forms are refused. So:

- No external resources: no CDN, no remote font, no remote image, no analytics.
- Everything the UI needs is bundled at build time.
- No Tauri IPC: the window shows a page served over HTTP by the Node, and gets no Tauri permission.
