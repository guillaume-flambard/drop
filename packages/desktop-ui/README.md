# @drop/desktop-ui

The user interface of the drop desktop app: the workspace window opened from the tray menu. See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Stack

- React 19, written in TSX.
- shadcn/ui components (`components.json`, style `new-york`) on Radix primitives, under `src/components/ui/`.
- Tailwind CSS 4 (`src/styles.css`), lucide icons.
- Screens live in `src/views/`; `src/api.ts` talks to the local Node API.

The UI holds no security logic. The Node decides; the UI shows and asks.

## Build

The UI is compiled offline and embedded in the Node, which serves it at `/workspace` on `127.0.0.1`:

```sh
node scripts/build-desktop-ui.ts
```

esbuild bundles `src/main.tsx`, the Tailwind CLI builds the stylesheet, and both are written gzipped and base64-encoded to `packages/node/src/workspace-assets.generated.ts`. Commit that file with your source change. Never edit it by hand.

CI runs the gate below, which fails with `E_WORKSPACE_STALE` when the committed assets do not decode to a fresh build of the sources:

```sh
node scripts/build-desktop-ui.ts --check
```

Tailwind scans the whole package folder for class names, not only `src/`. A new non-source file here (like this README) must be excluded with `@source not` in `src/styles.css`, or its words end up in the stylesheet and the gate fails.

## Content security policy

The Node serves the page with a strict CSP (`WORKSPACE_CSP` in `packages/node/src/workspace.ts`): the inline script is allowed by its SHA-256 hash, `connect-src 'self'`, and images, fonts and forms are refused. So:

- No external resources: no CDN, no remote font, no remote image, no analytics.
- Everything the UI needs is bundled at build time.
- No Tauri IPC: the window shows a page served over HTTP by the Node, and gets no Tauri permission.
