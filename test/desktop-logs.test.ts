// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInThisContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The Rust shell is built and unit-tested by cargo (`redact_stray_masks_secrets_and_keeps_paths`,
// `append_capped_keeps_one_previous_file`); this suite keeps the contract visible to the JavaScript gate, which also
// runs where no Rust toolchain is installed.
const root = process.cwd();
const rust = readFileSync(join(root, 'apps/desktop/src-tauri/src/main.rs'), 'utf8');
const page = readFileSync(join(root, 'apps/desktop/web/index.html'), 'utf8');

describe('desktop logs (T4.37)', () => {
  it('keeps daemon.log: the shell never empties it, hands the node its log and redacts what it writes', () => {
    // No File::create anywhere near the logs: the daemon log is opened to append, in the logs folder.
    expect(rust).not.toMatch(/File::create\([^)]*log/);
    expect(rust).toContain('fn logs_dir() -> PathBuf');
    expect(rust).toContain('drop_home().join("logs")');
    expect(rust).toContain('.env("DROP_LOG", "file")');
    expect(rust).toContain('.env("DROP_APP_VERSION", app.package_info().version.to_string())');
    expect(rust).toContain('command.stderr(Stdio::piped())');
    // What the daemon writes outside its own journal goes through the shell's redaction, as JSON, into the same file.
    expect(rust).toContain('fn capture_stderr(');
    expect(rust).toContain('"event": "daemon_stderr"');
    expect(rust).toContain('fn redact_stray(line: &str, token: Option<&str>) -> String');
    // The app's own errors: redacted, in logs/app.log, one previous file past 1 MiB.
    expect(rust).toContain('const APP_LOG_MAX_BYTES: u64 = 1024 * 1024;');
    expect(rust).toContain('fn append_capped(path: &Path, line: &str, cap: u64)');
    expect(rust).toMatch(/fn log_error\(code: &str, detail: &str\) \{[\s\S]*?redact_stray\(detail/);
    expect(rust).toContain('fn redact_stray_masks_secrets_and_keeps_paths()');
    expect(rust).toContain('fn append_capped_keeps_one_previous_file()');
  });

  it('gives the log path on the start page, as text, with the folder to open', async () => {
    // The shell sends the path along with the failure code, and offers the folder through its own command.
    expect(rust).toContain('.append_pair("log", &logs_dir().join("daemon.log").to_string_lossy())');
    expect(rust).toContain('tauri::generate_handler![retry_daemon, open_logs]');
    expect(rust).toContain('fn open_logs()');
    // The page itself: run its script in a document, as the panel window would.
    document.documentElement.innerHTML = page.replace(/<script>[\s\S]*<\/script>/, '');
    window.history.replaceState(
      null,
      '',
      '/index.html?state=E_RESTART&log=' + encodeURIComponent('/Users/camille/.drop/logs/<i>daemon</i>.log'),
    );
    const invoked: string[] = [];
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (command: string) => {
        invoked.push(command);
        return Promise.resolve();
      },
    };
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          copied.push(value);
          return Promise.resolve();
        },
      },
    });
    // The page's own script, run against this document's globals.
    runInThisContext(/<script>([\s\S]*)<\/script>/.exec(page)?.[1] ?? '');
    const box = document.getElementById('log-box');
    const path = document.getElementById('log-path');
    expect(box?.hidden).toBe(false);
    expect(path?.textContent).toBe('/Users/camille/.drop/logs/<i>daemon</i>.log');
    expect(path?.querySelector('i')).toBeNull();
    expect(document.body.textContent).toContain('Code de diagnostic : E_RESTART.');
    document.getElementById('open-logs')?.click();
    document.getElementById('copy-log')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invoked).toEqual(['open_logs']);
    expect(copied).toEqual(['/Users/camille/.drop/logs/<i>daemon</i>.log']);
    // While starting, without a failure, the path stays hidden.
    expect(page).toContain('<div id="log-box" hidden>');
    expect(page).not.toContain('innerHTML');
  });
});
