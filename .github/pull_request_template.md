## What and why

<!-- What does this change do, and why is it needed? -->

## Linked task or issue

<!-- A task from docs/TASKS.md (for example T4.22) and its OpenSpec change, or an issue: "Fixes #123". -->

## How it was tested

<!-- Tests added or changed, commands run, manual checks. For a bug fix, the regression test. -->

## Limits and remaining work

<!-- Anything not covered, known risks, follow-ups. Write "None" if none. -->

## Checklist

- [ ] `pnpm -r lint && pnpm -r typecheck && pnpm -r test` pass locally.
- [ ] If behaviour changed: the spec under `openspec/specs/` is updated, each covered `AC:` scenario has its `<!-- openspec-guard:test="..." -->` marker, and openspec-guard passes.
- [ ] Docs are updated where needed (README, guide, task index, decisions).
- [ ] No secret, key, real configuration, conversation or personal data in the diff, fixtures or screenshots.
- [ ] The security rules in CONTRIBUTING.md still hold (peer input is data, tools fixed by the capability, allowlist reads, validated and scanned output).
- [ ] Commits follow the repository convention (`T4.3: ...`, or `fix:` / `docs:` for small changes).

Vulnerabilities are reported privately, as described in SECURITY.md, never in a pull request.
