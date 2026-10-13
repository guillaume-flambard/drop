import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { RelayClient } from '../src/client.ts';

// T4.20 / node spec: « Délais bornés ». Check the actual retry scheduler
// without requiring a relay outage or waiting 30 seconds in CI.
describe('relay retry delays (T4.20)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('doubles from one second and never exceeds thirty seconds', async () => {
    vi.useFakeTimers();
    const identity = await generateIdentity('Backoff');
    const relay = new RelayClient({ identity, url: 'ws://127.0.0.1:1/v1', onEnvelope: () => {} });
    const opened = vi.fn();
    (relay as unknown as { open: () => void }).open = opened;
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];
    for (const delay of delays) {
      (relay as unknown as { scheduleReconnect(): void }).scheduleReconnect();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(opened).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveBeenCalledTimes(1);
      opened.mockClear();
    }
    relay.close();
  });
});
