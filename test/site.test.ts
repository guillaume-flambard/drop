import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSite, collectSite, startPublicSite, startSite } from '../scripts/site.ts';

const PAGES = ['index.html', 'demarrer.html', 'cas.html', 'securite.html', 'guide.html', 'avancement.html'];
const text = (assets: ReadonlyMap<string, Buffer>, path: string): string => assets.get(path)?.toString('utf8') ?? '';

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

  it('serves every page, their local links and anchors, and all image alternatives', async () => {
    for (const page of PAGES) {
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

  it('builds reproducibly and keeps Markdown exports linked to the audited source snapshot', async () => {
    const first = await readFile(join(directory, 'guide.html'), 'utf8');
    await writeFile(join(directory, 'stale-private.txt'), 'must not survive a rebuild');
    await buildSite(directory);
    expect(await readdir(directory)).not.toContain('stale-private.txt');
    expect(await readFile(join(directory, 'guide.html'), 'utf8')).toBe(first);
    const guide = await readFile(join(directory, 'downloads/GUIDE.md'), 'utf8');
    expect(guide).toContain('https://github.com/guillaume-flambard/drop/blob/cacf1cc/');
    expect(guide).toContain('../diagrams/journey.svg');
    expect(guide).not.toContain('](../packages/');
  });

  it('during the beta, offers to ask for access and links no download (T2.6)', async () => {
    const quiet = await collectSite({ installs: 'beta', contact: '' });
    const home = text(quiet, '/index.html');
    expect(home).toContain('id="installer"');
    expect(home).toContain('Accès sur invitation');
    expect(home).not.toContain('mailto:');
    for (const page of PAGES) {
      const html = text(quiet, `/${page}`);
      expect(html, page).not.toMatch(/href="[^"]*(?:\.dmg|\.mcpb|cursor:\/\/)/);
      expect(html, page).not.toMatch(/<!-- \/?if:|\{\{/);
    }
    const withContact = text(await collectSite({ installs: 'beta', contact: 'beta@example.com' }), '/index.html');
    expect(withContact).toContain('href="mailto:beta@example.com?subject=');
    await expect(collectSite({ installs: 'beta', contact: 'not an address' })).rejects.toThrow(/E_SITE_CONTACT/);
  });

  it('once open, links the Mac app, the Claude Desktop bundle and the connector address (T2.6)', async () => {
    const open = await collectSite({ installs: 'open', contact: '' });
    const home = text(open, '/index.html');
    expect(home).toContain('href="downloads/drop.dmg"');
    expect(home).toContain('href="downloads/drop.mcpb"');
    expect(home).not.toContain('Accès sur invitation');
    expect(text(open, '/demarrer.html')).toContain('https://drop.memolabs.dev/mcp');
  });

  it('serves the public site on its own host with release files by exact name only (T2.6)', async () => {
    const releases = await mkdtemp(join(tmpdir(), 'drop-releases-'));
    await writeFile(join(releases, 'latest.json'), '{"version":"0.2.0"}');
    await writeFile(join(releases, 'drop-0.2.0-darwin-aarch64.app.tar.gz'), 'archive');
    await writeFile(join(releases, 'drop.dmg'), 'disk image');
    await writeFile(join(releases, 'secret.txt'), 'never served');
    await mkdir(join(releases, 'nested'));
    const site = await startPublicSite(await collectSite({ installs: 'beta', contact: '' }), {
      port: 0,
      host: '127.0.0.1',
      publicHost: 'drop.example',
      releasesDir: releases,
    });
    const get = (path: string, host = 'drop.example') =>
      new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
        const req = request(`${site.url}${path}`, { headers: { Host: host } }, (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
          });
        });
        req.on('error', reject);
        req.end();
      });
    try {
      const home = await get('/');
      expect(home.status).toBe(200);
      expect(home.headers['strict-transport-security']).toContain('max-age=');
      expect(home.headers['content-security-policy']).toContain("script-src 'none'");
      expect((await get('/', 'evil.example')).status).toBe(403);
      const latest = await get('/updates/latest.json');
      expect(latest.status).toBe(200);
      expect(latest.headers['content-type']).toBe('application/json');
      expect(latest.headers['cache-control']).toBe('no-cache');
      expect((await get('/updates/drop-0.2.0-darwin-aarch64.app.tar.gz')).body).toBe('archive');
      expect((await get('/downloads/drop.dmg')).body).toBe('disk image');
      expect((await get('/downloads/drop.mcpb')).status).toBe(404);
      for (const path of [
        '/updates/secret.txt',
        '/updates/../secret.txt',
        '/updates/%2e%2e%2fsecret.txt',
        '/downloads/latest.json',
        '/updates/nested',
        '/secret.txt',
      ])
        expect((await get(path)).status, path).toBe(404);
    } finally {
      await site.stop();
      await rm(releases, { recursive: true, force: true });
    }
  });
});
