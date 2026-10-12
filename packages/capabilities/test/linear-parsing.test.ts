import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codexServers, gooseExtensions, parseFinalJson, readConfigText } from '../src/index.ts';

/**
 * T4.26: CodeQL `js/polynomial-redos` alerts 4 to 10. Each input below is the shape CodeQL named; with the former
 * regular expressions it took seconds at this length (measured 0.3 to 2 s at a fifth of it). Linear parsing answers in
 * milliseconds; the bound is loose so a slow CI machine never fails it, and a quadratic parser always does.
 */
const LONG = 100_000;
const BOUND_MS = 1_500;

function fast<T>(work: () => T): T {
  const started = performance.now();
  const result = work();
  expect(performance.now() - started).toBeLessThan(BOUND_MS);
  return result;
}

describe('configuration and reply parsing in linear time (T4.26)', () => {
  it('drops closed reasoning blocks and stays linear on a reply full of unclosed <think>', () => {
    const answer = z.object({ ok: z.boolean() });
    expect(parseFinalJson(answer, '<think>{"ok": false}</think>{"ok": true}')).toEqual({ ok: true });
    expect(parseFinalJson(answer, '<think>a</think><think>b</think> {"ok": true} <think>c</think>')).toEqual({
      ok: true,
    });
    // An unclosed block is kept, as before: the object inside it is still read.
    expect(parseFinalJson(answer, '<think>{"ok": true}')).toEqual({ ok: true });
    expect(fast(() => parseFinalJson(answer, '<think>'.repeat(LONG)))).toBeUndefined();
  });

  it('reads Codex TOML arrays, inline tables and pairs as before, in linear time on hostile lines', () => {
    const toml = [
      '[mcp_servers.a]',
      'command = "npx"',
      `args = ["-y", 'pkg', "say \\"hi\\"", "unterminated]`,
      'env = { TOKEN = "t", "QUOTED-KEY" = \'q\', bad, OTHER="o\\"x" }',
      'enabled   =   true',
    ].join('\n');
    expect(codexServers(toml)).toMatchObject([
      {
        name: 'a',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'pkg', 'say "hi"'],
        env: { TOKEN: 't', 'QUOTED-KEY': 'q', OTHER: 'o"x' },
      },
    ]);
    // A single-quoted string after an unterminated double-quoted one is still read, as the expression read it.
    expect(codexServers(`[mcp_servers.b]\ncommand = "x"\nargs = ["open, 'kept']`)).toMatchObject([
      { name: 'b', args: ['kept'] },
    ]);
    fast(() => codexServers(`[mcp_servers.a]\nargs = ["${'\\"!'.repeat(LONG)}\n`));
    fast(() => codexServers(`[mcp_servers.a]\nenv = {${'-'.repeat(LONG)}\n`));
    fast(() => codexServers(`[mcp_servers.a]\nenv = {${'a "'.repeat(LONG)}\n`));
    fast(() => codexServers(`[mcp_servers.a]\n-=${' '.repeat(LONG)}\u2028x\u2028x\n`));
  });

  it('reads goose extensions as before, in linear time on hostile lines', () => {
    const yaml = [
      'extensions:',
      '  github:',
      '    type: stdio',
      '    cmd: npx   # the launcher',
      '    args:',
      '    - -y',
      '    - "@modelcontextprotocol/server-github"',
      '    envs:',
      '      GITHUB_TOKEN: ghp_x  # set by hand',
      '    enabled: true',
    ].join('\n');
    expect(gooseExtensions(yaml)).toEqual({
      github: {
        type: 'stdio',
        cmd: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        envs: { GITHUB_TOKEN: 'ghp_x' },
        enabled: true,
      },
    });
    fast(() => gooseExtensions(`extensions:\n  a:\n    cmd: x${' '.repeat(LONG)}y\n`));
    fast(() => gooseExtensions(`extensions:\n  a:\n    cmd: x${' #'.repeat(LONG)}\n`));
    fast(() => gooseExtensions(`extensions:\n  a:\n    cmd:${' '.repeat(LONG)}\u2028x\u2028x\n`));
    fast(() => gooseExtensions(`extensions:\n  a:\n    envs:\n      A:${' '.repeat(LONG)}\u2028x\u2028x\n`));
  });
});

/** The expressions the TOML readers replaced (T4.26), kept here as the reference their results must match. */
function formerArray(value: string): string[] {
  return [...value.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((match) =>
    match[1] !== undefined ? (JSON.parse(`"${match[1]}"`) as string) : (match[2] ?? ''),
  );
}

function formerTable(value: string): Record<string, string> {
  return Object.fromEntries(
    [...value.matchAll(/([A-Za-z0-9_-]+|"[^"]+")\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')/g)].map((match) => {
      const raw = match[2] ?? '""';
      const text = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw.slice(1, -1);
      return [(match[1] ?? '').replaceAll('"', ''), text];
    }),
  );
}

/** What codexServers reads from one `args` or `env` value, or the error it throws. */
function readArgs(value: string): unknown {
  try {
    return codexServers(`[mcp_servers.a]\ncommand = "x"\nargs = ${value}\n`)[0]?.args;
  } catch (error) {
    return error instanceof Error ? error.name : 'error';
  }
}

function readEnv(value: string): unknown {
  try {
    return codexServers(`[mcp_servers.a]\ncommand = "x"\nenv = ${value}\n`)[0]?.env;
  } catch (error) {
    return error instanceof Error ? error.name : 'error';
  }
}

function expected(former: () => unknown): unknown {
  try {
    return former();
  } catch (error) {
    return error instanceof Error ? error.name : 'error';
  }
}

describe('TOML readers equal to the former expressions (T4.26 review)', () => {
  it('reads a later string after a lookahead failed further on, as the expressions did', () => {
    expect(readEnv(`{ "k" = true, A = '" = ' }`)).toEqual({ A: '" = ' });
    expect(readEnv(`{a}"\t\\"b="="`)).toEqual({ b: '=' });
  });

  it('reads no value, and never throws, from a line that holds a line separator, as before', () => {
    // The pair expression never matched such a line, before T4.26 and after: no string reader is reached.
    for (const separator of ['\r', '\u2028', '\u2029']) {
      expect(readArgs(`["a\\${separator}b", "kept"]`), JSON.stringify(separator)).toEqual([]);
      expect(readEnv(`{ A = "a\\${separator}b", B = "kept" }`), JSON.stringify(separator)).toEqual({});
    }
  });

  it('matches the former expressions on a generated corpus of inline arrays and tables', () => {
    const alphabet = ['"', "'", '\\', '=', ' ', 'a', 'b', '-', ',', '{', '}', '[', ']', '\t'];
    let seed = 26;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      // The high bits: the low bits of this generator repeat with a short period.
      return Math.floor(seed / 65_536);
    };
    for (let round = 0; round < 20_000; round += 1) {
      const length = 1 + (next() % 20);
      let body = '';
      for (let index = 0; index < length; index += 1) body += alphabet[next() % alphabet.length] ?? '';
      const array = `[${body}]`;
      const table = `{${body}}`;
      expect(readArgs(array), array).toEqual(expected(() => formerArray(array)));
      expect(readEnv(table), table).toEqual(expected(() => formerTable(table)));
    }
  });
});

describe('configuration files read through one descriptor (T4.26)', () => {
  it('reads a regular file, refuses a directory or an oversized file, and never waits on a named pipe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'config-read-'));
    const file = join(dir, 'config.json');
    writeFileSync(file, '{"a": 1}');
    expect(readConfigText(file)).toBe('{"a": 1}');
    expect(readConfigText(join(dir, 'absent.json'))).toBeUndefined();
    expect(() => readConfigText(dir)).toThrow('E_CONFIG_TYPE');
    expect(() => readConfigText(file, 4)).toThrow('E_CONFIG_TOO_LARGE');
    if (process.platform !== 'win32') {
      // Opening a FIFO without O_NONBLOCK would wait for a writer forever: it is refused at once instead.
      const fifo = join(dir, 'pipe.json');
      execFileSync('mkfifo', [fifo]);
      expect(() => readConfigText(fifo)).toThrow('E_CONFIG_TYPE');
    }
  });
});

describe('configuration files read without following a link (T4.42)', () => {
  it('refuses a linked file with E_CONFIG_SYMLINK when links are not followed, and still follows one by default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'config-link-'));
    const target = join(dir, 'dotfiles.json');
    const link = join(dir, 'config.json');
    writeFileSync(target, '{"b": 2}');
    try {
      symlinkSync(target, link);
    } catch (error) {
      // Windows without Developer Mode may not create links: nothing to refuse then.
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    expect(readConfigText(link)).toBe('{"b": 2}');
    expect(() => readConfigText(link, undefined, { followLinks: false })).toThrow('E_CONFIG_SYMLINK');
    expect(readConfigText(target, undefined, { followLinks: false })).toBe('{"b": 2}');
    expect(readConfigText(join(dir, 'absent.json'), undefined, { followLinks: false })).toBeUndefined();
  });
});
