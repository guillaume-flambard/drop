/**
 * Removes the fields an approver unchecked in a review_decision (pipeline step 7, applied by the node).
 * Paths are either dotted ("a.b.0.c") or JSON pointers ("/a/b/0/c"). Unknown paths are ignored.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePath(path: string): string[] {
  if (path === '') return [];
  if (path.startsWith('/')) {
    return path
      .slice(1)
      .split('/')
      .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  }
  return path.split('.');
}

function arrayIndex(container: unknown[], segment: string): number | undefined {
  if (!/^\d+$/.test(segment)) return undefined;
  const index = Number(segment);
  return index < container.length ? index : undefined;
}

function child(container: unknown, segment: string): unknown {
  if (Array.isArray(container)) {
    const index = arrayIndex(container, segment);
    return index === undefined ? undefined : container[index];
  }
  if (isRecord(container) && Object.hasOwn(container, segment)) return container[segment];
  return undefined;
}

export function applyRedactions(output: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const copy = structuredClone(output);
  const keyRemovals: { target: Record<string, unknown>; key: string }[] = [];
  const indexRemovals = new Map<unknown[], Set<number>>();

  // Resolve every path against the untouched copy first, so removing one entry never shifts another path.
  for (const path of paths) {
    const segments = parsePath(path);
    const last = segments.pop();
    if (last === undefined) return {};
    let parent: unknown = copy;
    for (const segment of segments) parent = child(parent, segment);
    if (Array.isArray(parent)) {
      const index = arrayIndex(parent, last);
      if (index === undefined) continue;
      const indices = indexRemovals.get(parent) ?? new Set<number>();
      indices.add(index);
      indexRemovals.set(parent, indices);
    } else if (isRecord(parent) && Object.hasOwn(parent, last)) {
      keyRemovals.push({ target: parent, key: last });
    }
  }

  for (const { target, key } of keyRemovals) Reflect.deleteProperty(target, key);
  for (const [target, indices] of indexRemovals) {
    const kept = target.filter((_item, index) => !indices.has(index));
    target.splice(0, target.length, ...kept);
  }
  return copy;
}
