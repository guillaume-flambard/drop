import { execFile } from 'node:child_process';
import { platform } from 'node:os';

let shellPipeGuarded = false;

/**
 * macOS notification through osascript. Peer-provided text is passed as argv, never interpolated into the script,
 * and the local token never goes into it. Linux: no notification, `drop pending` is the fallback.
 * DROP_NOTIFY=off silences it: the simulation bench (T4.1) runs dozens of nodes on the owner's own Mac.
 * DROP_NOTIFY=shell hands it to the Mac app instead (T4.14): one JSON line on stdout, which the app shows under its
 * own identity and icon, and whose click opens the panel. Peer text stays a JSON string value, never code.
 * With `request` (T4.30), the line also names the drop and its kind, so the app's « Voir » opens that card and its
 * « Refuser » refuses that request through the Node; osascript, which offers no action, never receives it.
 */
export function notify(
  title: string,
  subtitle: string,
  request?: { dropId: string; kind: 'approval' | 'review' },
): void {
  if (process.env.DROP_NOTIFY === 'off') return;
  if (process.env.DROP_NOTIFY === 'shell') {
    // If the app closes the pipe, losing a notification must not crash the daemon (EPIPE).
    if (!shellPipeGuarded) {
      shellPipeGuarded = true;
      process.stdout.on('error', () => undefined);
    }
    process.stdout.write(`${JSON.stringify({ dropNotify: { title, subtitle, ...request } })}\n`);
    return;
  }
  if (platform() !== 'darwin') return;
  const script = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv)', 'end run'].join(
    '\n',
  );
  execFile('osascript', ['-e', script, title, subtitle], () => {
    // Best effort: the local UI and `drop pending` still show the request.
  });
}
