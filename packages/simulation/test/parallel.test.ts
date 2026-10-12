import { describe, expect, it } from 'vitest';
import { inParallel } from '../src/parallel.ts';

const tick = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

describe('bench start in parallel (T4.42)', () => {
  it('runs at most the limit at once and keeps results in input order', async () => {
    let running = 0;
    let peak = 0;
    const results = await inParallel([30, 5, 20, 1, 10, 15, 2], 3, async (ms, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await tick(ms);
      running -= 1;
      return `${String(index)}:${String(ms)}`;
    });
    expect(peak).toBe(3);
    expect(results).toEqual(['0:30', '1:5', '2:20', '3:1', '4:10', '5:15', '6:2']);
  });

  it('starts nothing new after a failure and settles the tasks in flight before rejecting', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    await expect(
      inParallel([0, 1, 2, 3, 4, 5], 2, async (item) => {
        started.push(item);
        await tick(item === 1 ? 5 : 30);
        if (item === 1) throw new Error('E_INIT');
        finished.push(item);
      }),
    ).rejects.toThrow('E_INIT');
    // 0 and 1 start together; 1 fails first; 0 is still awaited, and 2 to 5 never start.
    expect(started).toEqual([0, 1]);
    expect(finished).toEqual([0]);
  });

  it('treats a limit below one as one', async () => {
    let peak = 0;
    let running = 0;
    await inParallel([1, 2, 3], 0, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick(1);
      running -= 1;
    });
    expect(peak).toBe(1);
  });
});
