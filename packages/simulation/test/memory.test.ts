import { describe, expect, it } from 'vitest';
import { memoryProbe, parseResidentKb, residentKb } from '../src/memory.ts';

describe('resident memory of a bench process (T4.1, T3.7)', () => {
  it('asks ps on macOS and Linux and tasklist on Windows, which has no ps', () => {
    expect(memoryProbe(42, 'darwin')).toEqual({ command: 'ps', args: ['-o', 'rss=', '-p', '42'] });
    expect(memoryProbe(42, 'linux')).toEqual({ command: 'ps', args: ['-o', 'rss=', '-p', '42'] });
    expect(memoryProbe(42, 'win32')).toEqual({
      command: 'tasklist',
      args: ['/FI', 'PID eq 42', '/FO', 'CSV', '/NH'],
    });
  });

  it('reads kilobytes from either answer, whatever the thousands separator, and nothing from a missing process', () => {
    expect(parseResidentKb(' 45678\n', 'darwin')).toBe(45678);
    expect(parseResidentKb('', 'linux')).toBeUndefined();
    expect(parseResidentKb('"node.exe","42","Console","1","45,678 K"\r\n', 'win32')).toBe(45678);
    expect(parseResidentKb('"node.exe","42","Console","1","45.678 K"\r\n', 'win32')).toBe(45678);
    expect(parseResidentKb('"node.exe","42","Console","1","45 678 Ko"\r\n', 'win32')).toBe(45678);
    expect(parseResidentKb('INFO: No tasks are running which match the specified criteria.\r\n', 'win32')).toBe(
      undefined,
    );
  });

  it('measures this very process on the system running the tests', async () => {
    expect(await residentKb(process.pid)).toBeGreaterThan(0);
  });
});
