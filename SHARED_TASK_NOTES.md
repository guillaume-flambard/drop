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

## Relay 11 — T3.1d persistent replay-store failure wording (2026-10-13)

**Selected task:** T3.1d, one focused subtask. When `store.claimDrop()` throws due to corrupted/unavailable persistent replay state, admission correctly fails closed but currently maps the failure to the retryable `E_RATE` capacity error (`CLAIM_ERRORS.capacity`). That says "réessayez" although the owner must repair the storage. This is not an execution-capacity problem.

**Subtasks (written BEFORE implementation):**
- `DONE` — Keep replay claim failures fail-closed, but respond with existing protocol error `E_RUNNER` and stable owner-actionable wording (no retries, paths or secrets). Keep the diagnostic owner log `E_REPLAY_STATE` and preserve capacity `E_RATE` behavior.
- `DONE` — Update the existing persisted replay regression to assert the non-retryable failure and no consent; separately ensure genuine capacity refusal still returns `E_RATE`.
- `IN_PROGRESS` — Targeted regression, typecheck, lint, 65 integration tests and OpenSpec guard PASS; full suite and GitHub validation follow.
- `QUEUED` — Owner-facing persistent security alert (UI) and other T3.1d issues remain distinct. Do NOT mark all T3.1d complete.

**Safety:** No storage repair/cleanup, no new error protocol code, no personal data or production changes. Work only in isolated `fix/t3-1d-replay-failure` worktree from `origin/main`.

### Relay 11 implementation and scope

- `packages/node/src/engine.ts`: permanent anti-replay metadata corruption now fails closed with an existing `E_RUNNER` code and owner-actionable wording. The full diagnostic remains *local only* (`E_REPLAY_STATE`, stable reason), without paths or request data in the remote error.
- Intermittent write/availability errors and short-term lock contention retain `E_RATE` and can recover; genuine capacity still returns `E_RATE`.
- `packages/node/test/private-replay.test.ts`: original corruption regression converted to verify permanent error/no consent; added a transient-failure/recovery test via single injected store failure.
- `openspec/specs/node/spec.md`: two new normative AC scenarios with exact test selectors. This is **one slice** of T3.1d; owner-facing security alert remains a separate task.
- First targeted Vitest run was red (`E_RATE` vs expected `E_RUNNER`) before the code fix and green after; additional checks are running. No publication or user-data changes.

### Relay 11 verified evidence (first pass)

- **65/65 focused Vitest tests PASS**: `packages/node/test/private-replay.test.ts`, `packages/node/test/e2e.test.ts`, `packages/node/test/memory-bounds.test.ts`.
- Existing `E_RATE` capacity scenarios remain green. Added separate transient I/O failure and permanent corruption tests. 2/2 new cases pass. The first test intentionally failed on the old implementation before the fix.
- `pnpm -r lint` and `pnpm -r typecheck` PASS; `openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail` PASS against existing frozen baseline (697 AC, 534 linked, zero new unfrozen failures). `git diff --check` PASS.
- `docs/TASKS.md`: T3.1d changed from todo to **doing**, not done. Other resilience subtasks and owner UI alert are queued.
- The complete Vitest suite runs separately with SentinelX job `job_99690ba072e1`; do not claim its result before checking.
- Next: review GitHub CI and branch protection; if it is green, merge via normal queue (no bypass), then continue one remaining T3.1d subtask. Do not publish a stable release or touch private user machines.
