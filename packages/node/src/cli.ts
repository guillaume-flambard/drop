#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { capabilities } from '@drop/capabilities';
import { generateIdentity, OwnerKindSchema, type ConsentCost } from '@drop/protocol';
import { startDaemon } from './daemon.ts';
import { DropHome } from './home.ts';
import { costLine } from './ui.ts';

const USAGE = `drop <command>
  init --name <name> --kind human|team|machine|service --relay <wss://…> [--port 7781]
  serve                          daemon: relay, local API, consent UI, runner
  invite                         print a one-time pairing code (daemon must run)
  pair <code>                    pair with the node that issued the code (daemon must run)
  peers                          list paired peers
  publish <capability-id> --approver <nodeId> [--config <file.json>]
  pending                        requests waiting for your decision
  approve|deny|not-now <dropId>  decide from the terminal
  review <dropId> send|discard [--redact <field>]…
  receipts [--since 7d]          history
  print-instructions             snippet for a requester repo's AGENTS.md / CLAUDE.md`;

const INSTRUCTIONS = `Si tu es bloqué par une ressource, une donnée ou un contexte qui appartient à un collègue, appelle
\`list_capabilities\`. Si une capacité correspond, propose à l'utilisateur de l'utiliser et attends son accord avant
d'appeler \`request_drop\`.`;

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
      },
    });
    if (!values.name || !values.relay) fail('drop init --name <name> --kind human --relay wss://…');
    const ownerKind = OwnerKindSchema.parse(values.kind ?? 'human');
    const identity = await generateIdentity(values.name);
    home.init(identity, { relayUrl: values.relay, ownerKind, apiPort: Number(values.port ?? 7781) });
    process.stdout.write(
      `initialized ${home.root}\nnodeId ${identity.nodeId}\nask the relay operator to run: drop-relay allow ${identity.nodeId}\n`,
    );
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
    break;
  }
  case 'invite': {
    const { code } = (await api(home, 'POST', '/ui/invite', {})) as { code: string };
    process.stdout.write(`${code}\n(valid 15 minutes, single use)\n`);
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
      capabilities.find((candidate) => candidate.card.id === capabilityId) ??
      fail(`unknown capability ${capabilityId}; known: ${capabilities.map((c) => c.card.id).join(', ')}`);
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
  case 'pending': {
    const { pending } = (await api(home, 'GET', '/ui/pending')) as {
      pending: {
        kind: string;
        dropId: string;
        requestedBy?: { displayName: string };
        card?: { title: string; cost?: ConsentCost };
        title?: string;
        purpose?: string;
        inputPreview?: string;
        output?: unknown;
      }[];
    };
    if (pending.length === 0) process.stdout.write('nothing pending\n');
    for (const item of pending) {
      process.stdout.write(
        item.kind === 'approval'
          ? `${item.dropId}  ${item.requestedBy?.displayName ?? ''}: ${item.card?.title ?? ''}\n  « ${item.inputPreview ?? ''} »\n  Pourquoi : ${item.purpose ?? ''}\n${costLine(item.card?.cost) ? `  ${costLine(item.card?.cost) ?? ''}\n` : ''}`
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
