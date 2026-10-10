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

describe('notifications (T4.14)', () => {
  it('AC hands the notification to the Mac app as one JSON line in shell mode', async () => {
    const { notify } = await import('../src/notify.ts');
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });
    process.env.DROP_NOTIFY = 'shell';
    try {
      notify('Julie a besoin d’aide', 'Résumer les erreurs de production');
    } finally {
      spy.mockRestore();
    }
    expect(execFile).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.endsWith('\n')).toBe(true);
    expect(JSON.parse(writes[0] ?? '')).toEqual({
      dropNotify: { title: 'Julie a besoin d’aide', subtitle: 'Résumer les erreurs de production' },
    });
  });
});
