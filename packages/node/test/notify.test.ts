import { afterEach, describe, expect, it, vi } from 'vitest';

const execFile = vi.fn();
vi.mock('node:child_process', () => ({ execFile }));
vi.mock('node:os', () => ({ platform: () => 'darwin' }));

afterEach(() => {
  execFile.mockReset();
  delete process.env.DROP_NOTIFY;
});

describe('notifications (T4.1)', () => {
  it('AC stays silent when DROP_NOTIFY is off, even on macOS', async () => {
    const { notify } = await import('../src/notify.ts');
    process.env.DROP_NOTIFY = 'off';
    notify('Julie a besoin d’aide', 'Résumer les erreurs de production');
    expect(execFile).not.toHaveBeenCalled();
    delete process.env.DROP_NOTIFY;
    notify('Julie a besoin d’aide', 'Résumer les erreurs de production');
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile.mock.calls[0]?.[0]).toBe('osascript');
  });
});
