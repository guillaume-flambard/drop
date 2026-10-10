#!/usr/bin/env node
// drop-gateway (T2.13, D31): the connector ChatGPT and Claude add by URL.
//   drop-gateway init                 creates the gateway identity in GATEWAY_HOME and prints its nodeId
//   drop-gateway serve                serves OAuth and /mcp on GATEWAY_PORT, connected to GATEWAY_RELAY_URL
// Environment: GATEWAY_HOME (default ./gateway-home), GATEWAY_PUBLIC_URL (default https://drop.memolabs.dev),
// GATEWAY_RELAY_URL (default wss://drop.memolabs.dev/v1), GATEWAY_PORT (default 7790), GATEWAY_HOST (default 127.0.0.1).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateIdentity, IdentitySchema } from '@drop/protocol';
import { Bridge } from './bridge.ts';
import { OAuthServer, OAuthStateSchema } from './oauth.ts';
import { startGatewayHttp } from './server.ts';

const home = process.env.GATEWAY_HOME ?? join(process.cwd(), 'gateway-home');
const publicUrl = (process.env.GATEWAY_PUBLIC_URL ?? 'https://drop.memolabs.dev').replace(/\/$/, '');
const relayUrl = process.env.GATEWAY_RELAY_URL ?? 'wss://drop.memolabs.dev/v1';
const identityPath = join(home, 'identity.json');
const statePath = join(home, 'state.json');

function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

const command = process.argv[2];
if (command === 'init') {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  if (!existsSync(identityPath))
    writePrivate(identityPath, `${JSON.stringify(await generateIdentity('drop gateway'), null, 2)}\n`);
  const identity = IdentitySchema.parse(JSON.parse(readFileSync(identityPath, 'utf8')));
  process.stdout.write(
    `gateway nodeId ${identity.nodeId}\n(add it to the relay's allowedNodeIds, and to the app's trusted gateways)\n`,
  );
} else if (command === 'serve') {
  const identity = IdentitySchema.parse(JSON.parse(readFileSync(identityPath, 'utf8')));
  const state = existsSync(statePath) ? OAuthStateSchema.parse(JSON.parse(readFileSync(statePath, 'utf8'))) : undefined;
  const oauth = new OAuthServer({
    resource: `${publicUrl}/mcp`,
    ...(state ? { state } : {}),
    persist: (next) => {
      writePrivate(statePath, `${JSON.stringify(next)}\n`);
    },
  });
  const bridge = new Bridge({
    identity,
    relayUrl,
    isPendingSession: (sessionId) => oauth.session(sessionId) !== undefined,
    onLinkGrant: (sessionId, nodeId, claim) => oauth.approve(sessionId, nodeId, claim),
    isLinkedNode: (nodeId) => oauth.hasNode(nodeId),
    log: (line) => process.stderr.write(`${line}\n`),
  });
  bridge.start();
  const http = await startGatewayHttp({
    publicUrl,
    gatewayNodeId: identity.nodeId,
    oauth,
    caller: { call: (link, tool, args) => bridge.call(link, tool, args) },
    port: Number(process.env.GATEWAY_PORT ?? 7790),
    host: process.env.GATEWAY_HOST ?? '127.0.0.1',
  });
  process.stderr.write(`drop gateway on ${publicUrl} (port ${String(http.port)}), nodeId ${identity.nodeId}\n`);
} else {
  process.stdout.write('drop-gateway init|serve\n');
  if (command) process.exit(2);
}
