import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile, type FileHandle } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, posix, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { UPDATE_ARCHIVE } from './mac-updates.ts';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist/site');
const sourceBranch = 'https://github.com/guillaume-flambard/drop/blob/main/';
const sourceFiles: Record<string, string> = {
  'index.html': 'site/index.html',
  'demarrer.html': 'site/demarrer.html',
  'cas.html': 'site/cas.html',
  'securite.html': 'site/securite.html',
  'guide.html': 'site/guide.html',
  'avancement.html': 'site/avancement.html',
  // The page a join link opens (T4.23); `join/index.html` serves `/join` from a plain static export too.
  'join.html': 'site/join.html',
  'join/index.html': 'site/join.html',
  'styles.css': 'site/styles.css',
  'favicon.svg': 'site/favicon.svg',
  'diagrams/journey.svg': 'docs/diagrams/journey.svg',
  'diagrams/architecture.svg': 'docs/diagrams/architecture.svg',
  'diagrams/roadmap.svg': 'docs/diagrams/roadmap.svg',
  'demo/consent-traefik.jpg': 'docs/demo/cc-01-consent-traefik.jpg',
  'demo/consent-julie.jpg': 'docs/demo/cc-02-consent-julie.jpg',
  'demo/review-julie.jpg': 'docs/demo/cc-03-review-julie.jpg',
  'downloads/GUIDE.md': 'docs/GUIDE.md',
  'downloads/AVANCEMENT.md': 'docs/AVANCEMENT.md',
  'downloads/ONBOARDING.md': 'docs/ONBOARDING.md',
  'downloads/MODELS.md': 'docs/MODELS.md',
  'downloads/OPEN_SOURCE.md': 'docs/OPEN_SOURCE.md',
  'downloads/ACCEPTANCE.md': 'docs/ACCEPTANCE.md',
  'downloads/PRIVATE_PROFILE.md': 'docs/PRIVATE_PROFILE.md',
  'downloads/HERMES.md': 'docs/HERMES.md',
};
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.gz': 'application/gzip',
  '.dmg': 'application/x-apple-diskimage',
  '.mcpb': 'application/zip',
};
const CSP =
  "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The pages that run a script: only the join page, which reads the invite from the fragment (T4.23, D95). */
const JOIN_PAGES = new Set(['/join.html', '/join/index.html']);

/**
 * The join page's policy: its one inline script, pinned by its SHA-256, and nothing to connect to, so the invite in
 * the fragment cannot leave the page. `frame-ancestors` only works as a header, so the meta copy goes without it.
 */
export function joinCsp(html: string, header = true): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1 || /<script\b[^>]*\bsrc=/i.test(html))
    throw new Error('E_SITE_JOIN: one inline script expected');
  const hash = createHash('sha256')
    .update(scripts[0]?.[1] ?? '', 'utf8')
    .digest('base64');
  return [
    "default-src 'none'",
    `script-src 'sha256-${hash}'`,
    "style-src 'self'",
    "img-src 'self'",
    "connect-src 'none'",
    ...(header ? ["frame-ancestors 'none'"] : []),
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * What the home page offers (T2.6, D72). `beta`: ask for access, no download link, while the app is not notarized and
 * npm is blocked (T2.4, T2.11). `open`: the Mac app, the Claude Desktop bundle and the connection guides.
 */
export interface SiteConfig {
  installs: 'beta' | 'open';
  /** The address a beta request goes to; empty for a plain "on invitation" text. */
  contact: string;
}

const EMAIL = /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[a-z]{2,}$/i;

export async function readSiteConfig(): Promise<SiteConfig> {
  const raw = JSON.parse(await readFile(join(root, 'site/site.json'), 'utf8')) as Partial<SiteConfig>;
  if (raw.installs !== 'beta' && raw.installs !== 'open') throw new Error('E_SITE_CONFIG: installs is beta or open');
  return { installs: raw.installs, contact: typeof raw.contact === 'string' ? raw.contact : '' };
}

/**
 * Keeps the `<!-- if:flag -->…<!-- /if:flag -->` blocks whose flag holds and drops the others, then fills
 * `{{contact}}`. Flags: beta, open, contact, no-contact.
 */
export function renderPage(html: string, config: SiteConfig): string {
  if (config.contact !== '' && !EMAIL.test(config.contact))
    throw new Error(`E_SITE_CONTACT: ${config.contact} is not an email address`);
  const flags: Record<string, boolean> = {
    beta: config.installs === 'beta',
    open: config.installs === 'open',
    contact: config.contact !== '',
    'no-contact': config.contact === '',
  };
  // Blocks may nest (contact inside beta): repeat until no block is left.
  let kept = html;
  for (let previous = ''; previous !== kept;) {
    previous = kept;
    kept = kept.replace(/<!-- if:([a-z-]+) -->([\s\S]*?)<!-- \/if:\1 -->/g, (_block, flag: string, inner: string) => {
      if (!(flag in flags)) throw new Error(`E_SITE_TEMPLATE: unknown flag ${flag}`);
      return flags[flag] ? inner : '';
    });
  }
  if (/<!-- \/?if:/.test(kept)) throw new Error('E_SITE_TEMPLATE: unbalanced block');
  return kept.replaceAll('{{contact}}', config.contact);
}

function exportMarkdown(text: string): string {
  return (
    text.replace(/\]\(([^)]+)\)/g, (match: string, target: string) => {
      if (target.startsWith('#') || /^https?:/.test(target)) return match;
      const [path] = target.split('#');
      if (path && sourceFiles[`downloads/${path}`]) return match;
      if (target.startsWith('diagrams/')) return `](../${target})`;
      return `](${sourceBranch}${posix.normalize(posix.join('docs', target))})`;
    }) +
    '\n> Le dépôt est public et open source (Apache-2.0) depuis le 11 octobre 2026. Les liens vers les sources GitHub suivent la branche main, pas un snapshot audité.\n'
  );
}

/** The public surface is explicit: neither the repository nor the owner's DROP_HOME is served. */
export async function collectSite(config?: SiteConfig): Promise<Map<string, Buffer>> {
  const settings = config ?? (await readSiteConfig());
  const assets = new Map<string, Buffer>();
  for (const [destination, source] of Object.entries(sourceFiles)) {
    const original = await readFile(join(root, source));
    const page = source.endsWith('.html') ? renderPage(original.toString('utf8'), settings) : '';
    const data = source.endsWith('.md')
      ? Buffer.from(exportMarkdown(original.toString('utf8')))
      : JOIN_PAGES.has(`/${destination}`)
        ? Buffer.from(page.replace('{{joinCsp}}', joinCsp(page, false)))
        : source.endsWith('.html')
          ? Buffer.from(page)
          : original;
    assets.set(`/${destination}`, data);
  }
  return assets;
}

export async function buildSite(directory = output, config?: SiteConfig): Promise<Map<string, Buffer>> {
  const assets = await collectSite(config);
  // This is a generated output directory, never a source directory. Remove stale public output too.
  await rm(directory, { recursive: true, force: true });
  for (const [path, data] of assets) {
    const destination = join(directory, path.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  return assets;
}

/** Release files served by the public site (D70, D72), by exact name: nothing else in the directory is reachable. */
const RELEASES: { prefix: string; name: RegExp }[] = [
  // The archive names come from scripts/mac-updates.ts, which writes them: the two never disagree on a version.
  { prefix: '/updates/', name: new RegExp(`^latest\\.json$|${UPDATE_ARCHIVE.source}`) },
  { prefix: '/downloads/', name: /^drop\.(?:dmg|mcpb)$/ },
];

interface ServeOptions {
  allowedHosts: string[];
  releasesDir?: string | undefined;
  hsts?: boolean;
}

/** A release file that exists but cannot be read answers 500, never crashes the site (logged as E_SITE_RELEASE). */
function releaseFailed(res: ServerResponse, name: string, error: unknown): void {
  const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
  process.stderr.write(`E_SITE_RELEASE: ${name} (${code})\n`);
  if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('E_SITE_RELEASE');
  else res.destroy();
}

async function serveRelease(res: ServerResponse, method: string, releasesDir: string, name: string): Promise<boolean> {
  const path = join(releasesDir, name);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) return false;
  // Open before answering: a file that cannot be read still gets a status line.
  let file: FileHandle;
  try {
    file = await open(path, 'r');
  } catch (error) {
    releaseFailed(res, name, error);
    return true;
  }
  res.writeHead(200, {
    'Content-Type': contentTypes[extname(name)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  });
  if (method === 'HEAD') {
    await file.close();
    res.end();
    return true;
  }
  // The stream closes the handle when it ends or fails.
  await pipeline(file.createReadStream(), res).catch((error: unknown) => {
    releaseFailed(res, name, error);
  });
  return true;
}

function handler(assets: ReadonlyMap<string, Buffer>, options: ServeOptions) {
  const pagePolicies = new Map(
    [...assets].filter(([path]) => JOIN_PAGES.has(path)).map(([path, data]) => [path, joinCsp(data.toString('utf8'))]),
  );
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', CSP);
    if (options.hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (!options.allowedHosts.includes(req.headers.host ?? '')) {
      res.writeHead(403).end('E_HOST');
      return;
    }
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('E_METHOD');
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    } catch {
      res.writeHead(400).end('E_PATH');
      return;
    }
    if (path === '/') path = '/index.html';
    if (path === '/join' || path === '/join/') path = '/join.html';
    const data = assets.get(path);
    if (data) {
      const policy = pagePolicies.get(path);
      if (policy) res.setHeader('Content-Security-Policy', policy);
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
        'Content-Length': data.length,
      });
      res.end(method === 'HEAD' ? undefined : data);
      return;
    }
    const release = RELEASES.find((entry) => path.startsWith(entry.prefix));
    const name = release ? path.slice(release.prefix.length) : '';
    if (release && options.releasesDir && release.name.test(name)) {
      if (await serveRelease(res, method, options.releasesDir, name)) return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('E_NOT_FOUND');
  };
}

async function listen(handle: ReturnType<typeof handler>, port: number, host: string) {
  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500).end('E_SITE');
      else res.destroy();
    });
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      accept();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('E_SITE_ADDRESS');
  return {
    port: address.port,
    url: `http://${host}:${String(address.port)}`,
    stop: () =>
      new Promise<void>((accept, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else accept();
        });
      }),
  };
}

/** Local preview on 127.0.0.1 only. */
export async function startSite(assets: ReadonlyMap<string, Buffer>, port = 4173) {
  // Filled once the port is known (port 0 picks one); no request can arrive before this function returns.
  const allowedHosts: string[] = [];
  const site = await listen(handler(assets, { allowedHosts }), port, '127.0.0.1');
  allowedHosts.push(`127.0.0.1:${String(site.port)}`, `localhost:${String(site.port)}`);
  return { url: site.url, stop: site.stop };
}

/** The public site behind Traefik on drop.memolabs.dev (T2.6, D72), with the release files of the Mac app. */
export async function startPublicSite(
  assets: ReadonlyMap<string, Buffer>,
  options: { port: number; host: string; publicHost: string; releasesDir: string },
) {
  return listen(
    handler(assets, { allowedHosts: [options.publicHost], releasesDir: options.releasesDir, hsts: true }),
    options.port,
    options.host,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] ?? 'build';
    if (command === 'serve') {
      // In the image: nothing is written, the pages are rendered in memory from the sources.
      const site = await startPublicSite(await collectSite(), {
        port: Number(process.env.SITE_PORT ?? 8080),
        host: process.env.SITE_HOST ?? '0.0.0.0',
        publicHost: process.env.SITE_PUBLIC_HOST ?? 'drop.memolabs.dev',
        releasesDir: process.env.SITE_RELEASES_DIR ?? '/srv/releases',
      });
      process.stdout.write(`Site on ${site.url} for ${process.env.SITE_PUBLIC_HOST ?? 'drop.memolabs.dev'}\n`);
    } else if (command === 'build' || command === 'preview') {
      const assets = await buildSite();
      process.stdout.write(`Site built: ${String(assets.size)} public files in ${output}\n`);
      if (command === 'preview') {
        const preview = await startSite(assets);
        process.stdout.write(`Preview: ${preview.url}\nStop with Ctrl+C. Re-run after editing.\n`);
      }
    } else throw new Error('E_SITE_COMMAND: use build, preview or serve');
  } catch (error) {
    process.stderr.write(`E_SITE: ${error instanceof Error ? error.message : 'unexpected failure'}\n`);
    process.exitCode = 1;
  }
}
