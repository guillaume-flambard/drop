import { execFile } from 'node:child_process';
import { platform } from 'node:os';

/**
 * macOS notification through osascript. Peer-provided text is passed as argv, never interpolated into the script,
 * and the local token never goes into it. Linux: no notification, `drop pending` is the fallback.
 */
export function notify(title: string, subtitle: string): void {
  if (platform() !== 'darwin') return;
  const script = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv)', 'end run'].join(
    '\n',
  );
  execFile('osascript', ['-e', script, title, subtitle], () => {
    // Best effort: the local UI and `drop pending` still show the request.
  });
}
