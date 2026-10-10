#!/usr/bin/env node
import { privateConfig, migratePrivate, rollbackPrivate } from './private-config.ts';
import { PrivateNetworkSchema } from '@drop/protocol';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { AGENTS, capabilities, connectMcp, McpAnswerConfigSchema } from '@drop/capabilities';
import { implFor } from '@drop/runner';
import { createTeam, generateIdentity, OwnerKindSchema, type ConsentCost } from '@drop/protocol';
import { startDaemon } from './daemon.ts';
import { AGENT_LABELS, detectAgents } from './detect.ts';
import { bundledServer, cursorInstallLink, serverEntry } from './install.ts';
import { applyOnboarding, previewOnboarding } from './onboarding.ts';
import { isAgentKind, shareDetected } from './share.ts';
import { DropHome, NodeConfigSchema } from './home.ts';
import { costLine } from './ui.ts';

const AgentKindSchema = z.enum(AGENTS);

const USAGE = `drop <command>
  init --name <name> [--kind human|team|machine|service] [--relay <internal URL>] [--port 7781]
       [--profile private|legacy] [--network <policy.json>]
  migrate-private --relay <url> [--network <policy.json>]  stop daemon first; backs up config
  rollback-private               stop daemon first; restores unchanged migrated config
  serve                          daemon: relay, local API, consent UI, runner
  invite                         print a one-time pairing code (daemon must run)
  pair <code>                    pair with the node that issued the code (daemon must run)
  peers                          list paired peers
  publish <capability-id> --approver <nodeId> [--config <file.json>]
                                 e.g. publish mcp.answer.figma --config figma.json (one per MCP server)
  mcp-tools --config <file.json> list the tools of the MCP server in an mcp.answer config, to choose which to share
  team create <name>             start a team; your invites then bring people into it
  team                           members, their agents, online or not, and what each one shares (daemon must run)
  install <agent>|all [--link]   add drop to Claude Code, Codex, Cursor or Claude Desktop (agent: claude_code, codex,
                                 cursor, claude_desktop); --link prints a Cursor install link instead
  uninstall <agent>|all          remove drop from an agent
  detect [--json]                the coding agents on this machine, drop in each, and their MCP servers
  share <agent>/<server> [--label <text>] [--tools a,b] [--id mcp.answer.<name>] [--approver <nodeId>]
                                 answer from a detected MCP server (read-only tools by default; secrets stay put)
  pending                        requests waiting for your decision
  approve|deny|not-now <dropId>  decide from the terminal
  review <dropId> send|discard [--redact <field>]…
  receipts [--since 7d]          history
  print-instructions             snippet for a requester repo's AGENTS.md / CLAUDE.md`;

const INSTRUCTIONS = `Si tu es bloqué par une ressource, une donnée ou un contexte qui appartient à un collègue, appelle
\`list_capabilities\`. Si une capacité correspond, propose à l'utilisateur de l'utiliser et attends son accord avant
d'appeler \`request_drop\`. Si la réponse est éparpillée entre plusieurs personnes, utilise \`request_drops\` puis
\`get_drop_results\`, et dis d'où vient chaque information.`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseSince(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(\d+)([hd])$/.exec(value);
  if (!match) fail('--since expects e.g. 24h or 7d');
  return Date.now() - Number(match[1]) * (match[2] === 'd' ? 86_400_000 : 3_600_000);
}

async function api(
  home: DropHome,
  method: string,
  path: string,
  form?: Record<string, string | string[]>,
): Promise<unknown> {
  const port = home.config().apiPort;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(form ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
  }
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${home.localToken()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      ...(form ? { body } : {}),
    });
  } catch {
    fail(`cannot reach the daemon on 127.0.0.1:${String(port)}: run \`drop serve\` first`);
  }
  const payload: unknown = await response.json();
  if (!response.ok) fail(`error: ${JSON.stringify(payload)}`);
  return payload;
}

const [command, ...rest] = process.argv.slice(2);
const home = new DropHome();

switch (command) {
  case 'init': {
    const { values } = parseArgs({
      args: rest,
      options: {
        name: { type: 'string' },
        kind: { type: 'string' },
        relay: { type: 'string' },
        port: { type: 'string' },
        network: { type: 'string' },
        profile: { type: 'string' },
      },
    });
    if (!values.name) fail('drop init --name <name> [--relay <internal URL>]');
    if (values.profile && !['private', 'legacy'].includes(values.profile)) fail('unknown profile');
    const relayUrl = values.relay ?? 'ws://127.0.0.1:7780/v1';
    const network = values.network
      ? PrivateNetworkSchema.parse(JSON.parse(readFileSync(values.network, 'utf8')))
      : undefined;
    const ownerKind = OwnerKindSchema.parse(values.kind ?? 'human');
    const identity = await generateIdentity(values.name);
    home.init(
      identity,
      values.profile === 'legacy'
        ? NodeConfigSchema.parse({ relayUrl, ownerKind, apiPort: Number(values.port ?? 7781) })
        : privateConfig(relayUrl, ownerKind, Number(values.port ?? 7781), network),
    );
    process.stdout.write(
      `initialized ${home.root}\nnodeId ${identity.nodeId}\njoin the relay: \`drop pair <invite code>\` from a member (or, for a first node, ask the relay operator to run: drop-relay allow ${identity.nodeId})\n`,
    );
    break;
  }
  case 'migrate-private': {
    const { values } = parseArgs({ args: rest, options: { relay: { type: 'string' }, network: { type: 'string' } } });
    if (!values.relay) fail('migrate-private requires --relay');
    migratePrivate(
      home,
      values.relay,
      values.network ? PrivateNetworkSchema.parse(JSON.parse(readFileSync(values.network, 'utf8'))) : undefined,
    );
    process.stdout.write('private profile configured; restart the daemon; backup: private-migration.json\n');
    break;
  }
  case 'rollback-private': {
    rollbackPrivate(home);
    process.stdout.write('previous configuration restored; restart the daemon\n');
    break;
  }
  case 'serve': {
    const daemon = await startDaemon(home);
    process.stdout.write(
      // The UI link carries the local token: only show it to a person at a terminal, never to a log collector.
      `drop serve: ${home.identity().displayName} (${home.identity().nodeId})\n${
        process.stdout.isTTY
          ? `consent UI: ${daemon.uiUrl}`
          : `consent UI on 127.0.0.1:${String(daemon.api.port)}, token in ${home.root}/local-token`
      }\n`,
    );
    const stop = (): void => {
      daemon.stop().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    // Launched by the Mac app (T4.18): the app holds this stdin pipe open; the system closes it when the app dies,
    // even when killed, so the daemon never outlives its shell. A terminal or a script never sets this variable.
    if (process.env.DROP_EXIT_WITH_PARENT === 'stdin') {
      let gone = false;
      const parentGone = (): void => {
        if (gone) return;
        gone = true;
        process.stderr.write(
          `${JSON.stringify({ at: new Date().toISOString(), event: 'daemon_parent_gone', code: 'E_PARENT_GONE' })}\n`,
        );
        stop();
      };
      process.stdin.once('end', parentGone);
      process.stdin.once('close', parentGone);
      process.stdin.once('error', parentGone);
      process.stdin.resume();
    }
    break;
  }
  case 'invite': {
    const { code } = (await api(home, 'POST', '/ui/invite', {})) as { code: string };
    process.stdout.write(`${code}\n(valid 24 hours, single use; also lets a new node join the relay)\n`);
    break;
  }
  case 'pair': {
    const code = rest[0] ?? fail('drop pair <code>');
    const { nodeId } = (await api(home, 'POST', '/ui/pair', { code })) as { nodeId: string };
    process.stdout.write(`pair request sent to ${nodeId}; \`drop peers\` shows it once accepted\n`);
    break;
  }
  case 'peers':
    for (const peer of home.peers()) process.stdout.write(`${peer.displayName}\t${peer.ownerKind}\t${peer.nodeId}\n`);
    break;
  case 'publish': {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { approver: { type: 'string', multiple: true }, config: { type: 'string' } },
    });
    const capabilityId = positionals[0] ?? fail('drop publish <capability-id> --approver <nodeId>');
    const impl =
      implFor(capabilities, capabilityId) ??
      fail(
        `unknown capability ${capabilityId}; known: ${capabilities.map((c) => (c.family ? `${c.card.id}.<name>` : c.card.id)).join(', ')}`,
      );
    const config: unknown = values.config ? JSON.parse(readFileSync(values.config, 'utf8')) : {};
    const parsed = impl.configSchema.safeParse(config);
    if (!parsed.success) fail(`invalid config for ${capabilityId}: ${parsed.error.message}`);
    home.publish({
      capabilityId,
      approverNodeIds: values.approver ?? [home.identity().nodeId],
      config: parsed.data,
      publishedAt: new Date().toISOString(),
    });
    process.stdout.write(`published ${capabilityId} (restart \`drop serve\` if it is running)\n`);
    break;
  }
  case 'team': {
    if (rest[0] === 'create') {
      const name = rest.slice(1).join(' ').trim() || fail('drop team create <name>');
      if (home.team()) fail(`already in team ${home.team()?.team.name ?? ''}`);
      const identity = home.identity();
      home.saveTeam({
        team: createTeam(name),
        members: [
          {
            nodeId: identity.nodeId,
            displayName: identity.displayName,
            ownerKind: home.config().ownerKind,
            agents: [],
          },
        ],
      });
      process.stdout.write(
        `team ${name} created; \`drop invite\` now brings people into it (restart \`drop serve\`)\n`,
      );
      break;
    }
    const { team, members } = (await api(home, 'GET', '/ui/team')) as {
      team: { name: string } | null;
      members: {
        displayName: string;
        self: boolean;
        online: boolean;
        agents: string[];
        capabilities: { title: string }[];
      }[];
    };
    if (!team) fail('not in a team: `drop team create <name>`, or `drop pair <code>` with an invite from a member');
    process.stdout.write(`${team.name} · ${String(members.length)} members\n`);
    for (const member of members) {
      process.stdout.write(
        `${member.online ? '●' : '○'} ${member.displayName}${member.self ? ' (toi)' : ''}\t${member.agents.join(', ') || '-'}\n`,
      );
      for (const capability of member.capabilities) process.stdout.write(`    ${capability.title}\n`);
    }
    break;
  }
  case 'install':
  case 'uninstall': {
    const target = rest[0] ?? fail(`drop ${command} <agent>|all`);
    const remove = command === 'uninstall';
    const detected = detectAgents();
    const agents =
      target === 'all'
        ? detected.filter((agent) => agent.installed).map((agent) => agent.agent)
        : [AgentKindSchema.parse(target)];
    if (rest.includes('--link')) {
      const server = bundledServer() ?? fail('the bundled server is missing: run `node scripts/bundle.ts` first');
      process.stdout.write(`${cursorInstallLink(serverEntry('cursor', home.root, server))}\n`);
      break;
    }
    for (const agent of agents) {
      const plan = previewOnboarding({ dropHome: home.root }).find((item) => item.agent === agent);
      if (!plan || plan.state === 'absent' || plan.state === 'error' || plan.state === 'conflict') {
        process.stderr.write(`${AGENT_LABELS[agent]}: ${plan?.detail ?? 'E_AGENT_INVALID'}\n`);
        continue;
      }
      const result = applyOnboarding(
        [{ agent, fingerprint: plan.fingerprint, action: remove ? 'disconnect' : 'connect' }],
        { dropHome: home.root },
      )[0];
      if (result?.state === 'connected' || result?.state === 'disconnected' || result?.state === 'already_connected')
        process.stdout.write(`${AGENT_LABELS[agent]}: ${result.detail}\n`);
      else process.stderr.write(`${AGENT_LABELS[agent]}: ${result?.detail ?? 'E_ONBOARDING_FAILED'}\n`);
    }
    if (!remove) process.stdout.write('restart the agent so it loads drop\n');
    break;
  }
  case 'detect': {
    const started = performance.now();
    const agents = detectAgents();
    if (rest.includes('--json')) {
      process.stdout.write(`${JSON.stringify(agents, null, 2)}\n`);
      break;
    }
    for (const agent of agents) {
      if (!agent.installed) continue;
      process.stdout.write(`${agent.label}${agent.dropInstalled ? '  (drop installé)' : '  (drop absent)'}\n`);
      for (const server of agent.servers) {
        const secrets = [...server.envNames, ...server.headerNames];
        process.stdout.write(
          `  ${server.shareable ? '·' : ' '} ${agent.agent}/${server.name}\t${server.kind ?? ''}\t${server.where}${secrets.length > 0 ? `\tvariables: ${secrets.join(', ')}` : ''}\n`,
        );
      }
    }
    process.stdout.write(`(${String(Math.round(performance.now() - started))} ms)\n`);
    break;
  }
  case 'share': {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        label: { type: 'string' },
        tools: { type: 'string' },
        id: { type: 'string' },
        approver: { type: 'string', multiple: true },
      },
    });
    const [agentName = '', serverName = ''] = (positionals[0] ?? fail('drop share <agent>/<server>')).split('/');
    if (!isAgentKind(agentName)) fail(`unknown agent ${agentName}; one of ${AGENTS.join(', ')}`);
    try {
      const shared = await shareDetected(home, {
        agent: agentName,
        server: serverName,
        label: values.label,
        tools: values.tools?.split(',').map((tool) => tool.trim()),
        capabilityId: values.id,
        approvers: values.approver,
      });
      process.stdout.write(
        `published ${shared.capabilityId}: « Répondre à partir de ${shared.label} » with ${String(shared.tools.length)} tools (${shared.tools.join(', ')}) from ${AGENT_LABELS[agentName]}\n`,
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : 'share failed');
    }
    break;
  }
  case 'mcp-tools': {
    const { values } = parseArgs({ args: rest, options: { config: { type: 'string' } } });
    const raw: unknown = JSON.parse(readFileSync(values.config ?? fail('drop mcp-tools --config <file.json>'), 'utf8'));
    // Only the server part is needed here: the tool list may still be empty while the owner is choosing.
    const server = McpAnswerConfigSchema.shape.server.parse((raw as { server?: unknown }).server);
    const client = await connectMcp(
      server,
      process.env,
      home.config().profile === 'private' ? home.config().network : undefined,
    );
    try {
      for (const tool of (await client.listTools()).tools) {
        const hint = tool.annotations?.destructiveHint
          ? 'destructive, never run'
          : tool.annotations?.readOnlyHint
            ? 'read-only'
            : 'not marked';
        process.stdout.write(
          `${tool.name}\t${hint}\t${(tool.description ?? '').split('\n')[0]?.slice(0, 100) ?? ''}\n`,
        );
      }
    } finally {
      await client.close();
    }
    break;
  }
  case 'pending': {
    const { pending } = (await api(home, 'GET', '/ui/pending')) as {
      pending: {
        kind: string;
        dropId: string;
        requestedBy?: { displayName: string };
        card?: { title: string; cost?: ConsentCost; paidBy?: 'owner' | 'requester' };
        title?: string;
        purpose?: string;
        inputPreview?: string;
        output?: unknown;
      }[];
    };
    if (pending.length === 0) process.stdout.write('nothing pending\n');
    for (const item of pending) {
      const cost = costLine(
        item.card?.cost,
        item.card?.paidBy === 'requester' ? item.requestedBy?.displayName : undefined,
      );
      process.stdout.write(
        item.kind === 'approval'
          ? `${item.dropId}  ${item.requestedBy?.displayName ?? ''}: ${item.card?.title ?? ''}\n  « ${item.inputPreview ?? ''} »\n  Pourquoi : ${item.purpose ?? ''}\n${cost ? `  ${cost}\n` : ''}`
          : `${item.dropId}  à relire : ${item.title ?? ''}\n${JSON.stringify(item.output, null, 2)}\n`,
      );
    }
    break;
  }
  case 'approve':
  case 'deny':
  case 'not-now': {
    const dropId = rest[0] ?? fail(`drop ${command} <dropId>`);
    const decision = command === 'approve' ? 'allow_once' : command === 'deny' ? 'deny' : 'not_now';
    await api(home, 'POST', '/ui/decide', { dropId, decision });
    process.stdout.write(`${decision} sent\n`);
    break;
  }
  case 'review': {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { redact: { type: 'string', multiple: true } },
    });
    const [dropId, decision] = positionals;
    if (!dropId || (decision !== 'send' && decision !== 'discard'))
      fail('drop review <dropId> send|discard [--redact field]');
    await api(home, 'POST', '/ui/review', { dropId, decision, redact: values.redact ?? [] });
    process.stdout.write(`${decision} sent\n`);
    break;
  }
  case 'receipts': {
    const { values } = parseArgs({ args: rest, options: { since: { type: 'string' } } });
    for (const receipt of home.receipts(parseSince(values.since))) {
      const at = new Date(receipt.timestamps.requested ?? 0).toISOString();
      process.stdout.write(
        `${at}  ${receipt.capabilityId}  ${receipt.decision}${receipt.errorCode ? ` ${receipt.errorCode}` : ''}${receipt.costUsd === undefined ? '' : `  ${receipt.costUsd.toFixed(4)} $`}  ${receipt.dropId}\n`,
      );
    }
    break;
  }
  case 'print-instructions':
    process.stdout.write(`${INSTRUCTIONS}\n`);
    break;
  default:
    process.stdout.write(`${USAGE}\n`);
    if (command && command !== 'help') process.exit(2);
}
