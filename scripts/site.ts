import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist/site');
const sourceBranch = 'https://github.com/guillaume-flambard/drop/blob/main/';
const sourceFiles: Record<string, string> = {
  'index.html': 'site/index.html',
  'guide.html': 'site/guide.html',
  'avancement.html': 'site/avancement.html',
  'styles.css': 'site/styles.css',
  'favicon.svg': 'site/favicon.svg',
  'diagrams/journey.svg': 'docs/diagrams/journey.svg',
  'diagrams/architecture.svg': 'docs/diagrams/architecture.svg',
  'diagrams/roadmap.svg': 'docs/diagrams/roadmap.svg',
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
  '.md': 'text/markdown; charset=utf-8',
};

function exportMarkdown(text: string): string {
  return (
    text.replace(/\]\(([^)]+)\)/g, (match: string, target: string) => {
      if (target.startsWith('#') || /^https?:/.test(target)) return match;
      const [path] = target.split('#');
      if (path && sourceFiles[`downloads/${path}`]) return match;
      if (target.startsWith('diagrams/')) return `](../${target})`;
      return `](${sourceBranch}${posix.normalize(posix.join('docs', target))})`;
    }) +
    '\n> Les liens vers les sources GitHub nécessitent un accès au dépôt, encore privé. Ils suivent la branche main, pas un snapshot audité.\n'
  );
}

/** The public surface is explicit: neither the repository nor the owner's DROP_HOME is served. */
export async function buildSite(directory = output): Promise<Map<string, Buffer>> {
  const assets = new Map<string, Buffer>();
  for (const [destination, source] of Object.entries(sourceFiles)) {
    const original = await readFile(join(root, source));
    const data = source.endsWith('.md') ? Buffer.from(exportMarkdown(original.toString('utf8'))) : original;
    assets.set(`/${destination}`, data);
  }
  // This is a generated output directory, never a source directory. Remove stale public output too.
  await rm(directory, { recursive: true, force: true });
  for (const [path, data] of assets) {
    const destination = join(directory, path.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  return assets;
}

export async function startSite(assets: ReadonlyMap<string, Buffer>, port = 4173) {
  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const boundAddress = server.address();
    const boundPort = boundAddress && typeof boundAddress === 'object' ? boundAddress.port : undefined;
    if (
      req.headers.host !== `127.0.0.1:${String(boundPort)}` &&
      req.headers.host !== `localhost:${String(boundPort)}`
    ) {
      res.writeHead(403).end('E_HOST');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
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
    const data = assets.get(path);
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('E_NOT_FOUND');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
      'Content-Length': data.length,
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      accept();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('E_SITE_ADDRESS');
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    stop: () =>
      new Promise<void>((accept, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else accept();
        });
      }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] ?? 'build';
    if (command !== 'build' && command !== 'preview') throw new Error('E_SITE_COMMAND: use build or preview');
    const assets = await buildSite();
    process.stdout.write(`Site built: ${String(assets.size)} public files in ${output}\n`);
    if (command === 'preview') {
      const preview = await startSite(assets);
      process.stdout.write(`Preview: ${preview.url}\nStop with Ctrl+C. Re-run after editing.\n`);
    }
  } catch (error) {
    process.stderr.write(`E_SITE: ${error instanceof Error ? error.message : 'unexpected failure'}\n`);
    process.exitCode = 1;
  }
}
