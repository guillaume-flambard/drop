import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function trackedDockerfiles(): string[] {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (listed.error) throw listed.error;
  return listed.stdout.split('\0').filter((file) => /(^|\/)(Dockerfile|[^/]+\.Dockerfile)$/.test(file));
}

/** The directories of the `docker` entry of dependabot.yml, as written there (`/`, `/docker`, …). */
function dependabotDockerDirectories(): string[] {
  const text = readFileSync(join(root, '.github', 'dependabot.yml'), 'utf8');
  const block = text.split(/\n(?= {2}- package-ecosystem:)/).find((entry) => /package-ecosystem: docker\b/.test(entry));
  return [...(block ?? '').matchAll(/^ {6}- (\/\S*)$/gm)].map((match) => match[1] ?? '');
}

describe('container images pinned by digest (T4.26)', () => {
  it('pins every base image of every Dockerfile by digest and keeps it under Dependabot', () => {
    const files = trackedDockerfiles();
    expect(files).toEqual(
      expect.arrayContaining(['Dockerfile', 'scripts/hermes-proof/Dockerfile', 'scripts/private-proof/Dockerfile']),
    );
    const unpinned: string[] = [];
    for (const file of files) {
      const stages = new Set<string>();
      for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
        const from = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line.trim());
        if (!from) continue;
        const image = from[1] ?? '';
        // A later stage may start from an earlier one by its name: that is no new image to pin.
        if (!stages.has(image.toLowerCase()) && !/@sha256:[0-9a-f]{64}$/.test(image))
          unpinned.push(`${file}: ${image}`);
        if (from[2]) stages.add(from[2].toLowerCase());
      }
    }
    expect(unpinned).toEqual([]);
    const watched = dependabotDockerDirectories();
    const directories = [...new Set(files.map((file) => `/${dirname(file)}`.replace(/\/\.$/, '/')))];
    expect(directories.filter((directory) => !watched.includes(directory))).toEqual([]);
  });
});
