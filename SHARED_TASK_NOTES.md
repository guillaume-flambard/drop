# Drop — continuous agent handoff

This file is a **brief baton**, not a second backlog. For task priorities and dependencies use `docs/TASKS.md`, normative behavior `openspec/specs/`, code conventions `AGENTS.md`. Update this summary after each focused independently verified task, without manufacturing a completion status.

## Snapshot — 2026-10-13, beta consolidation

- **Current release**: private draft `v0.1.0-ci.36` with macOS ARM64/Intel DMG, Windows x64 EXE, Linux ARM64/x64 AppImage. Nothing has been published as stable; `DROP_RELEASE_AUTO_PUBLISH=false`.
- **Physical acceptance**: `BLOCKED` until the owner tests actual devices. The checklist is `docs/essais/recette-beta-multios.md`. Do not declare Windows/Linux validated from GitHub CI alone. Windows Authenticode awaits external signing provider (#93).
- **PR #91 (restart smoke)**: code review/hardening updated; tests verify only loopback destination and cryptographically unpredictable health marker before sending generated local authorization. CodeQL threads triaged. `NEXT`: require final hosted macOS/Windows/Linux checks, then merge queue; do not bypass branch protection.
- **PR #98 (T3.1d protocol)**: consolidated UUID case normalization across drop follow-up messages + authenticated-only `E_SCHEMA` reply for invalid requests. Local 76 tests, lint/typecheck PASS. `NEXT`: GitHub CI + merge queue. T3.1d remains open for separate resilience subtasks.
- **PR #99 (T4.28 CI)**: safe Git diff path classification + step-level optimization retaining required `test`, `test-windows`, `test-macos` checks. `merge_group` always full. Local 13 new tests and full 811-test suite passed before PR. `NEXT`: GitHub CI/merge queue and *actual docs-only canary* before marking T4.28 fully done.
- **PR #100 (T4.31 deep links)**: reject duplicate `invite` and `code` query keys. Local 16 Rust + 3 TypeScript tests PASS. `NEXT`: hosted CI/merge queue. Physical Windows/Linux deep-link tests separate.
- **PR #97**: merged; independent private beta portal acceptance check; HTTPS production `/join` and private installer checks previously verified.

## Known constraints

1. No source branch above changes already-built beta draft installers until merged and a new draft build is made.
2. Signed receipts must not be silently rewritten for UUID-case normalization; signatures cover their original canonical payload.
3. PR review security findings must be investigated; do not dismiss findings en masse or weaken CodeQL.
4. Production VPS, real testers' machines, identities, passwords, invitation fragments and signing keys are out of scope for autonomous test cycles.
5. Local relay notes from previous sessions are retained in isolated worktrees; this file records the GitHub-delivered checkpoint, not every terminal command.

## Next developer — exact baton

Check actual statuses of PRs 91, 98, 99, 100, before starting new code. If they passed merge queue, verify main, then run a docs-only CI canary to prove required job contexts remain green. Update canonical `docs/TASKS.md` only when evidence supports done. If pending/failed, take one focused failure at a time; if no blocker is actionable, continue one T3.1d resilience subtask. No public release or physical installation without explicit owner consent.
