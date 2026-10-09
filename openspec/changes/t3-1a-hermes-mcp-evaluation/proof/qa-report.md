## Exploratory QA and Verification Results

### Browser results

| Field | Value |
|---|---|
| Date / branch / revision | 2026-10-09 / `codex/t3-1a-hermes-evaluation` / `6282624` plus working-tree T3.1a changes |
| Target / scope | Local preview `http://127.0.0.1:4173`; page `avancement.html`, its Hermes download, expected private-route denial |
| Driver / probe budget | gstack headless Chromium; 5 minutes, 9 guarded probes in the run |
| Screenshots | 1: [avancement.png](browser/screenshots/avancement.png) |
| Framework | Static HTML/CSS served by the local Node preview |

**Provisional browser health: 100/100 over partial coverage.** Console, visible-link resolution, one desktop visual inspection, and the Hermes download route were checked. Responsive behavior, full accessibility, performance, and the rest of the site were not scored.

| Category | Score | Evidence |
|---|---:|---|
| Console | 100 | No errors on the page or successful document GET. The deliberately probed private route returned an expected 404 and its expected browser console message. |
| Links | 100 | The Hermes link resolves to the local download route; visible links resolved to local destinations. |
| Visual | 100 | One 1280px viewport screenshot shows the page layout and readable heading/content. |
| Functional | 100 | `/downloads/HERMES.md` returned HTTP 200 and `text/markdown; charset=utf-8`; document content was displayed. |
| UX | Not scored | No full journey or interaction usability assessment. |
| Performance | Not scored | No timing budget was specified for the preview. |
| Accessibility | Not scored | No automated accessibility audit or keyboard journey was run. |
| Content | Not scored | The Hermes document was inspected for route/content presence only. |

No product defect reproduced. `/downloads/DECISIONS.md` returned the expected 404 because it is not on the public asset allowlist; this is covered by the current `test/site.test.ts` contract. That negative probe preceded the clean, valid checkpoint chain and is disclosed as a separate observation.

#### Checkpoints

- [checkpoint 006](browser/exploration-006.json) — successful clean load, accessibility snapshot and console check for the progress page.
- [checkpoint 007](browser/exploration-007.json) — the expected Hermes download href and local link destinations; this checkpoint preceded the final GET.

Checkpoints 001 through 005 contain summarized observations rather than exact command output. They are retained as history but excluded from current evidence. The final GET returned 200 with the Hermes recipe and the browser reported no console errors. The response MIME type was separately confirmed from the local preview with an HTTP HEAD request.

### Functional outcomes

Functional-only contracts are not applicable to this browser exploration. The HTTP download behavior above is scored separately as a browser contract. No tests were run in this report-only review.

### Coverage limits and cleanup

The review preview ran on loopback; no external navigation or mutations were performed. The screenshot and checkpoints are under this report directory. The gstack browser remains open to the local preview. Earlier invalid checkpoints are excluded rather than rewritten. Source, tests, and Git history were not modified by this QA pass.
