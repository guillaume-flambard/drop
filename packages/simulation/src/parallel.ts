/**
 * Runs `task` over `items` with at most `limit` running at once, results in input order (T4.42). After a failure no
 * new task starts, and the tasks already running are awaited before the first error is thrown: a failed bench start
 * never leaves a CLI process running behind its cleanup.
 */
export async function inParallel<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    while (failure === undefined && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await task(items[index] as T, index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (failure !== undefined) throw failure.error;
  return results;
}
