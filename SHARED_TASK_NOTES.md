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

## Relay 12 — T3.1d local owner alert for observed replay corruption (2026-10-13)

**Selected focused slice:** When the private anti-replay metadata is persistently corrupt, the owner should see a clear warning in the local workspace. The requester already gets an `E_RUNNER` refusal in PR #103; no further remote detail should leak.

**Breakdown written BEFORE code changes:**
- `DONE` — Track a boolean replay-security block in the running NodeEngine only for the known persistent replay-state corruption reasons. Clear after a successful durable claim. Emit change only on actual transition.
- `DONE` — Expose the flag only through the already authenticated owner `/ui/admin/status`, and render a concise accessible warning in the overview with a link to Diagnostic. Refresh owner status on existing engine change events.
- `DONE` — Test persistent versus transient failure, recovery, HTTP authentication and workspace rendering; focused tests, lint/typecheck and OpenSpec guard PASS. Expanded UI regressions passed (44/44); GitHub PR #104 is awaiting required CI.
- `QUEUED` — After a daemon restart the in-memory flag is unknown until a new claim. A startup read-only integrity probe/persistent detection is a separate future task. Do not change private replay storage layout or automatically repair it here.

**Dependencies / safety:** This worktree is stacked on PR #103 head (`65729c9`), because the persistent/transient classification lives there. No production mutation, no credentials, no platform installations. The owner-only alert must never expose requester IDs, paths, exception messages or tokens.

### Relay 12 implementation and handoff (initial)

- `NodeEngine.replayStorageAlert()` exposes a **boolean only**, true after durable replay corruption is observed. Stable `E_REPLAY_STATE` diagnostics remain in local log only. One `change` event for first failure; subsequent corrupt requests do not repeatedly alert. A successful durable claim clears the indicator.
- Authenticated `/ui/admin/status` includes `security.replayStorageBlocked`; there is no new public endpoint. Desktop workspace overview shows an accessible warning with a link to the existing Diagnostic page, and SSE-driven status refresh discovers it without restarting the window.
- Regression tests cover persistent failure, repeated failure, recovery, transient no-alert, owner status authorization and UI rendering/navigation. The first targeted set (28 selected tests across 3 files) passed. CI/lint/typing and full suite evidence must be updated below before delivery.
- This flag is **not yet restored at daemon startup** without receiving a new request. To achieve proactive startup detection, build a separate read-only durable integrity probe (not an automatic repair). Do not claim persisted warning support yet.
- PR #103 was checked: all 11 PR checks PASS, no unresolved threads, and the PR is already **position 1 in GitHub merge queue**. It is not merged yet. This relay branch is based on PR #103 commit to avoid duplicating that work.

### Relay 12 verification and next baton

- 28 focused tests passed across `private-replay`, local authenticated `diagnostic` HTTP, and owner workspace rendering. Added a regression for repeated corruption and successful recovery, and no warning on transient replay I/O errors.
- `pnpm -r lint` **PASS**; `pnpm -r typecheck` **PASS**; `git diff --check` **PASS**.
- `openspec-guard@0.3.0` **PASS**, 698 criteria, 535 test-linked, existing 139 failures frozen in baseline (no new unfrozen failure). One new normative AC with exact selector.
- GitHub PR #103 merged at `f7e200c`; the owner alert branch contains only the follow-up change relative to that commit. **Do not** mark T3.1d `done`: remaining resilience subtasks exist.
- Expanded four-file regression job `job_42ffc8508442` **succeeded**: 44/44 tests PASS (35 replay, 5 diagnostics, 3 existing workspace, 1 new UI alert).
- **Limitation to hand off:** owner alert is an in-process observed condition. After a daemon restart, before receiving another invalid request, the flag is unknown; a read-only startup anti-replay integrity probe is future work. No destructive automatic repair of security state.

### Relay 12 GitHub handoff

- PR #103 has MERGED at `f7e200c`; this branch adds only the owner alert.
- PR #104: https://github.com/memolabs-dev/drop/pull/104 — OPEN with normal GitHub auto-merge enabled, Ubuntu/macOS/Windows/CodeQL checks pending at last check. No bypass of merge queue or protected checks.
- **Next single task:** Proactively detect pre-existing persistent replay corruption at daemon startup via a *read-only* integrity validation, without mutating or resetting replay state. Begin by designing deterministic tests for healthy, old and corrupt stores; do not silently reset keys/markers.
- Existing private beta installers do not include this new code until the normal signed release pipeline is run. No physical device claims, deploy, or stable publication in this relay.

## Relay 13 — T3.1d read-only startup anti-replay integrity inspection (2026-10-13)

**Selected task:** Detect already-corrupted durable replay metadata when Drop starts, rather than waiting for an incoming request. The existing owner-only boolean/status/UI alert is in PR #104; this is a dependent one-slice follow-up.

**Subtasks recorded BEFORE implementation:**
- `DONE`: Add a synchronous, read-only `DropHome.inspectReplayStore()` classifier with results healthy, fresh/legacy, deferred (lock or migration), persistent corruption. Reuse the exact stored digest semantics from `claimDropLocked`, validate persisted versions/clocks/directory and live markers. No lock acquisition, migration, marker creation, delete, clock advance or auto-repair.
- `DONE`: Seed NodeEngine's already-existing owner-only alert on startup when inspection returns persistent corruption; write only a stable non-sensitive diagnostic code. Avoid claiming corruption when another process holds the replay lock or interrupted initial migration is resumable.
- `DONE`: Six new tests cover healthy/new/legacy/corrupt/missing metadata, digest mismatch, foreign lock, interrupted migration, unchanged disk contents and authenticated daemon status before requests; 6/6 PASS, lint/typecheck/OpenSpec guard PASS.
- `QUEUED`: A future task can improve diagnosis of transient read failures and build a guided *manual* repair flow after backup; do not change storage to self-heal or falsely mark T3.1d fully done.

**Dependency:** This branch starts at `feat/t3-1d-owner-replay-alert` (PR #104 pending). No stable release, no installation, no production service changes. Do not bypass GitHub merge checks. If parent merges, retarget the PR to main after verifying diff contains only this slice.

### Relay 13 initial evidence and limitations

- `DropHome.inspectReplayStore()` is strictly read-only: validates version, clock, marker directory, each UUID marker type, and the original floored-digest semantics shared with admission. It does not acquire a lock, write any replay file, migrate or reset persisted data.
- Returns `uninitialized` for never-admitted and legacy metadata-free states, `deferred` for a concurrent lock, a resumable first-migration journal or an I/O exception, and `corrupt` only for durable metadata integrity mismatches. These statuses never lower runtime admission's existing fail-closed controls.
- `startDaemon` calls it before starting connectivity and seeds only `NodeEngine`'s owner-only in-memory warning; owner log receives a fixed `replay_startup_corrupt` / `E_REPLAY_STATE`, no filenames or private fields. UI + authenticated local API contract inherited from PR #104.
- `packages/node/test/replay-startup.test.ts`: 6/6 PASS, including verification the snapshot of each replay metadata file and marker directory remains bit-for-bit identical after probing, plus HTTP 401 without the local owner token and a blocked status visible with it.
- `openspec/specs/node/spec.md` has a new normative startup scenario tied to its integration test.
- Limitation: an undetectably concurrent mutation, a foreign lock, or an unreadable backing store yields `deferred`, not a false corruption notice. Runtime claims still enforce the original fail-closed path. Startup probe only reports an observed persistent integrity mismatch; it is not a general repair or filesystem-health service.

### Relay 13 verification and handoff

- `packages/node/src/home.ts`: added read-only startup `inspectReplayStore` matching the existing replay high-water/marker digest rules. It distinguishes `healthy`, `uninitialized`, `deferred` (foreign replay lock, resumable migration or unreadable data), and `corrupt` (durable metadata inconsistency). A second lock check prevents claiming corruption if another process acquires the lock during inspection.
- `packages/node/src/daemon.ts` invokes the probe before accepting traffic, emits only stable `replay_startup_corrupt / E_REPLAY_STATE` local log metadata, seeds the owner-only flag on NodeEngine and leaves all persisted files untouched.
- `packages/node/test/replay-startup.test.ts`: **6/6 PASS** proving freshly initialized, healthy v2, compatible legacy v1, corrupt clock/version/integrity/missing marker directory, locked store, resumable migration, absence of replay writes, and authenticated HTTP owner status showing the alert before a new request.
- `pnpm -r lint`: PASS; `pnpm -r typecheck`: PASS; `openspec-guard@0.3.0`: PASS (699 criteria, 536 linked, no new unfrozen failures). `git diff --check`: PASS.
- Expanded integration suite in SentinelX job `job_85c34ffde773` **PASS: 47/47 tests across 4 files** (6 startup, 35 replay, 5 diagnostics, 1 owner alert UI).
- **No automatic recovery**. The startup probe can report no proven corruption even when some I/O is temporarily unavailable: in that case runtime admission still fails closed. If process dies or restarts, the next startup probe reevaluates disk state. This is a status signal, never an admission authorization.
- Dependency: PR #104 is still OPEN with 11 passing required checks, but was not in merge queue at last check. This follow-up branch is based on PR #104; until #104 merges, use a stacked PR into `feat/t3-1d-owner-replay-alert` and retarget to main after the parent merges. Preserve normal GitHub checks.
- **Next baton:** address only remaining T3.1d durable revocation and retry semantics, or a narrowly scoped follow-up to classify I/O diagnostics. Physical beta testing and Windows signing remain separate, blocked until the owner has devices or a provider.

## Relay 14 — unblock PR #104 CodeQL review (2026-10-13)

**Selected one focused task:** GitHub reports PR #104 has 11 passing checks but is BLOCKED from the merge queue by an unresolved CodeQL "File data in outbound network request" thread at `packages/node/test/diagnostic.test.ts:160` (alert #91). The test's HTTP authorization token is currently read from the private temporary home via `home.localToken()`. This is test-only, but CodeQL correctly traces a file-derived secret into a network call.

**Breakdown recorded before implementation:**
- `DONE` — Use a test-owned, non-secret fixture token generated as a constant in the test process and explicitly write it to the throwaway home *before* starting its daemon. Send only the test-owned value to loopback; avoid fetching a disk-derived secret into the request.
- `DONE` — Diagnostic / owner UI tests 6/6 PASS; monorepo lint and typecheck PASS. Publish a PR #104 branch update for hosted CodeQL review.
- `NEXT` — Only after hosted CodeQL confirms the finding no longer applies, resolve the corresponding review thread with evidence; enqueue through GitHub merge queue. Do not blindly dismiss security findings.
- `QUEUED` — Retarget dependent PR #105 to main after PR #104 is merged, then rerun Windows/macOS/Linux required checks.

**Safety:** No real local token is read or disclosed, no CI/security checker disabled, no release/deployment. Changes confined to a throwaway test fixture and this handoff log.

### Relay 14 local verification

- `packages/node/test/diagnostic.test.ts` now supplies an intentionally non-secret, predetermined test token *before* the daemon reads the throwaway home's token file. The HTTP request header is constructed from the test fixture variable, **not from `home.localToken()`** or another file read. Nothing changes in real daemon authentication.
- `pnpm exec vitest run packages/node/test/diagnostic.test.ts packages/desktop-ui/test/replay-security-alert.test.tsx`: **6/6 PASS**.
- `pnpm -r lint`, `pnpm -r typecheck`, `git diff --check`: PASS.
- Remaining action: publish to PR #104, rerun hosted CodeQL; inspect alert #91 and resolve its thread only with evidence the issue no longer applies. Then enqueue normally.
