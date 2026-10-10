/**
 * The menu bar panel (T2.4), served by the node at /app and shown by the Mac app in a window under its tray icon. It
 * has tabs Demandes, Équipe and Mes outils. It talks only
 * to this node's own API (same origin, bearer token from the URL). Everything a peer wrote is inserted with
 * textContent, never as HTML. No backtick and no dollar-brace in the script below: it lives in a template string.
 */
export function renderPanel(): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>drop</title>
<style>
:root { color-scheme: light dark; --ground: #F7F6F3; --well: #EFEDE8; --card: #FFFFFF; --ink: #1A1A19; --soft: #55534E;
  --mute: #6B6862; --line: #E4E2DC; --edge: #DAD8D2; --accent: #0E5F58; --accent-on: #FFFFFF; --accent-soft: #E3EFEC;
  --warn: #9A3412; --ok: #2E8B57; --wait: #B7791F; --shade: rgba(26, 26, 25, .08); }
@media (prefers-color-scheme: dark) { :root { --ground: #1C1C1B; --well: #232321; --card: #2A2A28; --ink: #F2F1EE;
  --soft: #C9C6BE; --mute: #A29F97; --line: #34332F; --edge: #43413C; --accent: #5CC2B5; --accent-on: #122923;
  --accent-soft: #23403C; --warn: #F0A27A; --ok: #5FBF85; --wait: #E0A93B; --shade: rgba(0, 0, 0, .35); } }
* { box-sizing: border-box; }
html { scrollbar-width: thin; scrollbar-color: var(--edge) transparent; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 13px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; -webkit-user-select: none; user-select: none; }
.quote, code, .fields dd { -webkit-user-select: text; user-select: text; }
button, input { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: progress; }
::selection { background: var(--accent); color: var(--accent-on); }
::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-thumb { background: var(--edge); border-radius: 8px; border: 2px solid var(--ground); }
.icon { width: 14px; height: 14px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

header { position: sticky; top: 0; z-index: 1; background: var(--ground); padding: 12px 14px 10px; display: flex; flex-direction: column; gap: 10px;
  border-bottom: 1px solid var(--line); }
.bar { display: flex; align-items: center; gap: 8px; }
.mark { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.status { margin-left: auto; display: flex; align-items: center; gap: 6px; color: var(--soft); font-size: 12px; min-width: 0; }
#status-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; background: var(--mute); flex-shrink: 0; }
.dot.ok { background: var(--ok); } .dot.wait { background: var(--wait); } .dot.bad { background: var(--warn); }
nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; padding: 2px; border-radius: 8px; background: var(--well);
  border: 1px solid var(--line); }
nav button { min-height: 26px; border-radius: 6px; border: none; background: transparent; color: var(--soft); font-size: 12px; font-weight: 500;
  cursor: default; display: flex; align-items: center; justify-content: center; gap: 5px; transition: background-color .15s, color .15s; }
nav button:hover { color: var(--ink); }
nav button[aria-selected="true"] { background: var(--card); color: var(--ink); box-shadow: 0 1px 2px var(--shade), 0 0 0 .5px var(--edge); }
.badge { min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px; background: var(--accent); color: var(--accent-on); font-size: 10px;
  font-weight: 600; line-height: 16px; font-variant-numeric: tabular-nums; }

main { padding: 12px 14px 18px; display: flex; flex-direction: column; gap: 10px; }
h2 { margin: 8px 2px -2px; font-size: 12px; font-weight: 600; color: var(--soft); }
h2:first-child { margin-top: 0; }
.muted { color: var(--mute); font-size: 12px; }
.lead { color: var(--soft); font-size: 12px; margin: 0 2px; }
.row { display: flex; align-items: center; gap: 10px; }
.grow { flex-grow: 1; min-width: 0; }
.name { font-weight: 600; }

.card { background: var(--card); border: .5px solid var(--edge); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 1px 2px var(--shade); }
.card.ask { padding: 14px; gap: 12px; animation: arrive .22s cubic-bezier(.16, 1, .3, 1); }
@keyframes arrive { from { opacity: 0; transform: translateY(4px); } }
.who { display: flex; align-items: center; gap: 10px; }
.who .muted { margin-top: 1px; }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 600; font-size: 11px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.quote { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ink); padding: 10px 12px; border-radius: 8px; background: var(--well); }
.why { font-size: 12px; color: var(--soft); }
.why b { font-weight: 600; color: var(--ink); }
.ledger { display: flex; flex-direction: column; border-top: .5px solid var(--line); }
.ledger > div { display: flex; gap: 8px; padding: 9px 0 0; align-items: flex-start; }
.ledger > div + div { padding-top: 8px; }
.ledger .icon { margin-top: 2px; }
.ledger .give .icon { color: var(--accent); }
.ledger .keep .icon { color: var(--mute); }
.ledger .label { font-size: 12px; font-weight: 600; }
.ledger ul { margin: 2px 0 0; padding: 0; list-style: none; color: var(--soft); font-size: 12px; }
.cost { font-size: 11px; color: var(--mute); font-variant-numeric: tabular-nums; }
.decision-actions { display: flex; align-items: center; gap: 6px; padding-top: 2px; }
.decision-actions .subtle { margin-right: auto; padding-inline: 4px; border-color: transparent; background: transparent; color: var(--soft); box-shadow: none; }
.decision-actions .subtle:hover { color: var(--ink); background: transparent; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
button.act { min-height: 30px; padding: 0 11px; white-space: nowrap; border-radius: 7px; border: .5px solid var(--edge); background: var(--card); color: var(--ink);
  font-weight: 500; cursor: default; box-shadow: 0 .5px 1px var(--shade); transition: background-color .15s, transform .1s, filter .15s; }
button.act:hover { background: var(--well); }
button.act:active { transform: scale(.98); }
button.accent { color: var(--accent); }
button.fill { background: var(--accent); border-color: var(--accent); color: var(--accent-on); }
button.fill:hover { background: var(--accent); filter: brightness(1.08); }
button.wide { width: 100%; }

.fields { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: 12px; padding: 10px 12px; border-radius: 8px;
  background: var(--well); }
.fields dt { color: var(--mute); } .fields dd { margin: 0; }
.list { background: var(--card); border: .5px solid var(--edge); border-radius: 10px; box-shadow: 0 1px 2px var(--shade); overflow: hidden; }
.list > div { padding: 9px 12px; min-height: 40px; position: relative; }
.list > div + div::before { content: ""; position: absolute; top: 0; left: 12px; right: 0; border-top: .5px solid var(--line); }
.state { font-size: 11px; color: var(--mute); white-space: nowrap; }
.state.ok { color: var(--ok); } .state.bad { color: var(--warn); }
.chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.chip { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--well); color: var(--soft); border: .5px solid var(--line); }
.switch { width: 32px; height: 19px; border-radius: 999px; border: none; padding: 2px; display: flex; cursor: default; background: var(--edge);
  justify-content: flex-start; flex-shrink: 0; transition: background-color .15s; }
.switch[aria-checked="true"] { background: var(--accent); justify-content: flex-end; }
.switch span { width: 15px; height: 15px; border-radius: 50%; background: #fff; display: block; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); }
.steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.steps li { display: flex; gap: 8px; color: var(--soft); font-size: 12px; }
.steps li span { width: 18px; height: 18px; border-radius: 50%; background: var(--well); border: .5px solid var(--edge); color: var(--ink);
  font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 22px 16px; color: var(--soft); }
.empty .icon { width: 22px; height: 22px; color: var(--ok); stroke-width: 1.4; }
.empty strong { color: var(--ink); font-size: 13px; }
input[type="text"] { min-height: 30px; border-radius: 7px; border: .5px solid var(--edge); padding: 0 9px; background: var(--card); width: 100%;
  -webkit-user-select: text; user-select: text; }
input[type="checkbox"] { accent-color: var(--accent); width: 14px; height: 14px; margin: 0; }
input[aria-invalid="true"] { border-color: var(--warn); }
.error { color: var(--warn); font-size: 12px; }
.notice { border-radius: 8px; padding: 9px 11px; background: var(--accent-soft); color: var(--ink); font-size: 12px; }
.notice.error { background: transparent; border: .5px solid var(--warn); color: var(--ink); }
.notice.error button { margin-top: 8px; }
.loading { display: flex; flex-direction: column; gap: 10px; }
.loading div { height: 64px; border-radius: 10px; background: var(--well); animation: breathe 1.2s ease-in-out infinite alternate; }
@keyframes breathe { to { opacity: .5; } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
code { font: 11px/1.4 ui-monospace, SFMono-Regular, monospace; word-break: break-all; white-space: pre-wrap; display: block; padding: 8px 10px;
  border-radius: 7px; background: var(--well); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>
</head>
<body>
<header>
<div class="bar">
  <span class="mark">drop</span>
  <div class="status"><span class="dot" id="relay-dot" aria-hidden="true"></span><span id="status-text" role="status" aria-live="polite">Connexion…</span></div>
</div>
<nav role="tablist" aria-label="Sections de drop">
  <button role="tab" id="tab-requests" aria-controls="view" aria-selected="true" tabindex="0">Demandes<span class="badge" id="badge" hidden></span></button>
  <button role="tab" id="tab-team" aria-controls="view" aria-selected="false" tabindex="-1">Équipe</button>
  <button role="tab" id="tab-tools" aria-controls="view" aria-selected="false" tabindex="-1">Mes outils</button>
</nav>
</header>
<div id="announcement" role="status" aria-live="polite" class="sr-only"></div>
<main id="view" role="tabpanel" aria-labelledby="tab-requests"></main>
<script>
(function () {
  var token = new URLSearchParams(location.search).get('token') || '';
  var tab = 'requests';
  var notice = '';
  var info = '';
  var onboardingPlans = null;
  var manualConnector = null;
  var renderVersion = 0;
  var pendingRefresh = false;

  function announce(message) {
    document.getElementById('announcement').textContent = message;
  }

  function api(method, path, body, form) {
    var headers = { Authorization: 'Bearer ' + token };
    var payload;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    return fetch(path, { method: method, headers: headers, body: payload }).then(function (res) {
      return res.json().then(function (data) { if (!res.ok) throw new Error((data && data.message) || 'erreur'); return data; });
    });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (key) {
      if (key === 'text') node.textContent = a[key];
      else if (key === 'onclick') node.addEventListener('click', a[key]);
      else node.setAttribute(key, a[key]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  var ICONS = {
    give: ['M3.5 8.5l3 3 6-7'],
    keep: ['M4.5 7.5h7v5.5h-7z', 'M6 7.5V5.5a2 2 0 0 1 4 0v2'],
    calm: ['M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z', 'M5.5 8.2l1.8 1.8 3.2-3.6']
  };

  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    ICONS[name].forEach(function (d) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  function list(items) {
    var node = el('ul', {});
    items.forEach(function (item) { node.appendChild(el('li', { text: item })); });
    return node;
  }

  function firstName(name) {
    return name.split(/\\s+/)[0] || name;
  }

  function agentName(agent) {
    var names = { claude_code: 'Claude Code', claude_desktop: 'Claude Desktop', cursor: 'Cursor', codex: 'Codex' };
    return names[agent] || agent.replace(/_/g, ' ');
  }

  function initials(name) {
    return name.split(/\\s+/).map(function (part) { return part.charAt(0); }).join('').slice(0, 2).toUpperCase();
  }

  function costLine(card, requester) {
    if (!card.cost) return null;
    if (card.cost.kind === 'free') return 'Coût : gratuit';
    var payer = card.paidBy === 'requester' ? 'payé par ' + requester : 'à ta charge';
    if (card.cost.kind === 'capped') return 'Coût max : ' + card.cost.maxUsd.toFixed(2).replace('.', ',') + ' $, ' + payer;
    return 'Coût : ' + payer + ', non mesuré';
  }

  function decide(path, dropId, decision, button) {
    button.disabled = true;
    api('POST', path, undefined, { dropId: dropId, decision: decision }).then(function () {
      info = decision === 'allow_once' ? 'Demande autorisée une fois.' : decision === 'deny' ? 'Demande refusée.' : decision === 'not_now' ? 'Demande reportée.' : decision === 'send' ? 'Réponse envoyée.' : 'Réponse conservée sur ce Mac.';
      announce(info);
      render(true);
    }, function (error) { notice = error.message; announce('Action impossible. ' + notice); render(true); });
  }

  function approvalCard(item) {
    var who = item.requestedBy.displayName;
    var cost = costLine(item.card, who);
    var first = firstName(who);
    return el('article', { class: 'card ask', 'aria-label': who + ' : ' + item.card.title },
      el('div', { class: 'who' }, el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(who) }),
        el('div', { class: 'grow' }, el('div', {}, el('span', { class: 'name', text: who }), ' a besoin d’aide'),
          el('div', { class: 'muted', text: item.card.title + ' · via ' + agentName(item.requestedBy.agent) }))),
      el('p', { class: 'quote', text: '« ' + item.inputPreview + ' »' }),
      el('div', { class: 'why' }, el('b', { text: 'Pourquoi ' }), item.purpose),
      el('div', { class: 'ledger' },
        el('div', { class: 'give' }, icon('give'), el('div', {}, el('div', { class: 'label', text: first + ' recevra' }), list(item.card.receives))),
        el('div', { class: 'keep' }, icon('keep'), el('div', {}, el('div', { class: 'label', text: first + ' ne recevra jamais' }), list(item.card.neverReceives)))),
      cost ? el('div', { class: 'cost', text: cost }) : null,
      el('div', { class: 'decision-actions' },
        el('button', { class: 'act subtle', 'aria-label': 'Reporter : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'not_now', event.currentTarget); } }, 'Pas maintenant'),
        el('button', { class: 'act', 'aria-label': 'Refuser : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'deny', event.currentTarget); } }, 'Refuser'),
        el('button', { class: 'act fill', 'aria-label': 'Autoriser une fois : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'allow_once', event.currentTarget); } }, 'Autoriser une fois')));
  }

  function reviewCard(item) {
    var fields = el('dl', { class: 'fields' });
    var output = item.output || {};
    Object.keys(output).forEach(function (key) {
      var value = output[key];
      fields.appendChild(el('dt', { text: key }));
      fields.appendChild(el('dd', { text: Array.isArray(value) ? value.join(', ') : String(value) }));
    });
    return el('article', { class: 'card ask', 'aria-label': 'À relire : ' + item.title },
      el('div', {}, el('div', { class: 'name', text: item.title }),
        el('div', { class: 'muted', text: 'À relire avant envoi. Rien n’est parti : tu peux envoyer ou garder pour toi.' })),
      fields,
      el('div', { class: 'actions' },
        el('button', { class: 'act', 'aria-label': 'Ne pas envoyer : ' + item.title, onclick: function (event) { decide('/ui/review', item.dropId, 'discard', event.currentTarget); } }, 'Ne pas envoyer'),
        el('button', { class: 'act fill', 'aria-label': 'Envoyer : ' + item.title, onclick: function (event) { decide('/ui/review', item.dropId, 'send', event.currentTarget); } }, 'Envoyer')));
  }

  var STATES = { proposed: 'envoyée', awaiting_approval: 'en attente', approved: 'acceptée', running: 'en cours', in_review: 'relue',
    delivered: 'reçue', receipted: 'reçue', denied: 'refusée', not_now: 'pas maintenant', expired: 'expirée', failed: 'échouée' };
  var TONES = { delivered: 'ok', receipted: 'ok', denied: 'bad', failed: 'bad', expired: '', not_now: '' };

  function renderRequests(view) {
    return Promise.all([api('GET', '/ui/pending'), api('GET', '/ui/outbound')]).then(function (data) {
      var pending = data[0].pending;
      var badge = document.getElementById('badge');
      badge.hidden = pending.length === 0;
      badge.textContent = String(pending.length);
      view.appendChild(el('h2', { text: 'À décider' }));
      if (pending.length === 0) view.appendChild(el('div', { class: 'card empty' }, icon('calm'),
        el('strong', { text: 'Rien à décider' }),
        el('div', { class: 'muted', text: 'Quand un collègue aura besoin d’un de tes outils, sa question arrivera ici avec une notification.' })));
      pending.forEach(function (item) { view.appendChild(item.kind === 'approval' ? approvalCard(item) : reviewCard(item)); });
      var drops = data[1].drops;
      if (drops.length > 0) {
        view.appendChild(el('h2', { text: 'Mes questions' }));
        var rows = el('div', { class: 'list' });
        drops.slice(0, 10).forEach(function (drop) {
          var tone = drop.result ? 'ok' : drop.error ? 'bad' : drop.state in TONES ? TONES[drop.state] : 'wait';
          rows.appendChild(el('div', { class: 'row' },
            el('span', { class: 'dot ' + tone, 'aria-hidden': 'true' }),
            el('div', { class: 'grow' }, el('div', { class: 'name', text: drop.ownerName }), el('div', { class: 'muted', text: drop.title })),
            el('span', { class: 'state ' + tone, text: STATES[drop.state] || drop.state })));
        });
        view.appendChild(rows);
      }
    });
  }

  function renderTeam(view) {
    return api('GET', '/ui/team').then(function (data) {
      if (!data.team) {
        var name = el('input', { type: 'text', placeholder: 'Nom de l’équipe', 'aria-label': 'Nom de l’équipe' });
        view.appendChild(el('div', { class: 'card' },
          el('div', {}, el('div', { class: 'name', text: 'Pas encore d’équipe' }),
            el('div', { class: 'muted', text: 'Crée-la, puis invite tes collègues : chacun verra les outils des autres.' })),
          name,
          el('div', { class: 'actions' }, el('button', { class: 'act fill', onclick: function () {
            if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); announce('Donne un nom à l’équipe.'); name.focus(); return; }
            api('POST', '/ui/admin/team', { name: name.value.trim() }).then(function () { info = 'Équipe créée.'; announce(info); render(true); }, function (error) { notice = error.message; render(true); });
          } }, 'Créer l’équipe'))));
        return;
      }
      var online = data.members.filter(function (member) { return member.online; }).length;
      view.appendChild(el('h2', { text: data.team.name + ' · ' + data.members.length + ' membres, ' + online + ' en ligne' }));
      var members = el('div', { class: 'list' });
      data.members.forEach(function (member) {
        var chips = el('div', { class: 'chips' });
        member.capabilities.forEach(function (capability) { chips.appendChild(el('span', { class: 'chip', text: capability.title.replace('Répondre à partir de ', '') })); });
        members.appendChild(el('div', {},
          el('div', { class: 'row' }, el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(member.displayName) }),
            el('div', { class: 'grow' }, el('div', { class: 'name', text: member.displayName + (member.self ? ' (toi)' : '') }),
              el('div', { class: 'muted', text: member.agents.join(', ') || 'aucun agent signalé' }),
              member.capabilities.length > 0 ? chips : null),
            el('span', { class: 'dot ' + (member.online ? 'ok' : ''), 'aria-hidden': 'true' }),
            el('span', { class: 'state', text: member.online ? 'en ligne' : 'hors ligne' }))));
      });
      view.appendChild(members);
      var code = el('div', {});
      view.appendChild(el('button', { class: 'act wide', onclick: function () {
        api('POST', '/ui/invite').then(function (data) {
          var link = 'drop://pair?code=' + encodeURIComponent(data.code);
          code.textContent = '';
          code.appendChild(el('div', { class: 'card' }, el('div', { class: 'muted', text: 'Envoie ce lien, valable 24 h, une seule fois :' }), el('code', { text: link }),
            el('div', { class: 'actions' }, el('button', { class: 'act accent', onclick: function () { navigator.clipboard.writeText(link).then(function () { announce('Lien copié.'); }); } }, 'Copier le lien'))));
        });
      } }, 'Inviter quelqu’un dans l’équipe'));
      view.appendChild(code);
    });
  }

  function renderTools(view) {
    return api('GET', '/ui/admin/tools').then(function (data) {
      view.appendChild(el('h2', { text: 'Connecter mes agents' }));
      var steps = el('ol', { class: 'steps' },
        el('li', {}, el('span', { 'aria-hidden': 'true', text: '1' }), 'Analyse locale des quatre agents compatibles.'),
        el('li', {}, el('span', { 'aria-hidden': 'true', text: '2' }), 'Choisis puis confirme les connecteurs à ajouter. Aucun outil ne sera partagé.'));
      view.appendChild(el('div', { class: 'card' }, steps, el('button', { class: 'act wide', onclick: function (event) {
        event.currentTarget.disabled = true;
        api('GET', '/ui/admin/onboarding').then(function (result) { onboardingPlans = result.agents; manualConnector = result.manual; render(true); }, function (error) { notice = error.message; render(true); });
      } }, '1. Analyser ce Mac')));
      var plans = onboardingPlans || [];
      var selectable = [];
      var found = el('div', { class: 'list' });
      plans.forEach(function (plan) {
        if (plan.state === 'absent') return;
        var checkbox = plan.state === 'ready' ? el('input', { type: 'checkbox', 'aria-label': 'Connecter ' + plan.label }) : null;
        if (checkbox) { checkbox.checked = true; selectable.push({ plan: plan, checkbox: checkbox }); }
        found.appendChild(el('div', { class: 'row' }, checkbox,
          el('div', { class: 'grow' }, el('div', { class: 'name', text: plan.label }),
            el('div', { class: plan.state === 'error' || plan.state === 'conflict' ? 'error' : 'muted', text: plan.detail })),
          plan.state === 'already_connected' ? el('button', { class: 'act', onclick: function () {
            api('POST', '/ui/admin/onboarding', { selections: [{ agent: plan.agent, fingerprint: plan.fingerprint, action: 'disconnect' }] }).then(function (result) {
              info = result.results.map(function (item) { return item.agent + ' : ' + item.detail; }).join(' · ');
              onboardingPlans = null;
              announce(info);
              render(true);
            }, function (error) { notice = error.message; render(true); });
          } }, 'Retirer ce connecteur') : null));
      });
      if (found.childNodes.length > 0) view.appendChild(found);
      if (selectable.length > 0) view.appendChild(el('button', { class: 'act fill wide', onclick: function () {
        var selected = selectable.filter(function (item) { return item.checkbox.checked; }).map(function (item) {
          return { agent: item.plan.agent, fingerprint: item.plan.fingerprint, action: 'connect' };
        });
        if (!selected.length) { announce('Coche au moins un agent.'); return; }
        api('POST', '/ui/admin/onboarding', { selections: selected }).then(function (result) {
          info = result.results.map(function (item) { return item.agent + ' : ' + item.detail; }).join(' · ') + ' · Connecteur utilisable : à vérifier après relance. L’état de l’équipe apparaît en haut.';
          onboardingPlans = null;
          announce(info);
          render(true);
        }, function (error) { notice = error.message; render(true); });
      } }, '2. Connecter les agents sélectionnés'));
      if (onboardingPlans && plans.every(function (plan) { return plan.state === 'absent'; })) view.appendChild(el('div', { class: 'card empty' },
        el('strong', { text: 'Aucun des quatre agents détecté' }),
        el('div', { class: 'muted', text: 'Tu peux ajouter manuellement le connecteur MCP drop dans ton agent.' })));
      view.appendChild(el('div', { class: 'lead', text: 'Autre agent ? Ajoute manuellement un serveur MCP stdio nommé drop. Aucune permission générale n’est nécessaire.' }));
      if (onboardingPlans && manualConnector) view.appendChild(el('div', { class: 'card' },
        el('div', { class: 'name', text: 'Configuration manuelle' }),
        el('code', { text: JSON.stringify({ mcpServers: { drop: manualConnector } }, null, 2) }),
        el('div', { class: 'muted', text: 'Copie cette entrée dans la configuration MCP de ton agent, puis relance-le. Cela ne partage aucun outil.' })));
      view.appendChild(el('h2', { text: 'Mes outils' }));
      view.appendChild(el('div', { class: 'lead', text: 'Partager un outil, c’est répondre aux questions de l’équipe avec lui, après ton accord. Personne ne reçoit l’accès.' }));
      data.agents.forEach(function (agent) {
        if (!agent.installed) return;
        var card = el('div', { class: 'list' });
        card.appendChild(el('div', { class: 'row' },
          el('div', { class: 'grow' }, el('div', { class: 'name', text: agent.label }),
            el('div', { class: 'muted', text: agent.dropInstalled ? 'drop est installé dans ' + agent.label : 'drop n’est pas encore installé' }))));
        agent.servers.forEach(function (server) {
          if (!server.shareable) return;
          var shared = data.shared[agent.agent + '/' + server.name];
          card.appendChild(el('div', { class: 'row' },
            el('div', { class: 'grow' }, el('div', { text: server.name }), el('div', { class: 'muted', text: (server.kind ? server.kind + ' · ' : '') + server.where })),
            el('button', { class: 'switch', role: 'switch', 'aria-checked': shared ? 'true' : 'false', 'aria-label': (shared ? 'Ne plus partager ' : 'Partager ') + server.name,
              onclick: function (event) {
                event.currentTarget.disabled = true;
                var call = shared ? api('POST', '/ui/admin/unshare', { capabilityId: shared }) : api('POST', '/ui/admin/share', { agent: agent.agent, server: server.name });
                call.then(function () { info = shared ? 'Outil retiré du partage.' : 'Outil partagé après consentement.'; announce(info); render(true); }, function (error) { notice = error.message; render(true); });
              } }, el('span', {}))));
        });
        view.appendChild(card);
      });
      if (data.links.length > 0) {
        view.appendChild(el('h2', { text: 'Assistants reliés' }));
        var linked = el('div', { class: 'list' });
        data.links.forEach(function (link) {
          linked.appendChild(el('div', { class: 'row' },
            el('div', { class: 'grow' }, el('div', { class: 'name', text: link.clientName }), el('div', { class: 'muted', text: 'peut demander à ton équipe en ton nom' })),
            el('button', { class: 'act', 'aria-label': 'Retirer ' + link.clientName, onclick: function () {
              api('POST', '/ui/admin/unlink', { gateway: link.gateway, client: link.clientName }).then(function () { render(true); });
            } }, 'Retirer')));
        });
        view.appendChild(linked);
      }
      view.appendChild(el('div', { class: 'lead', text: 'Qui paie le modèle : ' + (data.payer === 'owner' ? 'toi' : 'celui qui demande') }));
    });
  }

  function render(focusResult) {
    var version = ++renderVersion;
    var view = document.getElementById('view');
    ['requests', 'team', 'tools'].forEach(function (name) {
      document.getElementById('tab-' + name).setAttribute('aria-selected', String(name === tab));
      document.getElementById('tab-' + name).setAttribute('tabindex', name === tab ? '0' : '-1');
    });
    var next = document.createElement('main');
    next.id = 'view';
    next.setAttribute('role', 'tabpanel');
    next.setAttribute('aria-labelledby', 'tab-' + tab);
    next.setAttribute('aria-busy', 'true');
    if (notice) { next.appendChild(el('div', { class: 'notice error', role: 'alert', text: notice })); notice = ''; }
    if (info) { next.appendChild(el('div', { class: 'notice', text: info })); info = ''; }
    var loading = el('div', { class: 'loading' }, el('span', { class: 'sr-only', text: 'Chargement…' }), el('div', {}), el('div', {}));
    next.appendChild(loading);
    view.replaceWith(next);
    function complete(error) {
      if (version !== renderVersion) return;
      loading.remove();
      next.setAttribute('aria-busy', 'false');
      if (error) {
        var message = 'Impossible de charger cette section. Vérifie que drop est ouvert, puis réessaie.';
        next.appendChild(el('div', { class: 'notice error', role: 'alert' },
          el('div', { text: message }), el('button', { class: 'act', onclick: function () { render(true); } }, 'Réessayer')));
        announce(message);
      }
      if (focusResult) {
        var target = next.querySelector('h2, [role="alert"], .notice, button');
        if (target) { target.setAttribute('tabindex', '-1'); target.focus(); }
      }
    }
    if (linkRequest) {
      api('GET', '/ui/admin/tools').then(function (tools) { if (version === renderVersion) linkCard(next, tools); complete(); }, complete);
      return;
    }
    var build = tab === 'requests' ? renderRequests : tab === 'team' ? renderTeam : renderTools;
    build(next).then(function () { complete(); }, complete);
    api('GET', '/ui/admin/status').then(function (status) {
      if (version !== renderVersion) return;
      document.getElementById('relay-dot').className = 'dot ' + (status.relayConnected ? 'ok' : 'wait');
      document.getElementById('status-text').textContent = status.displayName + (status.relayConnected ? ' · connecté' : ' · hors ligne');
    }, function () {
      if (version !== renderVersion) return;
      document.getElementById('relay-dot').className = 'dot bad';
      document.getElementById('status-text').textContent = 'Moteur local indisponible';
    });
  }

  var tabNames = ['requests', 'team', 'tools'];
  tabNames.forEach(function (name) {
    var control = document.getElementById('tab-' + name);
    control.addEventListener('click', function () { tab = name; render(); });
    control.addEventListener('keydown', function (event) {
      var index = tabNames.indexOf(name);
      var target = event.key === 'ArrowRight' ? (index + 1) % tabNames.length : event.key === 'ArrowLeft' ? (index + tabNames.length - 1) % tabNames.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabNames.length - 1 : -1;
      if (target < 0) return;
      event.preventDefault();
      tab = tabNames[target];
      render();
      document.getElementById('tab-' + tab).focus();
    });
  });
  // Opened from a drop://link link (T2.13): an assistant such as Claude or ChatGPT asks to reach the team in this
  // user's name, through a gateway. Nothing happens until the user clicks.
  var linkParams = new URLSearchParams(location.search);
  var linkRequest = linkParams.get('link') ? { session: linkParams.get('link'), gateway: linkParams.get('gateway') || '', client: linkParams.get('client') || 'Un assistant' } : null;
  if (linkRequest) history.replaceState(null, '', '/app?token=' + encodeURIComponent(token));

  function linkCard(view, status) {
    var request = linkRequest;
    var trusted = status.gateways.indexOf(request.gateway) >= 0;
    view.appendChild(el('div', { class: 'card' },
      el('strong', { text: 'Autoriser ' + request.client + ' à demander à ton équipe ?' }),
      el('div', { text: request.client + ' pourra poser des questions à tes collègues en ton nom. Chacun continue d’accepter ou de refuser chaque question ; personne ne reçoit d’accès.' }),
      trusted ? null : el('div', { class: 'error', text: 'Attention : cette demande ne passe pas par la passerelle officielle de drop. Refuse si tu n’en es pas à l’origine.' }),
      el('div', { class: 'actions' },
        el('button', { class: 'act', onclick: function () { linkRequest = null; info = 'Raccordement refusé.'; announce(info); render(true); } }, 'Refuser'),
        el('button', { class: 'act fill', onclick: function () {
          api('POST', '/ui/admin/link', { gateway: request.gateway, session: request.session, client: request.client }).then(function () {
            linkRequest = null;
            info = request.client + ' est relié. Tu peux revenir dans ta conversation.';
            announce(info);
            render(true);
          }, function (error) { notice = error.message; render(true); });
        } }, 'Autoriser'))));
  }

  // Opened from a drop://pair link: accept the invitation once, then forget the code.
  var pairCode = new URLSearchParams(location.search).get('pair');
  if (pairCode) {
    history.replaceState(null, '', '/app?token=' + encodeURIComponent(token));
    api('POST', '/ui/pair', undefined, { code: pairCode }).then(function () {
      info = 'Invitation acceptée : tu rejoins l’équipe dans quelques secondes.';
      tab = 'team';
      announce(info);
      render(true);
    }, function () { notice = 'Ce lien d’invitation n’est plus valable. Demande-en un nouveau.'; render(true); });
  }
  var events = new EventSource('/ui/events?token=' + encodeURIComponent(token));
  events.onmessage = function () {
    if (tab !== 'requests') return;
    if (document.activeElement && document.activeElement.closest('#view')) { pendingRefresh = true; return; }
    render();
  };
  document.addEventListener('focusin', function (event) {
    if (pendingRefresh && !event.target.closest('#view')) { pendingRefresh = false; render(); }
  });
  render();
})();
</script>
</body>
</html>
`;
}
