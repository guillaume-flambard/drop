import { describe, expect, it } from 'vitest';
import { detectFormatting, editJson, editYaml, readJsonEntry, readYamlEntry } from '../src/config-edit.ts';

const ENTRY = {
  command: '/usr/local/bin/node',
  args: ['/Users/julie/.drop/bin/drop-mcp.mjs'],
  env: { DROP_AGENT: 'zed' },
};

describe('format-preserving configuration edits (T4.22)', () => {
  it('adds then removes one JSONC entry, keeping comments, trailing commas, order and indentation', () => {
    const original = [
      '// Zed settings',
      '{',
      '    /* theme first */',
      '    "theme": "One Dark", // keep me',
      '    "context_servers": {',
      '        "datadog": { "command": "npx", "args": ["datadog-mcp"] }, // a neighbour',
      '    },',
      '}',
      '',
    ].join('\n');
    const added = editJson(original, ['context_servers', 'drop'], ENTRY, 'jsonc');
    for (const line of [
      '// Zed settings',
      '    /* theme first */',
      '    "theme": "One Dark", // keep me',
      '        "datadog": { "command": "npx", "args": ["datadog-mcp"] }, // a neighbour',
    ])
      expect(added).toContain(line);
    expect(added).toContain('        "drop": {\n            "command": "/usr/local/bin/node"');
    expect(readJsonEntry(added, ['context_servers', 'drop'], 'jsonc')).toEqual(ENTRY);
    expect(readJsonEntry(added, ['context_servers', 'datadog'], 'jsonc')).toEqual({
      command: 'npx',
      args: ['datadog-mcp'],
    });
    const removed = editJson(added, ['context_servers', 'drop'], undefined, 'jsonc');
    expect(readJsonEntry(removed, ['context_servers', 'drop'], 'jsonc')).toBeUndefined();
    expect(removed).toBe(original);
  });

  it('keeps a BOM, CRLF line endings and tab indentation, and creates a missing file', () => {
    const original = '\uFEFF{\r\n\t"mcpServers": {\r\n\t\t"notion": { "command": "npx" }\r\n\t}\r\n}\r\n';
    expect(detectFormatting(original.slice(1))).toEqual({ insertSpaces: false, tabSize: 1, eol: '\r\n' });
    const added = editJson(original, ['mcpServers', 'drop'], ENTRY, 'json');
    expect(
      added.startsWith('\uFEFF{\r\n\t"mcpServers": {\r\n\t\t"notion": { "command": "npx" },\r\n\t\t"drop": {'),
    ).toBe(true);
    expect(added).not.toMatch(/[^\r]\n/);
    expect(JSON.parse(added.slice(1))).toEqual({ mcpServers: { notion: { command: 'npx' }, drop: ENTRY } });
    expect(editJson(added, ['mcpServers', 'drop'], undefined, 'json')).toBe(original);
    // A container that does not exist yet is created, on its own lines.
    const bare = '{\n  "theme": "dark"\n}\n';
    const withServers = editJson(bare, ['mcpServers', 'drop'], ENTRY, 'json');
    expect(withServers.startsWith('{\n  "theme": "dark",\n  "mcpServers": {\n    "drop": {\n      "command"')).toBe(
      true,
    );
    expect(JSON.parse(withServers)).toEqual({ theme: 'dark', mcpServers: { drop: ENTRY } });
    const created = editJson(undefined, ['mcpServers', 'drop'], ENTRY, 'json');
    expect(JSON.parse(created)).toEqual({ mcpServers: { drop: ENTRY } });
    expect(created.endsWith('}\n')).toBe(true);
  });

  it('refuses a broken file, comments in strict JSON, or a container that is not an object', () => {
    expect(() => editJson('{ "mcpServers": ', ['mcpServers', 'drop'], ENTRY, 'jsonc')).toThrow('E_CONFIG_INVALID');
    expect(() => editJson('{ // no\n}', ['mcpServers', 'drop'], ENTRY, 'json')).toThrow('E_CONFIG_INVALID');
    expect(() => editJson('{ "mcpServers": [] }', ['mcpServers', 'drop'], ENTRY, 'json')).toThrow('E_CONFIG_INVALID');
    expect(() => editJson('[]', ['mcpServers', 'drop'], ENTRY, 'json')).toThrow('E_CONFIG_INVALID');
    expect(() => readYamlEntry('extensions: [a, b]\n', ['extensions', 'drop'])).toThrow('E_CONFIG_INVALID');
    expect(() => editYaml('extensions:\n  a: [\n', ['extensions', 'drop'], {})).toThrow('E_CONFIG_INVALID');
  });

  it('adds then removes one goose extension, keeping comments and the flush list style goose writes', () => {
    const original = [
      '# goose configuration',
      'GOOSE_PROVIDER: openai # provider',
      'extensions:',
      '  developer:',
      '    bundled: true',
      '    enabled: true',
      '    name: developer',
      '    timeout: 300',
      '    type: builtin',
      '  github:',
      '    args:',
      '    - -y',
      '    - "@modelcontextprotocol/server-github"',
      '    cmd: npx',
      '    enabled: true # on',
      '    envs: {}',
      '    name: github',
      '    type: stdio',
      'GOOSE_MODEL: gpt-4o',
      '',
    ].join('\n');
    const entry = {
      name: 'drop',
      type: 'stdio',
      cmd: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Users\\Jean Dupont\\.drop\\bin\\drop-mcp.mjs'],
      envs: { DROP_AGENT: 'goose' },
      enabled: true,
      timeout: 300,
    };
    const added = editYaml(original, ['extensions', 'drop'], entry);
    for (const line of original.split('\n')) expect(added.split('\n')).toContain(line);
    expect(readYamlEntry(added, ['extensions', 'drop'])).toEqual(entry);
    expect(readYamlEntry(added, ['extensions', 'github'])).toMatchObject({
      cmd: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    });
    const removed = editYaml(added, ['extensions', 'drop'], undefined);
    expect(removed).toBe(original);
    // A file without extensions, or with an empty one, gets the key.
    expect(
      readYamlEntry(editYaml('GOOSE_PROVIDER: openai\n', ['extensions', 'drop'], entry), ['extensions', 'drop']),
    ).toEqual(entry);
    expect(readYamlEntry(editYaml('extensions:\n', ['extensions', 'drop'], entry), ['extensions', 'drop'])).toEqual(
      entry,
    );
    expect(readYamlEntry(editYaml(undefined, ['extensions', 'drop'], entry), ['extensions', 'drop'])).toEqual(entry);
  });
});
