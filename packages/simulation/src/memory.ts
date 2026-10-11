/**
 * Resident memory of a bench process, in kilobytes (T4.1). macOS and Linux answer through `ps`; Windows has no `ps`, so
 * `tasklist` gives the working set, Windows' resident memory, in its last CSV column ("45,678 K").
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export function memoryProbe(pid: number, platform: NodeJS.Platform): { command: string; args: string[] } {
  if (platform === 'win32') return { command: 'tasklist', args: ['/FI', `PID eq ${String(pid)}`, '/FO', 'CSV', '/NH'] };
  return { command: 'ps', args: ['-o', 'rss=', '-p', String(pid)] };
}

/** Kilobytes from the probe's answer, or undefined when the process is gone. */
export function parseResidentKb(stdout: string, platform: NodeJS.Platform): number | undefined {
  let digits: string;
  if (platform === 'win32') {
    // A matching process prints one CSV row; none prints an "INFO:" line. The separator follows the locale.
    const row = stdout.split(/\r?\n/).find((line) => line.startsWith('"'));
    const column = row?.match(/"([^"]*)"\s*$/)?.[1];
    if (column === undefined) return undefined;
    digits = column.replace(/\D/g, '');
  } else {
    digits = stdout.trim();
  }
  if (!/^[0-9]+$/.test(digits)) return undefined;
  const kb = Number(digits);
  return kb > 0 ? kb : undefined;
}

export async function residentKb(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<number | undefined> {
  const { command, args } = memoryProbe(pid, platform);
  const { stdout } = await run(command, args, { windowsHide: true });
  return parseResidentKb(stdout, platform);
}
