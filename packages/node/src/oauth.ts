import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { join } from 'node:path';
import { OAuthSignIns, OAuthStore, runtimeOAuth, type ConnectOptions } from '@drop/capabilities';
import type { DropHome } from './home.ts';

/**
 * Where this node keeps its OAuth sign-ins to remote MCP servers (T2.17, D74): DROP_HOME/oauth, 0700, one file 0600 per
 * server. The browser comes back to the local API, on 127.0.0.1 only.
 */
export { OAuthSignIns, OAuthStore, runtimeOAuth };

export function oauthStore(home: DropHome): OAuthStore {
  return new OAuthStore(join(home.root, 'oauth'));
}

export function oauthRedirect(apiPort: number): string {
  return `http://127.0.0.1:${String(apiPort)}/oauth/callback`;
}

/** What connectMcp needs to use this node's sign-ins: stored tokens, refreshed when they expire. */
export function oauthConnect(home: DropHome, apiPort: number): ConnectOptions {
  return { oauth: runtimeOAuth(oauthStore(home), oauthRedirect(apiPort)) };
}

/** Opens a sign-in page in the browser on macOS, https only, the URL passed as one argument; elsewhere it is shown. */
export function openInBrowser(url: string): void {
  if (platform() !== 'darwin' || !url.startsWith('https://')) return;
  execFile('open', [url], () => {
    // Best effort: the panel and `drop connect` also show the link.
  });
}
