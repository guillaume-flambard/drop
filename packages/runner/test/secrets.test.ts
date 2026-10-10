import { describe, expect, it } from 'vitest';
import { applyRedactions, scanSecrets } from '../src/index.ts';
import { ENTROPY_THRESHOLD, looksLikeJwt, SECRET_PATTERNS, shannonEntropy } from '../src/secrets.ts';

// Built at runtime so this file itself never contains a literal that looks like a live credential.
const fake = {
  pem: ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
  pemPkcs8: ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
  pemOpenssh: ['-----BEGIN', 'OPENSSH PRIVATE KEY-----'].join(' '),
  aws: 'AKIA' + 'ABCDEFGHIJ234567',
  anthropic: 'sk-ant-' + 'api03-' + 'x'.repeat(24),
  openai: 'sk-' + 'proj_' + 'Z'.repeat(24),
  github: 'ghp_' + 'a1B2'.repeat(9),
  githubServer: 'ghs_' + 'Q9w8'.repeat(9),
  slack: 'xox' + 'b-1234-5678',
  jwt: 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxIn0' + '.c2ln',
  highEntropy: 'q7Zp2Lx9Vb4Nc8Md1Kf6Gh3Js0Tw5Ry_EuAoIi',
};

describe('scanSecrets: each pattern detects', () => {
  const cases: [string, string, string][] = [
    ['RSA PEM private key header', `key:\n${fake.pem}\nMIIE`, 'pem_private_key'],
    ['PKCS#8 PEM private key header', fake.pemPkcs8, 'pem_private_key'],
    ['OpenSSH private key header', fake.pemOpenssh, 'pem_private_key'],
    ['AWS access key id', `id ${fake.aws} used`, 'aws_access_key'],
    ['Anthropic key', `token ${fake.anthropic}`, 'anthropic_key'],
    ['generic sk- key', `"${fake.openai}"`, 'sk_key'],
    ['GitHub personal token', fake.github, 'github_token'],
    ['GitHub server token', `x ${fake.githubServer} y`, 'github_token'],
    ['Slack token prefix', fake.slack, 'slack_token'],
    ['JWT', `Bearer ${fake.jwt}`, 'jwt'],
    ['KEY= assignment', 'API_KEY=abc', 'credential_assignment'],
    ['SECRET= assignment', 'CLIENT_SECRET = x', 'credential_assignment'],
    ['TOKEN= assignment', 'token=1', 'credential_assignment'],
    ['PASSWORD= assignment', 'PASSWORD=hunter2', 'credential_assignment'],
    ['long high-entropy token', `blob ${fake.highEntropy} end`, 'high_entropy'],
  ];

  it.each(cases)('%s', (_label, text, kind) => {
    expect(scanSecrets(text)).toContain(kind);
  });

  it('covers every pattern of secrets.ts with at least one case', () => {
    const covered = new Set(cases.map(([, , kind]) => kind));
    for (const pattern of SECRET_PATTERNS) expect(covered).toContain(pattern.kind);
    expect(covered).toContain('high_entropy');
  });

  it('reports an Anthropic key under both sk kinds', () => {
    expect(scanSecrets(fake.anthropic)).toEqual(['anthropic_key', 'sk_key']);
  });
});

describe('scanSecrets: the patterns named in the spec', () => {
  it('flags a PEM private key header', () => {
    expect(scanSecrets(`x\n${fake.pemPkcs8}\n`)).toContain('pem_private_key');
  });

  it('flags an Anthropic key', () => {
    expect(scanSecrets(`token ${fake.anthropic}`)).toContain('anthropic_key');
  });

  it('flags GitHub, Slack and AWS tokens', () => {
    expect(scanSecrets([fake.github, fake.slack, fake.aws])).toEqual(
      expect.arrayContaining(['github_token', 'slack_token', 'aws_access_key']),
    );
  });

  it('flags a JWT', () => {
    expect(scanSecrets(`Bearer ${fake.jwt}`)).toContain('jwt');
  });

  it('flags a PASSWORD= assignment', () => {
    expect(scanSecrets('PASSWORD=hunter2')).toContain('credential_assignment');
  });

  it('flags a string of more than 32 characters with an entropy above 4.5', () => {
    expect(fake.highEntropy.length).toBeGreaterThan(32);
    expect(shannonEntropy(fake.highEntropy)).toBeGreaterThan(ENTROPY_THRESHOLD);
    expect(scanSecrets(`blob ${fake.highEntropy} end`)).toContain('high_entropy');
  });
});

describe('scanSecrets: ordinary values stay clean', () => {
  const clean = [
    '2026-10-08T12:34:56.789Z',
    '2026-10-08T12:34:56+02:00',
    '0190f3a2-7b1c-7d4e-9f00-123456789abc',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'PAYMENT_TIMEOUT',
    'OTHER',
    'degraded',
    'disk-cleanup-worker-production-eu-west',
    'the task-runner-service-instance restarted twice',
    'A sentence with several ordinary words, punctuation and numbers like 42 or 3.14.',
    'PASSWORD=',
    'no key here',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'https://example.com/docs/getting-started/install',
    '',
  ];

  it.each(clean)('%j', (text) => {
    expect(scanSecrets(text)).toEqual([]);
  });

  it('ignores numbers, booleans and null', () => {
    expect(scanSecrets({ a: 1, b: true, c: null, d: [2, false] })).toEqual([]);
  });
});

describe('scanSecrets: deep traversal', () => {
  it('finds secrets in nested arrays and objects', () => {
    expect(scanSecrets({ a: { b: [{ c: 'fine' }, { d: ['x', fake.aws] }] } })).toEqual(['aws_access_key']);
  });

  it('scans object keys too', () => {
    expect(scanSecrets({ [fake.github]: 1 })).toEqual(['github_token']);
  });

  it('returns each kind once, in pattern order', () => {
    expect(scanSecrets([fake.jwt, fake.aws, fake.jwt])).toEqual(['aws_access_key', 'jwt']);
  });

  it('survives cyclic structures', () => {
    const cyclic: Record<string, unknown> = { name: fake.slack };
    cyclic.self = cyclic;
    expect(scanSecrets(cyclic)).toEqual(['slack_token']);
  });
});

describe('shannonEntropy', () => {
  it('is 0 for an empty or uniform string', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy('aaaa')).toBe(0);
  });

  it('is log2(n) for n distinct characters', () => {
    expect(shannonEntropy('abcd')).toBeCloseTo(2);
  });

  it('puts the fixture token above the threshold and a UUID below it', () => {
    expect(shannonEntropy(fake.highEntropy)).toBeGreaterThan(ENTROPY_THRESHOLD);
    expect(shannonEntropy('0190f3a2-7b1c-7d4e-9f00-123456789abc')).toBeLessThan(ENTROPY_THRESHOLD);
  });

  it('only flags tokens strictly longer than 32 characters', () => {
    const token32 = fake.highEntropy.slice(0, 32);
    expect(shannonEntropy(token32)).toBeGreaterThan(ENTROPY_THRESHOLD);
    expect(scanSecrets(token32)).toEqual([]);
    expect(scanSecrets(fake.highEntropy.slice(0, 33))).toEqual(['high_entropy']);
  });
});

describe('applyRedactions', () => {
  const output = { answer: 'ok', stack: 'trace', nested: { a: 1, b: { c: 'x', d: 'y' } }, list: ['a', 'b', 'c'] };

  it('removes a top-level field given as a JSON pointer', () => {
    expect(applyRedactions(output, ['/stack'])).toEqual({
      answer: 'ok',
      nested: output.nested,
      list: output.list,
    });
  });

  it('removes a nested field given as a dotted path', () => {
    expect(applyRedactions(output, ['nested.b.c']).nested).toEqual({ a: 1, b: { d: 'y' } });
  });

  it('removes array elements without shifting the other paths', () => {
    expect(applyRedactions(output, ['list.0', '/list/2']).list).toEqual(['b']);
  });

  it('ignores unknown paths and out-of-range indices', () => {
    expect(applyRedactions(output, ['missing', 'nested.z.q', 'list.9', 'list.x'])).toEqual(output);
  });

  it('does not mutate the original output', () => {
    const before = structuredClone(output);
    applyRedactions(output, ['stack', 'nested.a', 'list.1']);
    expect(output).toEqual(before);
  });

  it('decodes JSON pointer escapes', () => {
    expect(applyRedactions({ 'a/b': 1, 'c~d': 2, e: 3 }, ['/a~1b', '/c~0d'])).toEqual({ e: 3 });
  });

  it('does not walk into inherited properties', () => {
    const result = applyRedactions({ a: 1 }, ['__proto__', 'constructor.name', 'toString']);
    expect(result).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it('removes everything for an empty path', () => {
    expect(applyRedactions(output, [''])).toEqual({});
  });
});

describe('secret scanner bounds (T4.3 review)', () => {
  it('finds a JWT in linear time, even in a long run of JWT-like prefixes', () => {
    // Same verdicts as the former regex, which backtracked quadratically.
    const former = /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\./;
    const cases = [
      'Bearer ' + fake.jwt,
      'eyJ.eyJ.',
      'eyJ.eyJ',
      'x eyJ!a.eyJb.',
      'eyJa.b eyJ.',
      'aeyJb.eyJc.d',
      'eyJa.eyJ!.',
      'eyJ..eyJ.',
    ];
    for (const text of cases) expect(looksLikeJwt(text)).toBe(former.test(text));
    expect(scanSecrets(['Bearer ' + fake.jwt])).toContain('jwt');
    const started = performance.now();
    scanSecrets(['eyJ'.repeat(45_000)]);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
