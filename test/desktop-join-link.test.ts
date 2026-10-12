import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Rust shell is built and unit-tested by cargo (`join_and_pair_links_open_the_invite_confirmation`); this suite
// keeps the contract visible to the JavaScript gate, which also runs where no Rust toolchain is installed.
describe('desktop join link (T4.23)', () => {
  const rust = readFileSync(join(process.cwd(), 'apps/desktop/src-tauri/src/main.rs'), 'utf8');

  it('opens drop://join like drop://pair: the confirmation card, queued until the node answers', () => {
    expect(rust).toContain('matches!(url.host_str(), Some("join" | "pair" | "link"))');
    expect(rust).toContain('Some("join") => invite(param("invite"))');
    expect(rust).toContain('Some("pair") => invite(param("code"))');
    expect(rust).toContain('.map(|code| vec![("pair", code)])');
    // Only a base64url code reaches the panel, and only from a link of bounded length.
    expect(rust).toContain("b.is_ascii_alphanumeric() || b == b'-' || b == b'_'");
    expect(rust).toContain('const MAX_LINK_CHARS: usize = 4096;');
    expect(rust).toContain('if handled_link(&url) {\n                queue.push(url);');
    expect(rust).toContain('fn join_and_pair_links_open_the_invite_confirmation()');
    // The shell never reads the invite: the first launch keeps its loopback relay, the node moves on « Rejoindre ».
    expect(rust).toContain('configured.unwrap_or_else(|| DEFAULT_RELAY.to_string())');
  });
});
