import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop management window (Tauri 2)', () => {
  const root = process.cwd();
  const rust = readFileSync(join(root, 'apps/mac/src-tauri/src/main.rs'), 'utf8');
  const permissions = JSON.parse(readFileSync(join(root, 'apps/mac/src-tauri/capabilities/default.json'), 'utf8')) as {
    windows: string[];
  };

  it('opens an independent, resizable workspace from the tray menu', () => {
    expect(rust).toContain('fn show_workspace(app: &AppHandle)');
    expect(rust).toContain('WebviewWindowBuilder::new(app, "workspace", WebviewUrl::External(url))');
    expect(rust).toContain('.inner_size(980.0, 720.0)');
    expect(rust).toContain('.min_inner_size(720.0, 560.0)');
    expect(rust).toContain('"workspace" => show_workspace(app)');
    expect(rust).toContain('Ouvrir mon espace…');
  });

  it('uses the local token and does not grant the remote page Tauri IPC', () => {
    expect(rust).toContain('fn workspace_url(port: u16) -> Option<Url>');
    expect(rust).toContain('let mut url = panel_url(port, &[])?;');
    expect(rust).toContain('url.set_path("/workspace");');
    expect(permissions.windows).toEqual(['panel']);
    expect(rust).toContain('window.on_window_event(move |event|');
    expect(rust).toContain('hide_on_blur.hide()');
  });
});
