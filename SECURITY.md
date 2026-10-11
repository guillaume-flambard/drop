# Security policy

drop is a consent layer: its job is to make sure only an approved answer leaves the owner's machine. Security reports are the most useful contribution you can make. Thank you for taking the time.

drop is an early prototype. It has no stable release and has had no independent security audit. Read [the progress report](docs/AVANCEMENT.md) (in French) before you evaluate it.

## Supported versions

| Version                               | Supported |
| ------------------------------------- | --------- |
| `main`                                | Yes       |
| Any older commit, fork or local build | No        |

There is no tagged release yet and the project is pre-1.0. Fixes land on `main` only.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.**

Use GitHub private vulnerability reporting: **[open a private report](https://github.com/guillaume-flambard/drop/security/advisories/new)** (also reachable from the repository's **Security** tab, **Report a vulnerability**). Only you and the maintainer see it. The project publishes no email address for security.

Please include:

- the commit you tested and the component;
- preconditions and reproducible steps, using synthetic fixtures;
- the impact you observed or expect, and any mitigation you know of.

Redact logs. Do not attach real keys, real configurations or anyone's data. If more sensitive evidence is needed, we will agree on how to share it in the private report.

## Scope

In scope, anything in this repository, in particular:

- `packages/protocol`: identities, signatures, encryption, message schemas, anti-replay, receipts;
- `packages/relay`: admission, routing, revocation, policy checks;
- `packages/node`: CLI, local API and panel, consent, review, agent detection and installation, enterprise policy;
- `packages/runner`: execution pipeline, budgets, output validation, secret scanner;
- `packages/capabilities`: `production.error_summary`, `repo.answer`, `mcp.answer`, `a2a.answer`;
- `packages/requester-mcp`: the requester's MCP server;
- `apps/desktop`: the Tauri menu bar app, deep links (`drop://`), the embedded runtime and update path;
- `crates/drop-iroh`, `packages/a2a`, the relay Docker image and the Helm chart in `deploy/helm`.

Typical questions worth testing: can a peer's request act as an instruction to the model? Can a request widen the tools a capability allows? Can a file outside the allowlist be read? Can unvalidated output, or a secret, reach the requester? Can a request run without the owner's decision, or be replayed? Can a node reach a network destination the private profile does not allow?

Out of scope:

- infrastructure you do not own, including the maintainer's site and relay at `drop.memolabs.dev`. Test locally; never test against a third party without their permission;
- the own data flows of a model, MCP connector or A2A agent that an owner chooses (drop's stated limit, see below), unless drop sends them more than the capability allows;
- vulnerabilities in dependencies with no drop-specific impact: report them upstream;
- volumetric denial of service and social engineering.

## What to expect

This is a one-person project, so there is no service-level agreement.

- We aim to acknowledge your report within a week.
- We reproduce, assess severity, and keep you updated in the private report.
- We prepare a fix on `main` and agree with you on disclosure timing. With your permission, we credit you in the published advisory.

## Known limits of the security model

These limits are documented, not bugs. Reports that show they are worse than described are welcome.

- **drop controls what goes through drop.** A connector or a model the owner chooses can have its own data flows, which drop does not see.
- **Encryption and the secret scanner are not proof that nothing leaks.** The scanner only recognizes known secret patterns.
- **A delivered answer cannot be recalled.**
- **The catalog reveals who knows what**, and several partial answers can add up to more than each one.
- **Approval can become a reflex.** The consent card shows what leaves, but the owner still decides.
- **A paired peer can present a misleading request** (requester name, purpose). Only the actual recipient of the answer is guaranteed.
- **A relay or a network observer sees who talks to whom**, though not the content.
- **The anti-replay hardening (T3.1b, T3.1c) still waits for its formal review**, and the private profile has not yet been proven end to end with the internet blocked (T3.5).

The decision log ([docs/DECISIONS.md](docs/DECISIONS.md), in French) records the accepted limits of each change.
