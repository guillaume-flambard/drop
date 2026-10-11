import { describe, expect, it } from 'vitest';
import { irohEnvironment, irohProgramName } from '../src/iroh.ts';

describe('the drop-iroh program on each system (T4.2b, T3.7)', () => {
  it('looks for drop-iroh.exe on Windows and drop-iroh elsewhere', () => {
    expect(irohProgramName('win32')).toBe('drop-iroh.exe');
    expect(irohProgramName('darwin')).toBe('drop-iroh');
    expect(irohProgramName('linux')).toBe('drop-iroh');
  });

  it('starts it with an empty environment, keeping only SystemRoot on Windows so its sockets can start', () => {
    const env = { SystemRoot: 'C:\\Windows', DROP_RELAY: 'wss://elsewhere.example', HTTPS_PROXY: 'http://proxy' };
    expect(irohEnvironment('darwin', env)).toEqual({});
    expect(irohEnvironment('linux', env)).toEqual({});
    expect(irohEnvironment('win32', env)).toEqual({ SystemRoot: 'C:\\Windows' });
    expect(irohEnvironment('win32', { SYSTEMROOT: 'D:\\Windows' })).toEqual({ SystemRoot: 'D:\\Windows' });
    expect(irohEnvironment('win32', {})).toEqual({});
  });
});
