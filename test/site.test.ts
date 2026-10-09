import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSite, startSite } from '../scripts/site.ts';

describe('documentation site', () => {
  let directory: string;
  let preview: Awaited<ReturnType<typeof startSite>>;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'drop-site-test-'));
    const assets = await buildSite(directory);
    preview = await startSite(assets, 0);
  });

  afterAll(async () => {
    await preview.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it('serves the three pages, their local links and anchors, and all diagram alternatives', async () => {
    for (const page of ['index.html', 'guide.html', 'avancement.html']) {
      const response = await fetch(`${preview.url}/${page}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('<html lang="fr">');
      expect(html).toContain('Aller au contenu');
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const target = new URL(match[1] ?? '', `${preview.url}/${page}`);
        expect(target.origin).toBe(preview.url);
        const linked = await fetch(target);
        expect(linked.status, target.href).toBe(200);
        if (target.hash) expect(await linked.text(), target.href).toContain(`id="${target.hash.slice(1)}"`);
      }
      for (const match of html.matchAll(/<img\b[^>]*>/g)) expect(match[0]).toMatch(/\balt="[^"]*"/);
    }
  });

  it('serves only the selected public assets and refuses traversal, mutations and invalid encodings', async () => {
    for (const path of ['/package.json', '/AGENTS.md', '/.git/config', '/.env', '/site.ts', '/%2e%2e%2fpackage.json']) {
      const response = await fetch(`${preview.url}${path}`);
      expect(response.status, path).toBe(404);
    }
    expect((await fetch(`${preview.url}/%ZZ`)).status).toBe(400);
    expect((await fetch(preview.url, { method: 'POST' })).status).toBe(405);
    const head = await fetch(preview.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-security-policy')).toContain("script-src 'none'");
    const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(preview.url, { headers: { Host: 'untrusted.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    expect(hostStatus).toBe(403);
  });

  it('builds reproducibly and keeps the selected Markdown guides readable together', async () => {
    const first = await readFile(join(directory, 'guide.html'), 'utf8');
    await writeFile(join(directory, 'stale-private.txt'), 'must not survive a rebuild');
    await buildSite(directory);
    expect(await readdir(directory)).not.toContain('stale-private.txt');
    expect(await readFile(join(directory, 'guide.html'), 'utf8')).toBe(first);
    const guide = await readFile(join(directory, 'downloads/GUIDE.md'), 'utf8');
    expect(guide).toContain('https://github.com/guillaume-flambard/drop/blob/main/');
    expect(guide).toContain('../diagrams/journey.svg');
    expect(guide).not.toContain('](../packages/');
    for (const name of [
      'GUIDE',
      'AVANCEMENT',
      'ONBOARDING',
      'MODELS',
      'OPEN_SOURCE',
      'ACCEPTANCE',
      'PRIVATE_PROFILE',
    ]) {
      const response = await fetch(`${preview.url}/downloads/${name}.md`);
      expect(response.status, name).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/markdown');
      for (const match of (await response.text()).matchAll(/\]\(([^)]+)\)/g)) {
        const target = new URL(match[1] ?? '', `${preview.url}/downloads/${name}.md`);
        if (target.origin === preview.url) expect((await fetch(target)).status, target.href).toBe(200);
      }
    }
    expect((await fetch(`${preview.url}/downloads/DECISIONS.md`)).status).toBe(404);
  });
});
