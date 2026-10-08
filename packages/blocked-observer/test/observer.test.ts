import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import {
  applyReview,
  buildReport,
  classificationFrom,
  claudeNoise,
  codexNoise,
  createObserverServer,
  detectPattern,
  handleHookInput,
  isReadOnlyCommand,
  linkEvents,
  ObserverStore,
  parseCodexSessions,
  PATTERNS,
  REASONS,
  REPORT_BLOCKED_DESCRIPTION,
  shortHash,
  type ObservedEvent,
} from '../src/index.ts';

const CLI = resolve(import.meta.dirname, '..', 'src', 'cli.ts');

function freshStore(): ObserverStore {
  return new ObserverStore(mkdtempSync(join(tmpdir(), 'blocked-observer-')));
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setTimeout(r, 5));
}

describe('report_blocked (source A)', () => {
  it('an agent can call report_blocked and the event appears in list', async () => {
    const store = freshStore();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createObserverServer(store, 'claude_code').connect(serverTransport);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['report_blocked']);
    expect(tools[0]?.description).toBe(REPORT_BLOCKED_DESCRIPTION);
    const result = await client.callTool({
      name: 'report_blocked',
      arguments: {
        missing: 'access',
        resource: 'Datadog checkout service logs',
        owner_hint: 'équipe infra',
        attempted_action: 'lire les erreurs du checkout',
        workaround: 'asked_human',
      },
    });
    const reply = JSON.parse((result.content as { text: string }[])[0]?.text ?? '{}') as {
      recorded: boolean;
      id: string;
    };
    expect(reply.recorded).toBe(true);
    await until(() => store.events().length === 1);
    expect(store.events()[0]).toMatchObject({
      id: reply.id,
      source: 'report',
      missing: 'access',
      resource: 'Datadog checkout service logs',
    });
    const listed = spawnSync(process.execPath, [CLI, 'list'], {
      env: { ...process.env, BLOCKED_OBSERVER_HOME: store.root, BLOCKED_OBSERVER_NO_CODEX: '1' },
      encoding: 'utf8',
    });
    expect(listed.stdout).toContain(reply.id.slice(0, 8));
    expect(listed.stdout).toContain('access: Datadog checkout service logs');
    await client.close();
  });

  it('refuses a resource longer than 120 characters', async () => {
    const store = freshStore();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createObserverServer(store, 'codex').connect(serverTransport);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: 'report_blocked',
      arguments: { missing: 'data', resource: 'x'.repeat(121), attempted_action: 'a' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('Claude Code hook (source B)', () => {
  const base = { session_id: 's1', transcript_path: '/t', cwd: '/c', tool_use_id: 'toolu_1' };

  it('a fake tool result containing 403 Forbidden creates an event without any excerpt of the output', () => {
    const store = freshStore();
    const secretish = 'Datadog API said 403 Forbidden for org acme-prod-7781 token=abc123';
    const outcome = handleHookInput(
      JSON.stringify({
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'curl https://api.datadoghq.com/x' },
        tool_response: { stdout: secretish, stderr: '', interrupted: false, isImage: false },
      }),
      store,
    );
    expect(outcome).toEqual({ recorded: true, pattern: 'http_403' });
    const [event] = store.events();
    expect(event).toMatchObject({
      source: 'hook_claude',
      agent: 'claude_code',
      session: 's1',
      tool: 'Bash',
      pattern: 'http_403',
    });
    expect(event?.resource_hash).toBe(shortHash('command:curl https://api.datadoghq.com/x'));
    const raw = readFileSync(store.eventsPath, 'utf8');
    for (const fragment of ['Datadog API', 'acme-prod', 'abc123', 'Forbidden', 'datadoghq'])
      expect(raw).not.toContain(fragment);
  });

  it('also catches failed tools (PostToolUseFailure error)', () => {
    const store = freshStore();
    handleHookInput(
      JSON.stringify({
        ...base,
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'mcp__github__get_repo',
        tool_input: {},
        error: 'MCP error: 401 Unauthorized',
      }),
      store,
    );
    expect(store.events()[0]).toMatchObject({
      pattern: 'http_401',
      resource_hash: shortHash('tool:mcp__github__get_repo'),
    });
  });

  it('records nothing for an ordinary result, but marks the day active', () => {
    const store = freshStore();
    handleHookInput(
      JSON.stringify({
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/a' },
        tool_response: { content: 'ok' },
      }),
      store,
    );
    expect(store.events()).toEqual([]);
    expect(Object.values(store.activity())[0]?.claude).toEqual(['s1']);
  });

  it('never fails Claude Code: invalid JSON exits 0, writes no event, logs the error', () => {
    const home = mkdtempSync(join(tmpdir(), 'blocked-observer-'));
    const run = spawnSync(process.execPath, [CLI, 'hook'], {
      input: '{not json',
      env: { ...process.env, BLOCKED_OBSERVER_HOME: home },
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    expect(existsSync(join(home, 'events.jsonl'))).toBe(false);
    expect(readFileSync(join(home, 'errors.log'), 'utf8')).toContain('E_HOOK_INPUT');
  });
});

describe('patterns', () => {
  // Shapes observed in real Codex logs on 2026-10-08 (D23), rewritten without their content.
  const blocks: [string, string][] = [
    ["httpx.HTTPStatusError: Client error '401 Unauthorized' for url", 'http_401'],
    ['HTTP/1.1 401 Unauthorized', 'http_401'],
    ['The server returned HTTP 401 and no password is stored', 'http_401'],
    ['{"error":{"code":401,"status":"Unauthorized"}}', 'http_401'],
    ['gh: HTTP 403: Resource not accessible by integration', 'http_403'],
    ['upload failed: (403) Forbidden', 'http_403'],
    ['bash: ./deploy.sh: Permission denied', 'permission_denied'],
    ['AccessDenied: Access Denied', 'access_denied'],
    ['Error: access forbidden for this project', 'forbidden'],
    ['Unauthorized: token expired', 'unauthorized'],
    ['authentication required', 'authentication_required'],
    ['You are not authorized to perform this operation', 'not_authorized'],
    ["Error: EACCES: permission denied, open '/etc/x'", 'permission_denied'],
    ['Error: no such tool: jira_search', 'no_such_tool'],
    ['tool github_create_issue is not available', 'tool_not_available'],
    ['MCP server linear failed to start', 'mcp_server_failed'],
    ['This workspace requires sign-in', 'login_required'],
  ];
  const noise = [
    ' 400\t\t\treturn unreadIDs.count\n 401\t\t}\n 402\t}',
    "it.each([401, 403, 404, 422, 503])('preserves upstream status')",
    'Phone Number (**) *** *** 401',
    'HEAD:blueprint.md:401: API client',
    'raise BranchForbiddenError',
    'self.send_error(HTTPStatus.FORBIDDEN)',
    'const allowed = new Set(names.filter((name) => !forbidden.has(name)))',
    'Explicitly forbidden by the blueprint',
    'tool registry\nlater: not found in cache',
    'all good, 4010 items',
  ];

  it('recognizes real block messages', () => {
    for (const [message, expected] of blocks) expect(detectPattern(message), message).toBe(expected);
  });

  it('ignores code, line numbers and prose that only mention a code or the word', () => {
    for (const message of noise) expect(detectPattern(message), message).toBeUndefined();
    expect(PATTERNS).toHaveLength(13);
  });
});

describe('Codex import', () => {
  it('reads tool outputs from rollout logs and dedupes re-imports', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-'));
    mkdirSync(join(dir, '2026', '10', '08'), { recursive: true });
    const lines = [
      { timestamp: '2026-10-08T10:00:00Z', type: 'session_meta', payload: { session_id: 'cs1', id: 'cs1' } },
      {
        timestamp: '2026-10-08T10:00:01Z',
        type: 'response_item',
        payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: '{"cmd":"gh api orgs/acme"}' },
      },
      {
        timestamp: '2026-10-08T10:00:02Z',
        type: 'response_item',
        payload: { type: 'function_call_output', call_id: 'c1', output: 'gh: HTTP 403: Resource not accessible' },
      },
      {
        timestamp: '2026-10-08T10:00:03Z',
        type: 'response_item',
        payload: { type: 'custom_tool_call', name: 'exec', call_id: 'c2', input: 'ls' },
      },
      {
        timestamp: '2026-10-08T10:00:04Z',
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', call_id: 'c2', output: [{ type: 'input_text', text: 'fine' }] },
      },
    ];
    writeFileSync(
      join(dir, '2026', '10', '08', 'rollout-x.jsonl'),
      lines.map((line) => JSON.stringify(line)).join('\n'),
    );
    const parsed = parseCodexSessions(dir, 0);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      source: 'codex_log',
      agent: 'codex',
      session: 'cs1',
      tool: 'shell',
      pattern: 'http_403',
    });
    expect(JSON.stringify(parsed.events)).not.toContain('Resource not accessible');
    expect(parsed.sessions).toEqual([{ day: '2026-10-08', session: 'cs1' }]);
    expect(parseCodexSessions(dir, 0).events[0]?.id).toBe(parsed.events[0]?.id);
  });
});

const fixture: ObservedEvent[] = [
  {
    id: 'a1',
    ts: '2026-10-06T10:00:00Z',
    source: 'report',
    agent: 'claude_code',
    session: 's1',
    missing: 'access',
    resource: 'Datadog',
    attempted_action: 'lire',
    classification: 'YES_SENSITIVE_DATA',
    pain_minutes: 30,
  },
  {
    id: 'b1',
    ts: '2026-10-06T10:02:00Z',
    source: 'hook_claude',
    agent: 'claude_code',
    session: 's1',
    tool: 'Bash',
    pattern: 'http_403',
    classification: 'YES_SENSITIVE_DATA',
    pain_minutes: 0,
  },
  {
    id: 'b2',
    ts: '2026-10-07T09:00:00Z',
    source: 'hook_claude',
    agent: 'claude_code',
    session: 's2',
    tool: 'Bash',
    pattern: 'eacces',
    classification: 'NOT_A_BLOCK',
  },
  {
    id: 'c1',
    ts: '2026-10-08T09:00:00Z',
    source: 'codex_log',
    agent: 'codex',
    session: 'cs1',
    tool: 'shell',
    pattern: 'http_401',
    classification: 'YES_LOCAL_CONTEXT',
    pain_minutes: 15,
  },
  {
    id: 'a2',
    ts: '2026-10-08T12:00:00Z',
    source: 'report',
    agent: 'claude_code',
    session: 's3',
    missing: 'context',
    resource: 'roadmap',
    attempted_action: 'planifier',
  },
];
const activity = {
  '2026-10-06': { claude: ['s1'], codex: [] },
  '2026-10-07': { claude: ['s2'], codex: [] },
  '2026-10-08': { claude: ['s3'], codex: ['cs1'] },
  '2026-10-09': { claude: ['s4'], codex: [] },
};

describe('report and linking', () => {
  it('report gives exact figures on a fixture', () => {
    expect(buildReport(fixture, activity)).toEqual({
      activeDays: 4,
      events: 5,
      eventsPerActiveDay: 1.25,
      bySource: { report: 2, hook_claude: 2, codex_log: 1 },
      byClassification: { YES_SENSITIVE_DATA: 2, NOT_A_BLOCK: 1, YES_LOCAL_CONTEXT: 1, UNCLASSIFIED: 1 },
      painMinutes: 45,
      yesBlocks: 3,
      yesPerActiveDay: 0.75,
      medianPainMinutesYes: 15,
    });
  });

  it('links a report and an objective event of the same session less than 5 minutes apart', () => {
    const linked = linkEvents(fixture);
    expect(linked.find((event) => event.id === 'a1')?.linked_id).toBe('b1');
    expect(linked.find((event) => event.id === 'b1')?.linked_id).toBe('a1');
    expect(linked.find((event) => event.id === 'a2')?.linked_id).toBeUndefined();
  });
});

describe('export review', () => {
  it('export contains no field the user removed', () => {
    const decisions = new Map([
      ['a1', { keep: true as const, remove: ['resource' as const], hash: ['attempted_action' as const] }],
      ['b2', { keep: false as const }],
    ]);
    const out = applyReview(fixture, decisions, shortHash);
    expect(out.map((event) => event.id)).toEqual(['a1', 'b1', 'c1', 'a2']);
    const a1 = out[0];
    expect(a1 && 'resource' in a1).toBe(false);
    expect(a1?.attempted_action).toBe(`sha256:${shortHash('lire')}`);
    expect(JSON.stringify(out)).not.toContain('Datadog');
  });
});

describe('noise filter (D25)', () => {
  it('drops a refusal word that the agent only read in a file, a web page or its own tests', () => {
    for (const command of [
      "sed -n '1,200p' docs/api.md",
      "rtk nl -ba ROADMAP.md | rtk sed -n '75,95p;145,165p'",
      'git show origin/main:stacks/stacks.tsv | grep -n auth',
      'for f in a b; do cat "$f"; done',
      'rtk npm run build && rtk npm test',
      '/bin/cat AGENTS.md',
    ])
      expect(isReadOnlyCommand(command), command).toBe(true);
    expect(codexNoise('exec', 'tools.web__run({search_query:[{q:"x"}]})', '401 Unauthorized')).toBe(true);
    expect(codexNoise('exec', 'tools.exec_command({cmd:"cat notes.md"})', 'status code 401')).toBe(true);
    expect(claudeNoise('PostToolUse', 'Read', { file_path: '/x' })).toBe(true);
  });

  it('keeps a refusal from a command that reached a resource or failed', () => {
    for (const command of [
      'gh api repos/acme/infra/branches/main/protection',
      'ssh lab "docker logs kollio-api"',
      "sed -i 's/a/b/' file",
      'cat a && curl https://api.example.com',
      "echo 'x; curl evil'",
    ])
      expect(isReadOnlyCommand(command), command).toBe(command === "echo 'x; curl evil'");
    expect(codexNoise('exec', 'tools.exec_command({cmd:"cat secret"})', 'Permission denied\n"exit_code":1')).toBe(
      false,
    );
    expect(claudeNoise('PostToolUseFailure', 'Read', { file_path: '/x' })).toBe(false);
    expect(claudeNoise('PostToolUse', 'Bash', { command: 'curl -i https://api.example.com' })).toBe(false);
  });
});

describe('classify as a decision tree (D25)', () => {
  it('each path of the questions leads to exactly one code', () => {
    expect(classificationFrom({ blocked: false })).toBe('NOT_A_BLOCK');
    expect(classificationFrom({ blocked: true, someoneElse: false })).toBe('NO_HUMAN_REQUIRED');
    expect(classificationFrom({ blocked: true, someoneElse: true, accessFine: true })).toBe('NO_ACCESS_IS_FINE');
    expect(classificationFrom({ blocked: true, someoneElse: true, accessFine: false, shareFine: true })).toBe(
      'NO_SHARE_IS_FINE',
    );
    const reasons = REASONS.map((entry) =>
      classificationFrom({
        blocked: true,
        someoneElse: true,
        accessFine: false,
        shareFine: false,
        reason: entry.reason,
      }),
    );
    expect(reasons).toEqual(['YES_SENSITIVE_DATA', 'YES_PRIVILEGED_ACTION', 'YES_LOCAL_CONTEXT', 'YES_TEMPORARY']);
    expect(classificationFrom({ blocked: true })).toBeUndefined();
  });

  it('the classify command asks the questions and saves the code, minutes and note', () => {
    const store = freshStore();
    store.append({ id: 'evt12345', ts: '2026-10-08T10:00:00Z', source: 'report', agent: 'codex', resource: 'repo' });
    const run = spawnSync(process.execPath, [CLI, 'classify', 'evt1'], {
      input: 'o\no\nn\nn\n3\n15\nbranche locale de Julie\n',
      env: { ...process.env, BLOCKED_OBSERVER_HOME: store.root, BLOCKED_OBSERVER_NO_CODEX: '1' },
      encoding: 'utf8',
    });
    expect(run.stdout).toContain('YES_LOCAL_CONTEXT, saved');
    expect(store.events()[0]).toMatchObject({
      classification: 'YES_LOCAL_CONTEXT',
      pain_minutes: 15,
      note: 'branche locale de Julie',
    });
  });
});
