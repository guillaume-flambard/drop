import { describe, expect, it, vi } from 'vitest';
import { verifyBetaPortal } from '../scripts/beta-acceptance.ts';

const valid = 'https://drop.memolabs.dev/beta/1790000000/abcdefghijklmnopqrstuv';
describe('public beta acceptance monitor', () => {
  it('rejects malformed or fragment-bearing links before networking', async () => {
    const fetcher = vi.fn();
    for (const url of [
      valid + '#invite',
      valid + '?secret=abc',
      valid + '/path',
      valid.replace('https:', 'http:'),
      valid.replace('drop.memolabs.dev', 'example.org'),
    ]) {
      await expect(verifyBetaPortal(url, fetcher)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('checks five range responses and independent access failures', async () => {
    const mock = vi.fn((url: string) => {
      const status = url.includes('/_beta/')
        ? 404
        : url.endsWith('x')
          ? 403
          : /\.(dmg|AppImage|exe)$/.test(url)
            ? 206
            : 200;
      return Promise.resolve(
        new Response(null, {
          status,
          headers: {
            'content-security-policy': "script-src 'sha256-abc'; connect-src 'none'",
            'referrer-policy': 'no-referrer',
          },
        }),
      );
    });
    const checks = await verifyBetaPortal(valid, mock as typeof fetch);
    expect(checks).toHaveLength(9);
    expect(checks.filter((check) => check.includes('206'))).toHaveLength(5);
  });
  it('fails closed on a missing CSP', async () => {
    await expect(verifyBetaPortal(valid, () => Promise.resolve(new Response(null, { status: 200 })))).rejects.toThrow(
      'CSP',
    );
  });
});
