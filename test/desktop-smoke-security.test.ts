import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/desktop-smoke.ts', 'utf8');

describe('packaged daemon restart smoke security', () => {
  it('uses the test-selected loopback port, not a destination read from disk', () => {
    expect(source).toContain('const smokePort = await freePort();');
    expect(source).toContain('String(smokePort)');
    expect(source).toContain('check(config.apiPort === smokePort');
    expect(source).toContain('const originalPort = smokePort;');
    expect(source).not.toContain('String(config.apiPort)');
    expect(source.match(/fetch\('http:\/\/127\.0\.0\.1:' \+ String\(originalPort\)/g)).toHaveLength(4);
  });

  it('proves the response belongs to our daemon before reading and sending its token', () => {
    expect(source).toContain("const marker = 'smoke-' + randomUUID();");
    const verified = source.indexOf("check(healthy, 'launch '");
    const tokenRead = source.indexOf("readFileSync(join(temp, 'drop', 'local-token')");
    const authorizedFetch = source.indexOf("headers: { Authorization: 'Bearer ' + token }");
    expect(verified).toBeGreaterThan(0);
    expect(tokenRead).toBeGreaterThan(verified);
    expect(authorizedFetch).toBeGreaterThan(tokenRead);
  });
});
