/**
 * Local-only Drop workspace. React and shadcn-style Radix components are
 * built offline, compressed, and embedded into drop.mjs. No CDN or Tauri IPC.
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { workspaceJsGzipBase64, workspaceCssGzipBase64 } from './workspace-assets.generated.ts';

function decoded(base64: string): string {
  return gunzipSync(Buffer.from(base64, 'base64')).toString('utf8');
}
const script = decoded(workspaceJsGzipBase64).replace(/<\/script/gi, '<\\/script');
const style = decoded(workspaceCssGzipBase64).replace(/<\/style/gi, '<\\/style');
function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64');
}

export const WORKSPACE_CSP = [
  "default-src 'none'",
  "script-src 'sha256-" + hash(script) + "'",
  "style-src 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
].join('; ');

export function renderWorkspace(): string {
  return [
    '<!doctype html><html lang="fr"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    '<title>Drop · Ton espace</title><style>' + style + '</style>',
    '</head><body>',
    '<div id="root"><div role="status" style="padding:32px;font:14px system-ui">Ouverture de ton espace…</div></div>',
    '<script>' + script + '</script>',
    '</body></html>',
  ].join('\n');
}
