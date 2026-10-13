# Drop — product and implementation index

We are building **Drop**, a local-first, cross-platform app connecting people and their AI agents. A requesting agent can ask a bounded question of another agent's environment; the owner explicitly authorizes what is shared, and the requester receives the answer rather than broad access.

**This is an index, not a new normative specification or backlog.** The existing repository sources remain authoritative:

- `openspec/project/vision.md` — purpose, positioning and product principles.
- `openspec/project/architecture.md` and `docs/ARCHITECTURE.md` — design and module boundaries.
- `openspec/specs/` — normative SHALL/MUST contracts and acceptance scenarios.
- `docs/TASKS.md` — canonical priority, dependencies, scope and status of work items.
- `docs/ACCEPTANCE.md` — cross-cutting acceptance criteria and evidence required.
- `docs/DECISIONS.md` — decisions and technical constraints.
- `docs/product/` — human interface and product direction.
- `AGENTS.md` — engineering, review, security and OpenSpec workflow.
- `SHARED_TASK_NOTES.md` — ephemeral relay log of what was done and what remains for the next developer.

## Current milestone

Private beta across macOS, Windows and Linux: signed, installable builds; simple HTTPS team invitations; protected local permissions; trustworthy updates, resilient networking and reproducible proof on actual machines. Passing CI does **not** substitute for real-device acceptance. Keep stable releases unpublished until `docs/ACCEPTANCE.md` and release-gate issue #87 are met.

## One-task relay contract

1. Inspect `SHARED_TASK_NOTES.md`, `AGENTS.md`, canonical task index and relevant OpenSpec contract.
2. Pick **one** eligible, not-claimed task, following the task-index priority and dependency order.
3. If too large, write its subtasks into the handoff before coding. Implement **only the first** focused piece.
4. Run focused tests, lint/typecheck/build where applicable, and verify actual behavior. Never label a hardware or third-party approval check as passed without evidence.
5. Update `SHARED_TASK_NOTES.md` with exact evidence, decisions, blockers and the next baton.
6. Leave edits isolated; do not commit, push, merge or deploy unless explicitly requested for that cycle.
