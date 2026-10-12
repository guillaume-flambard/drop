import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { DropHome } from '../src/home.ts';
import { windowsShimCommand } from '../src/official-command.ts';
import { privateConfig } from '../src/private-config.ts';

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('security alerts triage (T4.26)', () => {
  it('publishes under a capability id only, never under a path that leaves DROP_HOME', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'drop-publish-'));
    roots.push(parent);
    const root = join(parent, 'home');
    const home = new DropHome(root);
    const identity = await generateIdentity('Owner');
    home.init(identity, privateConfig('ws://127.0.0.1:7780/v1', 'human', 0));
    const entry = { approverNodeIds: [identity.nodeId], config: {}, publishedAt: new Date().toISOString() };
    for (const capabilityId of [
      '../../escaped',
      'mcp.answer.../../../escaped',
      'mcp.answer.x/../../y',
      'Upper.case',
      '',
    ])
      expect(() => {
        home.publish({ ...entry, capabilityId });
      }, capabilityId).toThrow('E_CAPABILITY_ID');
    expect(existsSync(join(parent, 'escaped.json'))).toBe(false);
    expect(readdirSync(parent)).toEqual(['home']);
    home.publish({ ...entry, capabilityId: 'mcp.answer.figma' });
    expect(home.published().map((published) => published.capabilityId)).toEqual(['mcp.answer.figma']);
  });

  it('keeps cmd.exe metacharacters of a Windows shim path inside quotes, and never runs ComSpec', () => {
    vi.stubEnv('ComSpec', 'C:\\evil\\shell.exe');
    // `&`, `|`, `<`, `>`, parentheses and spaces are literal between double quotes, for cmd.exe and for the shim's %*.
    const argv = [
      'C:\\Users\\a&b|c\\npm (x86)\\codex.cmd',
      'mcp',
      'add',
      '<drop>',
      '--',
      'C:\\Program Files\\node.exe',
    ];
    const command = windowsShimCommand(argv);
    expect(command.file).toBe('cmd.exe');
    const line = command.args[3] ?? '';
    expect(line).toBe(
      `""C:\\Users\\a&b|c\\npm (x86)\\codex.cmd" "mcp" "add" "<drop>" "--" "C:\\Program Files\\node.exe""`,
    );
    // Each argument is opened and closed by exactly one pair of quotes: none can end the quoting early.
    expect(line.slice(1, -1).split('" "')).toHaveLength(argv.length);
    for (const injected of ['C:\\a"&calc&"\\codex.cmd', 'C:\\%ComSpec%\\codex.cmd', 'C:\\x\r\ncalc\\codex.cmd'])
      expect(() => windowsShimCommand([injected, 'mcp']), injected).toThrow('E_CLI_SHIM_UNSAFE');
  });
});
