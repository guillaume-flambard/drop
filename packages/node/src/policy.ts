/**
 * The organization policy (T4.10, D54, D81), as a node reads and applies it. IT deploys `policy.json` and `issuer.pub`
 * through MDM in a system directory the user cannot write to. A policy that is there but does not verify, comes from
 * another issuer or has expired stops the daemon: a managed machine never runs unmanaged by accident.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DropError,
  policyExpired,
  policyFingerprint,
  SignedPolicySchema,
  verifyPolicy,
  type ParsedPolicy,
  type SignedPolicy,
} from '@drop/protocol';

export interface ActivePolicy {
  signed: SignedPolicy;
  policy: ParsedPolicy;
  /** What the node presents to its relay. */
  fingerprint: string;
}

/**
 * Where MDM deploys the policy on each system. Fixed paths, never read from the environment: a user who starts the
 * node with another ProgramData would otherwise point it at an empty folder and run unmanaged.
 */
export function systemPolicyDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return '/Library/Application Support/drop';
  if (platform === 'win32') return 'C:\\ProgramData\\drop';
  return '/etc/drop';
}

/** A folder that holds a policy or its issuer key is managed: one without the other fails closed. */
function deployed(dir: string | undefined): dir is string {
  return dir !== undefined && (existsSync(join(dir, 'policy.json')) || existsSync(join(dir, 'issuer.pub')));
}

function refuse(reason: string): never {
  throw new DropError('E_DENIED', `E_POLICY ${reason}`);
}

/**
 * The policy in force, if any. The system directory wins: DROP_POLICY_DIR (development, tests) is read only when the
 * system has no policy, so an environment variable can never point away from a deployed one.
 */
export async function loadPolicy(
  options: { systemDir?: string; envDir?: string | undefined; now?: number } = {},
): Promise<ActivePolicy | undefined> {
  const systemDir = options.systemDir ?? systemPolicyDir();
  const envDir = 'envDir' in options ? options.envDir : process.env.DROP_POLICY_DIR;
  const dir = deployed(systemDir) ? systemDir : deployed(envDir) ? envDir : undefined;
  if (!dir) return undefined;
  let raw: unknown;
  let issuer: string;
  try {
    raw = JSON.parse(readFileSync(join(dir, 'policy.json'), 'utf8'));
    issuer = readFileSync(join(dir, 'issuer.pub'), 'utf8').trim();
  } catch {
    return refuse('policy or issuer key unreadable');
  }
  if (!(await verifyPolicy(raw, issuer))) return refuse('policy does not verify against its issuer');
  const signed = SignedPolicySchema.parse(raw);
  if (policyExpired(signed.policy, options.now ?? Date.now())) return refuse('policy expired or not yet valid');
  return { signed, policy: signed.policy, fingerprint: policyFingerprint(signed) };
}

export function relayAllowed(policy: ParsedPolicy, url: string): boolean {
  return policy.relays.includes(url);
}

/** An iroh relay under a policy: only one on the host of a relay the organization lists. */
export function irohRelayPermitted(policy: ParsedPolicy | undefined, url: string): boolean {
  if (!policy) return true;
  try {
    const host = new URL(url).hostname;
    return policy.relays.some((relay) => new URL(relay).hostname === host);
  } catch {
    return false;
  }
}

export function clientAllowed(policy: ParsedPolicy | undefined, agent: string): boolean {
  return !policy?.allowedClients || policy.allowedClients.includes(agent);
}

/** A model endpoint under one of the allowed origins; any when the policy lists none. */
export function providerAllowed(policy: ParsedPolicy | undefined, baseUrl: string): boolean {
  if (!policy?.allowedProviders) return true;
  try {
    return policy.allowedProviders.includes(new URL(baseUrl).origin);
  } catch {
    return false;
  }
}

export function gatewayAllowed(policy: ParsedPolicy | undefined, gateway: string): boolean {
  if (!policy) return true;
  const { allowed, nodeIds } = policy.gateways;
  return allowed && (nodeIds.length === 0 || nodeIds.includes(gateway));
}

export function assertPolicy(condition: boolean, reason: string): void {
  if (!condition) refuse(reason);
}
