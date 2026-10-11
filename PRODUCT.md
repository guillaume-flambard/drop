# Product

<!-- impeccable:product-schema 1 -->

Product reference: [docs/product/PRD.md](docs/product/PRD.md) (French, with existing, targeted and hypothesis statuses). This file is the design brief for the panel and must stay consistent with it.

## Platform

web

The menu bar panel is HTML served by the local Node at `/app` and shown in a Tauri 2 window under the macOS tray icon. Windows and Linux follow later with per-platform adaptation.

## Users

Primary user of the panel: the owner of a source, technical or not, for example a designer who works in Figma (a targeted scenario, D48). Owners without an agent answer by hand in the panel (exists, T4.3) or, later, through a built-in agent (targeted, T4.8). A colleague's agent asks a bounded question that needs this person's tools; the panel shows who asks, what will leave, and what never leaves, and the owner allows once or refuses in a few seconds. This person does not know what MCP or A2A is and must not need to.

Secondary user: the requester, a developer in a small technical team, who connects their agents, shares tools with the team and follows the questions they sent. Configuration screens may use more technical words; deciding never does.

## Product Purpose

drop lets a team's agents collaborate inside the team's own infrastructure while transmitting only authorized answers. An agent asks a bounded question, the owner of the source authorizes the run, and only the validated result returns. "Get the answer, not the access."

Success for the panel: the owner understands a request and decides correctly without reading documentation, and nothing is ever shared implicitly.

## Positioning

The owner keeps the decision on every request, and the requester gets an answer, never access to the source. Public promise (D52), always shown with its limit: drop controls what goes through drop, not the own flows of a connector or model the owner chose. Capabilities fix input, output, tools, budget and approver before any request; the LLM never decides permissions.

## Operating Context

- The panel lives in a small window under a menu bar icon; it is opened briefly, often after a notification, and closed again. In the Mac app, notifications carry the app icon and a click opens the panel (T4.14).
- Tabs: Demandes (requests to decide, results to review before sending, questions I sent), Équipe (members, online state, their shared tools, invite links), Mes outils (two-confirmation agent connection, tool sharing, linked assistants).
- Deep links `drop://pair` and `drop://link` open the panel. An invitation shows who invites and to which team, then waits for « Rejoindre » or « Refuser » (T4.14). `drop://link` is refused in the private profile.
- A separate startup page (`apps/desktop/web/index.html`) shows boot and failure states with diagnostic codes before the panel is reachable.

## Capabilities and Constraints

- Content Security Policy `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'`: no external fonts, images or scripts; everything inline.
- Text written by peers (titles, questions, names) is inserted with `textContent`, never as HTML.
- The panel talks only to its own Node's API with the bearer token from the URL.
- Decisions: `allow_once`, `deny`, `not_now`; review before send: `send`, `discard`.
- French interface; code and identifiers in English.
- Contracts: `openspec/specs/owner-app/spec.md`; tests: `packages/node/test/panel.test.ts`.

## Brand Commitments

- Name: "drop" is a code name; the product name is still undecided.
- D46 (docs/DECISIONS.md), binding: a discreet, familiar Mac panel; system typography; the existing neutral palette; green accent reserved for actions and states; keyboard navigation and VoiceOver before any decoration.
- Voice: plain French, tutoiement, short sentences, no jargon on the decision path.

## Evidence on Hand

No real customers, testimonials or usage numbers yet. Use cases in the docs (Julie on Figma, Natha with Notion, Linear, a database and GitHub) are scenarios, not customers.

## Product Principles

1. The owner decides; nothing leaves without an explicit action.
2. Show what leaves and what never leaves before asking for a decision.
3. Deciding must take seconds and need no technical vocabulary.
4. Quiet by default: the panel appears when needed and stays out of the way otherwise.
5. Peer content is untrusted data, displayed inertly.

## Accessibility & Inclusion

Full keyboard use and VoiceOver are required (D46, T3.4 manual acceptance). Status changes are announced through live regions. Light and dark appearance follow the system.
