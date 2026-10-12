/** Public private-beta smoke: never log the bearer URL or invitation fragment. */
const ORIGIN = 'https://drop.memolabs.dev';
const FILES = [
  'drop_0.1.0_aarch64.dmg',
  'drop_0.1.0_x64.dmg',
  'drop_0.1.0_x64-setup.exe',
  'drop_0.1.0_amd64.AppImage',
  'drop_0.1.0_aarch64.AppImage',
] as const;

export async function verifyBetaPortal(base: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const u = new URL(base);
  if (
    u.origin !== ORIGIN ||
    !/^\/beta\/[0-9]{10}\/[A-Za-z0-9_-]{22}$/.test(u.pathname) ||
    u.search !== '' ||
    u.hash !== ''
  )
    throw new Error('Invalid private beta capability URL');

  const checks: { name: string; url: string; expected: number; method: 'HEAD' | 'GET'; range?: boolean }[] = [
    { name: 'public join', url: ORIGIN + '/join', expected: 200, method: 'GET' },
    { name: 'private landing', url: base, expected: 200, method: 'GET' },
    ...FILES.map((name) => ({ name, url: base + '/' + name, expected: 206, method: 'GET' as const, range: true })),
    {
      name: 'tampered capability',
      url: base.slice(0, -1) + (base.endsWith('x') ? 'y' : 'x'),
      expected: 403,
      method: 'HEAD',
    },
    { name: 'direct file bypass', url: ORIGIN + '/_beta/' + FILES[0], expected: 404, method: 'HEAD' },
  ];
  const results: string[] = [];
  for (const check of checks) {
    const result = await fetcher(check.url, {
      method: check.method,
      ...(check.range ? { headers: { Range: 'bytes=0-15' } } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    });
    if (check.expected === 200) {
      const csp = result.headers.get('content-security-policy') ?? '';
      if (!csp.includes("connect-src 'none'") || !csp.includes("script-src 'sha256-"))
        throw new Error(check.name + ': missing script CSP pin or connect restriction');
      if (result.headers.get('referrer-policy') !== 'no-referrer')
        throw new Error(check.name + ': missing referrer protection');
    }
    await result.body?.cancel();
    if (result.status !== check.expected)
      throw new Error(
        check.name + ': unexpected HTTP ' + String(result.status) + ' instead of ' + String(check.expected),
      );
    results.push(check.name + ': HTTP ' + String(result.status));
  }
  return results;
}

if (process.argv[1]?.endsWith('/beta-acceptance.ts')) {
  const capability = process.env.DROP_BETA_JOIN_PAGE;
  if (!capability) throw new Error('Missing DROP_BETA_JOIN_PAGE environment variable');
  for (const result of await verifyBetaPortal(capability)) console.log(result);
}
