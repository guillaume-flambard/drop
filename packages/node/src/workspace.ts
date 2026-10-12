/**
 * Local-only Drop pages: the workspace window (/workspace) and the menu bar panel (/app, T4.24). React and
 * shadcn-style Radix components are built offline, compressed, and embedded into drop.mjs. No CDN, no Tauri IPC.
 * Each page carries its script inline, allowed by its exact SHA-256 hash: no other script can run.
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { panelJsGzipBase64, workspaceCssGzipBase64, workspaceJsGzipBase64 } from './workspace-assets.generated.ts';

function decoded(base64: string): string {
  return gunzipSync(Buffer.from(base64, 'base64')).toString('utf8');
}
const inlineScript = (base64: string): string => decoded(base64).replace(/<\/script/gi, '<\\/script');
const style = decoded(workspaceCssGzipBase64).replace(/<\/style/gi, '<\\/style');

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64');
}

/** Nothing but this page's own script, its inline style, and calls back to the same Node. */
export function strictCsp(script: string): string {
  return [
    "default-src 'none'",
    "script-src 'sha256-" + hash(script) + "'",
    "style-src 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'none'",
    "font-src 'none'",
    "form-action 'none'",
  ].join('; ');
}

function page(options: { title: string; htmlClass?: string; loading: string; script: string }): string {
  return [
    '<!doctype html><html lang="fr"' + (options.htmlClass ? ' class="' + options.htmlClass + '"' : '') + '><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    '<title>' + options.title + '</title><style>' + style + '</style>',
    '</head><body>',
    '<div id="root"><div role="status" style="padding:24px;font:13px system-ui">' + options.loading + '</div></div>',
    '<script>' + options.script + '</script>',
    '</body></html>',
  ].join('\n');
}

const workspaceScript = inlineScript(workspaceJsGzipBase64);
export const WORKSPACE_CSP = strictCsp(workspaceScript);

export function renderWorkspace(): string {
  return page({ title: 'Drop · Ton espace', loading: 'Ouverture de ton espace…', script: workspaceScript });
}

const panelScript = inlineScript(panelJsGzipBase64);
export const PANEL_CSP = strictCsp(panelScript);

/** The menu bar panel: same components, tokens and CSP rules as the workspace, in a 380 × 620 popover. */
export function renderPanel(): string {
  return page({ title: 'drop', htmlClass: 'drop-panel', loading: 'Connexion…', script: panelScript });
}
