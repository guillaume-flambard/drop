import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const chart = join(import.meta.dirname, '..', 'deploy', 'helm', 'drop-relay');

/** Kubernetes Helm 3 or 4, from HELM_BIN or the PATH; another program called helm does not count. */
function kubernetesHelm(): string | undefined {
  for (const candidate of [process.env.HELM_BIN, 'helm']) {
    if (!candidate) continue;
    try {
      const version = execFileSync(candidate, ['version', '--short'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (/^v[34]\./.test(version.trim())) return candidate;
    } catch {
      // Not there, or not Helm.
    }
  }
  return undefined;
}

const helm = kubernetesHelm();

describe('enterprise policy (T4.10)', () => {
  it.skipIf(!helm)('renders a hardened single-replica Helm chart for the relay', () => {
    const run = (...args: string[]) => execFileSync(helm ?? 'helm', args, { encoding: 'utf8' });
    run('lint', '--strict', chart);
    const plain = run('template', 'atlas', chart);
    expect(plain).toContain('replicas: 1');
    expect(plain).toContain('runAsNonRoot: true');
    expect(plain).toContain('readOnlyRootFilesystem: true');
    expect(plain).toContain('allowPrivilegeEscalation: false');
    expect(plain).toContain('automountServiceAccountToken: false');
    expect(plain).toContain('claimName: atlas-data');
    expect(plain).not.toContain('policyPath');

    const managed = run(
      'template',
      'atlas',
      chart,
      '--set',
      'tls.enabled=true',
      '--set',
      'tls.secretName=atlas-relay-tls',
      '--set',
      'policy.enabled=true',
      '--set',
      'policy.issuer=11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      '--set-json',
      'policy.signedPolicy={"policy":{"policyId":"atlas-default"},"sig":"x"}',
    );
    expect(managed).toContain('containerPort: 8443');
    expect(managed).toContain('scheme: HTTPS');
    expect(managed).toContain('secretName: atlas-relay-tls');
    expect(managed).toContain('mountPath: /policy/policy.json');
    expect(managed).toContain('\\"policyPath\\":\\"/policy/policy.json\\"');
    expect(managed).toContain('\\"certPath\\":\\"/tls/tls.crt\\"');
    // An ingress without its TLS secret is refused: the relay is only reached over TLS.
    expect(() => run('template', 'atlas', chart, '--set', 'ingress.enabled=true')).toThrow();
    // A policy without its issuer would start an open relay: refused.
    expect(() => run('template', 'atlas', chart, '--set', 'policy.enabled=true')).toThrow();

    // A new policy changes the pod template, so the relay restarts on it; behind an ingress it is reached over HTTPS.
    const checksum = (rendered: string) => /checksum\/config: (\w+)/.exec(rendered)?.[1];
    const rotated = run(
      'template',
      'atlas',
      chart,
      '--set',
      'tls.enabled=true',
      '--set',
      'tls.secretName=atlas-relay-tls',
      '--set',
      'policy.enabled=true',
      '--set',
      'policy.issuer=11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      '--set-json',
      'policy.signedPolicy={"policy":{"policyId":"atlas-default","version":2},"sig":"y"}',
      '--set',
      'ingress.enabled=true',
      '--set',
      'ingress.tlsSecretName=atlas-ingress-tls',
    );
    expect(checksum(rotated)).toBeDefined();
    expect(checksum(rotated)).not.toBe(checksum(managed));
    expect(rotated).toContain('nginx.ingress.kubernetes.io/backend-protocol: HTTPS');
  });
});
