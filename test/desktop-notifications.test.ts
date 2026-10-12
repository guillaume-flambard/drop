import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Rust shell is unit-tested by cargo (`notification_actions_only_view_or_deny_never_allow`,
// `deny_goes_to_the_node_refusal_route_and_reads_its_stable_codes`); this suite keeps the contract visible to the
// JavaScript gate, which also runs where no Rust toolchain is installed.
const shell = join(process.cwd(), 'apps/desktop/src-tauri');
const notifications = readFileSync(join(shell, 'src/notifications.rs'), 'utf8');
const main = readFileSync(join(shell, 'src/main.rs'), 'utf8');
const cargo = readFileSync(join(shell, 'Cargo.toml'), 'utf8');
/** The shell's notification code itself: no comment, no unit test. */
const code = notifications
  .slice(0, notifications.indexOf('#[cfg(test)]'))
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

describe('desktop notification actions (T4.30)', () => {
  it('offers Voir and Refuser only on a request notification, never Autoriser, without breaking through Focus', () => {
    // One category, two actions: « Voir » brings the app forward, « Refuser » is marked destructive.
    expect(notifications.match(/actionWithIdentifier_title_options\(/g)).toHaveLength(2);
    expect(notifications).toContain(
      '&NSString::from_str("Voir"),\n                UNNotificationActionOptions::Foreground,',
    );
    expect(notifications).toContain(
      '&NSString::from_str("Refuser"),\n                // From a locked Mac, the session must be unlocked first.\n                UNNotificationActionOptions::Destructive\n                    | UNNotificationActionOptions::AuthenticationRequired,',
    );
    expect(notifications).toContain('&NSArray::from_retained_slice(&[view, deny])');
    // The only things an action can become.
    expect(notifications).toContain('pub enum NotificationAction {\n    /// « Voir »');
    expect(code).not.toMatch(/Autoriser|allow_once|Allow|"allow/);
    expect(notifications).toContain('fn notification_actions_only_view_or_deny_never_allow()');
    // Only a decision carries the actions; the default interruption level, never time-sensitive nor critical.
    expect(notifications).toContain('if let Some((RequestKind::Approval, _)) = &notice.request {');
    expect(notifications).toContain('content.setInterruptionLevel(UNNotificationInterruptionLevel::Active);');
    expect(code).not.toMatch(/TimeSensitive|Critical/);
    // The documented framework, not the deprecated NSUserNotification.
    expect(cargo).toContain('objc2-user-notifications');
    expect(cargo).not.toContain('mac-notification-sys =');
  });

  it('sends Refuser to the node refusal route with the drop identifier only, and opens the card for Voir', () => {
    expect(notifications).toContain('"POST /ui/notification/deny HTTP/1.1');
    expect(notifications).toContain('serde_json::json!({ "dropId": drop_id })');
    expect(notifications).toContain('fn deny_goes_to_the_node_refusal_route_and_reads_its_stable_codes()');
    expect(main).toContain('panel_url(port, &[("request", drop_id.to_string())])');
    // A loaded panel only gets the fragment: nothing reloads, a draft answer survives.
    expect(main).toContain('Some(script) if loaded => {\n                let _ = window.eval(&script);');
    // The dispatch and what follows a refusal are pure and unit-tested by cargo.
    expect(main).toContain('match notifications::step_for(action, request) {');
    expect(main).toContain('let (code, open) = notifications::after_deny(&outcome);');
    expect(notifications).toContain('fn notification_steps_open_the_card_or_refuse_through_the_node()');
  });

  it('keeps the panel that shows requests out of screen sharing', () => {
    const panel = main.slice(main.indexOf('fn build_panel('), main.indexOf('fn main()'));
    expect(panel).toContain('.content_protected(true)');
  });
});
