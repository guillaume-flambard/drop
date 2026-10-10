import type { ConsentCost } from '@drop/protocol';
import type { InboxItem } from './engine.ts';

const AGENT_NAMES: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  other: 'un agent',
};

/** Escapes text for HTML element content and attribute values. Every peer-provided string goes through it. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function remaining(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((expiresAt - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

/** One line on who pays: the capability owner, who is also the one deciding here (D21). */
/** `requester` names who pays when the requester funds the run (D27); otherwise the cost is the reader's. */
export function costLine(cost: ConsentCost | undefined, requester?: string): string | undefined {
  if (!cost) return undefined;
  if (cost.kind === 'free') return 'Coût : gratuit.';
  const payer = requester ? `payé par ${requester}` : 'à ta charge';
  if (cost.kind === 'capped') return `Coût max : ${cost.maxUsd.toFixed(2).replace('.', ',')} $, ${payer}.`;
  return `Coût : ${payer}, non mesuré (tarifs du modèle non configurés).`;
}

/**
 * The consent card, in the order fixed by the spec. No technical identifier (node id, tool, capability id) is shown,
 * and « Pas maintenant » is the default button, never « Autoriser ».
 */
export function renderConsentCard(item: Extract<InboxItem, { kind: 'approval' }>, now: number): string {
  const who = escapeHtml(item.requestedBy.displayName);
  const cost = costLine(item.card.cost, item.card.paidBy === 'requester' ? item.requestedBy.displayName : undefined);
  const high =
    item.card.sensitivity === 'high'
      ? '<p class="high">Sensibilité haute : tu reliras le résultat avant envoi.</p>'
      : '';
  return `<article class="card" data-drop="${escapeHtml(item.dropId)}">
  <header><strong>${who} a besoin d'aide</strong><span class="via">via ${escapeHtml(AGENT_NAMES[item.requestedBy.agent] ?? 'un agent')}</span></header>
  <h2>${escapeHtml(item.card.title)}</h2>
  <blockquote>« ${escapeHtml(item.inputPreview)} »</blockquote>
  <p>Pourquoi : ${escapeHtml(item.purpose)}</p>
  <div class="cols"><div><h3>${who} recevra :</h3>${list(item.card.receives)}</div>
  <div><h3>${who} ne recevra jamais :</h3>${list(item.card.neverReceives)}</div></div>
  ${cost ? `<p class="cost">${escapeHtml(cost)}</p>` : ''}
  ${high}
  <p class="expires">Expire dans <time data-expires="${String(item.expiresAt)}">${remaining(item.expiresAt, now)}</time></p>
  <form method="post" action="/ui/decide">
    <input type="hidden" name="dropId" value="${escapeHtml(item.dropId)}">
    <button name="decision" value="not_now" autofocus>Pas maintenant</button>
    <button name="decision" value="deny">Refuser</button>
    <button name="decision" value="allow_once" class="allow">Autoriser une fois</button>
  </form>
</article>`;
}

/** Review screen for high sensitivity: every top-level field, escaped, with a box to withhold it. */
export function renderReview(item: Extract<InboxItem, { kind: 'review' }>, now: number): string {
  const output =
    typeof item.output === 'object' && item.output !== null ? (item.output as Record<string, unknown>) : {};
  const fields = Object.entries(output)
    .map(
      ([key, value]) => `<label class="field"><input type="checkbox" name="redact" value="${escapeHtml(key)}"> Retirer
  <strong>${escapeHtml(key)}</strong><pre>${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre></label>`,
    )
    .join('\n');
  return `<article class="card review" data-drop="${escapeHtml(item.dropId)}">
  <h2>Relire avant envoi : ${escapeHtml(item.title)}</h2>
  <form method="post" action="/ui/review">
    <input type="hidden" name="dropId" value="${escapeHtml(item.dropId)}">
    ${fields}
    <p class="expires">Expire dans <time data-expires="${String(item.expiresAt)}">${remaining(item.expiresAt, now)}</time></p>
    <button name="decision" value="discard" autofocus>Ne pas envoyer</button>
    <button name="decision" value="send" class="allow">Envoyer</button>
  </form>
</article>`;
}

export function renderInbox(items: InboxItem[], now: number): string {
  if (items.length === 0) return '<p class="empty">Aucune demande en attente.</p>';
  return items
    .map((item) => (item.kind === 'approval' ? renderConsentCard(item, now) : renderReview(item, now)))
    .join('\n');
}

export function renderPage(inboxHtml: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>drop · demandes</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f5f2; --fg: #1c1b19; --card: #fff; --muted: #6b675f; --accent: #1f6f5c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161513; --fg: #ece9e3; --card: #22201d; --muted: #a29d93; --accent: #5cc4a6; } }
  body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 640px; margin: 0 auto; }
  .card { background: var(--card); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px #0002; }
  header { display: flex; justify-content: space-between; gap: 8px; } .via, .expires, .empty { color: var(--muted); }
  blockquote { margin: 12px 0; padding-left: 12px; border-left: 3px solid var(--accent); white-space: pre-wrap; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } h3 { font-size: 13px; margin: 0; }
  button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--muted); background: transparent; color: inherit; cursor: pointer; }
  button.allow { background: var(--accent); border-color: var(--accent); color: #fff; } .high { color: #b0562b; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; } .field { display: block; margin: 8px 0; }
  @media (max-width: 520px) { .cols { grid-template-columns: 1fr; } }
</style></head>
<body><main><h1>Demandes</h1><section id="inbox">${inboxHtml}</section></main>
<script>
  const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('drop-token') || '';
  sessionStorage.setItem('drop-token', token);
  history.replaceState(null, '', '/');
  async function refresh() {
    const response = await fetch('/ui/inbox', { headers: { Authorization: 'Bearer ' + token } });
    if (response.ok) document.getElementById('inbox').innerHTML = await response.text();
  }
  document.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    data.set('decision', event.submitter.value);
    await fetch(form.action, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });
    refresh();
  });
  new EventSource('/ui/events?token=' + encodeURIComponent(token)).onmessage = refresh;
  setInterval(() => document.querySelectorAll('time[data-expires]').forEach((el) => {
    const s = Math.max(0, Math.round((Number(el.dataset.expires) - Date.now()) / 1000));
    el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }), 1000);
  refresh();
</script></body></html>`;
}
