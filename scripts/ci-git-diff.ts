import { classifyCiPaths, type CiPathScope } from './ci-path-scope.ts';

/**
 * Decode `git diff --name-status -z --find-renames` without losing deleted,
 * copied or renamed source paths. NUL separators are mandatory because Git
 * filenames may contain tabs and newlines. Any unreadable data fails closed.
 *
 * No Git command is run here; the future CI adapter supplies the raw bytes.
 */
export function parseGitNameStatusZ(raw: Uint8Array | undefined | null): string[] | null {
  if (!raw || raw.byteLength === 0 || raw.byteLength > 4 * 1024 * 1024 || raw[raw.byteLength - 1] !== 0) return null;

  let fields: string[];
  try {
    fields = new TextDecoder('utf-8', { fatal: true }).decode(raw).split('\0');
  } catch {
    return null;
  }
  if (fields.pop() !== '' || fields.length === 0) return null;

  const paths: string[] = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    if (!status) return null;
    const changed = /^[AMDT]$/.test(status);
    const similarity = /^(R|C)(\d{1,3})$/.exec(status);
    const renamed = similarity !== null && Number(similarity[2]) <= 100;
    if (!changed && !renamed) return null;
    const count = renamed ? 2 : 1;
    if (i + count > fields.length) return null;
    for (let j = 0; j < count; j++) {
      const path = fields[i++];
      if (!path) return null;
      paths.push(path);
      if (paths.length > 10_000) return null;
    }
  }
  return paths.length > 0 ? paths : null;
}

export function classifyGitNameStatusZ(raw: Uint8Array | null | undefined): CiPathScope {
  return classifyCiPaths(parseGitNameStatusZ(raw));
}
