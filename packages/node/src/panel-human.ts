/** Drop Human V2 — the shared, offline-first surface treatment of the local /app panel.
 * No remote assets or fonts: this string is injected into the same CSP-restricted page.
 * The existing DOM and consent handlers stay authoritative; this is progressive enhancement.
 */
export const humanPanelStyles = `
/* Human V2 · Warm, quiet, native. Context and consent before decoration. */
:root {
  --ground: #fbfaf8;
  --well: #f5f2f3;
  --card: #fffefd;
  --ink: #292732;
  --soft: #5e5965;
  --mute: #716c78;
  --line: #eae5e8;
  --edge: #e2dce2;
  --accent: #5656a9;
  --accent-on: #ffffff;
  --accent-soft: #f0eef9;
  --ok: #397e69;
  --wait: #99704c;
  --warn: #a25259;
  --shade: rgba(48, 37, 61, .055);
}
body {
  background: color-mix(in srgb, var(--ground) 94%, transparent);
  font: 14px/1.48 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  letter-spacing: -.008em;
}
header {
  padding: 17px 18px 13px;
  gap: 14px;
  background: color-mix(in srgb, var(--ground) 92%, transparent);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
  backdrop-filter: blur(22px) saturate(145%);
}
.bar { min-height: 25px; }
.mark {
  font-size: 22px;
  font-weight: 690;
  letter-spacing: -.065em;
  line-height: 1.08;
}
.status { font-size: 12px; gap: 7px; }
.dot { width: 7px; height: 7px; }
nav {
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 3px;
  gap: 3px;
}
nav button {
  min-height: 36px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 560;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, box-shadow .15s ease;
}
nav button[aria-selected="true"] {
  background: var(--card);
  box-shadow: 0 1px 4px var(--shade);
  color: var(--ink);
}
.badge {
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 8px;
  min-width: 17px;
  font-size: 10px;
}
main { padding: 16px 18px 25px; gap: 13px; }
h2 {
  font-size: 12px;
  letter-spacing: .015em;
  font-weight: 640;
  color: var(--soft);
  margin: 6px 2px 0;
}
h2:first-child { margin-top: 0; }
.lead { font-size: 12.5px; line-height: 1.55; color: var(--soft); }
.muted { font-size: 12px; line-height: 1.5; color: var(--mute); }
.name { font-weight: 630; }
.card, .list {
  background: var(--card);
  border: 1px solid var(--edge);
  border-radius: 15px;
  box-shadow: 0 3px 13px var(--shade);
}
.card { padding: 16px; gap: 12px; }
.card.ask {
  padding: 17px;
  gap: 14px;
  box-shadow: 0 7px 23px rgba(48, 37, 61, .06), 0 1px 2px var(--shade);
}
.card.fresh { animation: human-arrive .2s var(--ease-out); }
@keyframes human-arrive {
  from { opacity: 0; transform: translateY(5px); }
}
.who { gap: 11px; }
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 13px;
  background: #f0e4df;
  color: #775557;
  font-size: 12px;
  font-weight: 660;
}
.who .name { font-size: 13px; }
.quote {
  font-size: 14px;
  line-height: 1.58;
  padding: 13px 14px;
  background: var(--well);
  border-radius: 11px;
  text-wrap: pretty;
}
.why { color: var(--soft); line-height: 1.5; font-size: 12px; }
.ledger { border-top: 1px solid var(--line); }
.ledger > div { padding-top: 11px; gap: 10px; }
.ledger > div + div { padding-top: 9px; }
.ledger .label { font-size: 12px; font-weight: 640; }
.ledger ul { color: var(--soft); font-size: 12px; line-height: 1.47; margin-top: 4px; }
.ledger .give .icon { color: var(--ok); }
.ledger .keep .icon { color: var(--soft); }
.cost { font-size: 11.5px; color: var(--mute); line-height: 1.5; }
button.act {
  min-height: 38px;
  padding: 0 12px;
  background: var(--card);
  color: var(--ink);
  border: 1px solid var(--edge);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
  box-shadow: none;
}
button.fill {
  background: var(--accent);
  color: var(--accent-on);
  border-color: var(--accent);
  box-shadow: 0 4px 10px rgba(86, 86, 169, .14);
}
@media (hover: hover) {
  button.act:hover { background: var(--well); }
  button.fill:hover { background: var(--accent); filter: brightness(1.09); }
}
.decision-actions {
  gap: 6px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.decision-actions .subtle { margin-right: auto; }
.actions { gap: 8px; }
.list { overflow: hidden; }
.list > * { min-height: 51px; padding: 11px 13px; }
.list > * + *::before { border-top: 1px solid var(--line); }
.state { font-size: 11px; color: var(--mute); }
.state.ok { color: var(--ok); }
.state.bad { color: var(--warn); }
.chips { gap: 5px; margin-top: 6px; }
.chip {
  background: var(--well);
  border: 1px solid var(--line);
  color: var(--soft);
  padding: 2px 8px;
  line-height: 1.45;
  font-size: 11px;
  border-radius: 6px;
}
.switch { width: 36px; height: 21px; border-radius: 999px; }
.switch span { width: 17px; height: 17px; }
.switch[aria-checked="true"] span { transform: translateX(15px); }
.steps li { font-size: 12px; line-height: 1.55; }
.empty { padding: 36px 20px; gap: 8px; }
.empty strong { font-size: 15px; font-weight: 650; }
.empty .icon { width: 24px; height: 24px; }
.field { font-size: 12px; gap: 7px; }
input[type="text"], textarea, select {
  background: var(--card);
  border: 1px solid var(--edge);
  border-radius: 10px;
  font-size: 13px;
  min-height: 40px;
}
textarea { min-height: 112px; padding: 12px; }
input[type="text"] { padding: 0 12px; }
select { padding: 0 8px; }
input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
.composer { gap: 12px; border-top: 1px solid var(--line); padding-top: 14px; }
.filepreview, code { background: var(--well); border-radius: 10px; }
.notice { border-radius: 11px; padding: 12px; line-height: 1.5; }
.notice.error { border: 1px solid var(--warn); }
.loading div { background: var(--well); border-radius: 13px; }
/* Review: a real field list, not a tiny diagnostic table. */
.fields { display: block; background: transparent; padding: 0; }
.fields dt {
  margin-top: 10px;
  font-size: 11px;
  font-weight: 640;
  color: var(--soft);
}
.fields dd {
  margin: 5px 0 12px;
  padding: 11px 12px;
  background: var(--well);
  border-radius: 10px;
  line-height: 1.55;
}
.fields dd .redact { display: flex; align-items: center; gap: 7px; margin-top: 9px; }
/* Activity: a person's name and a comprehensible state, not an agent dashboard. */
.list > .activity-item { padding: 0; min-height: 0; }
.activity-detail > div + div { margin-top: 6px; }
.activity-item + .activity-item { border-top: 1px solid var(--line); }
.list > .activity-item::before { display: none; }
.activity-summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 13px;
  min-height: 65px;
}
.activity-summary::-webkit-details-marker { display: none; }
.activity-summary:after {
  content: '›';
  color: var(--mute);
  font-size: 18px;
  line-height: 1;
  transition: transform .16s ease;
}
.activity-item[open] .activity-summary:after { transform: rotate(90deg); }
.activity-summary .avatar {
  width: 31px;
  height: 31px;
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
}
.activity-summary .name { font-size: 12.5px; }
.activity-summary .muted { font-size: 11.5px; }
.activity-summary .state { max-width: 92px; text-align: right; white-space: normal; }
.activity-detail {
  margin: 0 13px 13px 54px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--soft);
  line-height: 1.55;
}
.activity-detail strong { color: var(--ink); font-weight: 620; }
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #24232a;
    --well: #302e35;
    --card: #2c2a32;
    --ink: #f5f0f3;
    --soft: #d7cfd7;
    --mute: #beb5c1;
    --line: #403b45;
    --edge: #4f4751;
    --accent: #b9b1fa;
    --accent-on: #222033;
    --accent-soft: #393547;
    --ok: #8dc5ae;
    --wait: #e1ba84;
    --warn: #efa5a9;
    --shade: rgba(0, 0, 0, .18);
  }
  .avatar { background: #493c40; color: #ead2d2; }
  .activity-summary .avatar { background: var(--accent-soft); color: var(--accent); }
  button.fill { box-shadow: none; }
}
@media (prefers-contrast: more) {
  :root { --edge: #8b8390; --line: #b4abb7; --mute: #514b55; }
  .card, .list, button.act, input[type="text"], textarea { border-width: 1px; }
}
@media (prefers-color-scheme: dark) and (prefers-contrast: more) {
  :root { --edge: #b7aab9; --line: #837987; --mute: #ddd1df; }
}
@media (prefers-reduced-motion: reduce) {
  .card.fresh { animation: none !important; }
  .activity-summary:after { transition: none; }
}
`;
