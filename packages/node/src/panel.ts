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
  --warn: #9A3412; --ok: #2E8B57; --wait: #B7791F; --shade: rgba(26, 26, 25, .08); --ease-out: cubic-bezier(.23, 1, .32, 1); }
@media (prefers-color-scheme: dark) { :root { --ground: #1C1C1B; --well: #232321; --card: #2A2A28; --ink: #F2F1EE;
  --soft: #C9C6BE; --mute: #A29F97; --line: #34332F; --edge: #43413C; --accent: #5CC2B5; --accent-on: #122923;
  --accent-soft: #23403C; --warn: #F0A27A; --ok: #5FBF85; --wait: #E0A93B; --shade: rgba(0, 0, 0, .35); } }
* { box-sizing: border-box; }
/* The Mac window is transparent with a rounded popover material: the page paints a translucent ground inside it. */
html { height: 100%; overflow: hidden; border-radius: 12px; background: transparent; }
body { height: 100%; overflow-y: auto; border-radius: 12px; scrollbar-width: thin; scrollbar-color: var(--edge) transparent;
  scroll-padding-top: 104px; }
body { margin: 0; background: color-mix(in srgb, var(--ground) 88%, transparent); color: var(--ink); font: 13px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; -webkit-user-select: none; user-select: none; touch-action: manipulation;
  -webkit-tap-highlight-color: transparent; }
.quote, code, .fields dd { -webkit-user-select: text; user-select: text; }
button, input { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: progress; }
::selection { background: var(--accent); color: var(--accent-on); }
::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-thumb { background: var(--edge); border-radius: 8px; border: 2px solid var(--ground); }
.icon { width: 14px; height: 14px; flex-shrink: 0; fill: currentColor; }
.name, .muted, .quote, .ledger ul, .fields dd { overflow-wrap: anywhere; }

header { position: sticky; top: 0; z-index: 1; padding: 12px 14px 10px; display: flex; flex-direction: column; gap: 10px;
  background: color-mix(in srgb, var(--ground) 80%, transparent); -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%); border-bottom: .5px solid transparent; transition: border-color .2s ease; }
header.edge { border-bottom-color: var(--edge); }
#edge { height: 1px; margin-bottom: -1px; }
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
@media (hover: hover) { nav button:hover { color: var(--ink); } }
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
.card.ask { padding: 14px; gap: 12px; transition: opacity .16s ease-out, transform .16s ease-out; }
.card.fresh { animation: arrive .24s var(--ease-out); }
.card.leaving { opacity: 0; transform: scale(.98); pointer-events: none; }
@keyframes arrive { from { opacity: 0; transform: translateY(6px) scale(.99); } }
.who { display: flex; align-items: center; gap: 10px; }
.who .muted { margin-top: 1px; }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 600; font-size: 11px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.quote { margin: 0; text-wrap: pretty; font-size: 14px; line-height: 1.45; color: var(--ink); padding: 10px 12px; border-radius: 8px; background: var(--well); }
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
@media (hover: hover) { .decision-actions .subtle:hover { color: var(--ink); background: transparent; } }
.actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
button.act { min-height: 30px; padding: 0 11px; white-space: nowrap; border-radius: 7px; border: .5px solid var(--edge); background: var(--card); color: var(--ink);
  font-weight: 500; cursor: default; box-shadow: 0 .5px 1px var(--shade);
  transition: transform .16s var(--ease-out), background-color .15s ease, filter .15s ease; }
@media (hover: hover) { button.act:hover { background: var(--well); } button.fill:hover { background: var(--accent); filter: brightness(1.08); } }
button.act:active { transform: scale(.97); }
button.accent { color: var(--accent); }
button.fill { background: var(--accent); border-color: var(--accent); color: var(--accent-on); }
button.wide { width: 100%; }

.fields { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: 12px; padding: 10px 12px; border-radius: 8px;
  background: var(--well); }
.fields dt { color: var(--mute); } .fields dd { margin: 0; }
.list { background: var(--card); border: .5px solid var(--edge); border-radius: 10px; box-shadow: 0 1px 2px var(--shade); overflow: hidden; }
.list > * { padding: 9px 12px; min-height: 40px; position: relative; }
.list > * + *::before { content: ""; position: absolute; top: 0; left: 12px; right: 0; border-top: .5px solid var(--line); }
.state { font-size: 11px; color: var(--mute); white-space: nowrap; }
.state.ok { color: var(--ok); } .state.bad { color: var(--warn); }
.chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.chip { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--well); color: var(--soft); border: .5px solid var(--line); }
.switch { width: 32px; height: 19px; border-radius: 999px; border: none; padding: 2px; display: block; cursor: default; background: var(--edge);
  flex-shrink: 0; transition: background-color .2s ease; }
.switch[aria-checked="true"] { background: var(--accent); }
.switch span { width: 15px; height: 15px; border-radius: 50%; background: #FCFCFB; display: block; box-shadow: 0 1px 2px rgba(0, 0, 0, .25);
  transition: transform .2s var(--ease-out); }
.switch[aria-checked="true"] span { transform: translateX(13px); }
.switch:active span { transform: scaleX(1.12); transform-origin: left; }
.switch[aria-checked="true"]:active span { transform: translateX(11px) scaleX(1.12); }
.steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.steps li { display: flex; gap: 8px; color: var(--soft); font-size: 12px; }
.steps li span { width: 18px; height: 18px; border-radius: 50%; background: var(--well); border: .5px solid var(--edge); color: var(--ink);
  font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 22px 16px; color: var(--soft); }
.empty .icon { width: 22px; height: 22px; color: var(--ok); }
.empty strong { color: var(--ink); font-size: 13px; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 500; }
input[type="text"] { min-height: 30px; font-weight: 400; border-radius: 7px; border: .5px solid var(--edge); padding: 0 9px; background: var(--card); width: 100%;
  -webkit-user-select: text; user-select: text; }
input[type="checkbox"] { accent-color: var(--accent); width: 14px; height: 14px; margin: 0; }
input[aria-invalid="true"] { border-color: var(--warn); }
.error { color: var(--warn); font-size: 12px; }
textarea { min-height: 96px; resize: vertical; font: inherit; font-size: 13px; font-weight: 400; line-height: 1.45; color: var(--ink); width: 100%;
  border-radius: 7px; border: .5px solid var(--edge); padding: 7px 9px; background: var(--card); -webkit-user-select: text; user-select: text; }
input[type="file"] { font-size: 12px; font-weight: 400; color: var(--soft); max-width: 100%; }
.composer { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: .5px solid var(--line); }
.composer .counter { font-size: 11px; font-weight: 400; color: var(--mute); font-variant-numeric: tabular-nums; align-self: flex-end; }
.composer .attached { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--soft); overflow-wrap: anywhere; }
.composer .actions, .answer-row { display: flex; justify-content: flex-end; gap: 6px; }
.answer-row { justify-content: flex-start; }
.card.faded { opacity: .55; }
select { min-height: 30px; font: inherit; font-size: 12px; font-weight: 400; border-radius: 7px; border: .5px solid var(--edge); padding: 0 6px; background: var(--card); color: var(--ink); }
.choices { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 400; }
.choices label { display: flex; align-items: center; gap: 6px; }
.filepreview { margin: 0; max-height: 160px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ink); padding: 8px 10px; border-radius: 8px; background: var(--well); -webkit-user-select: text; user-select: text; }
.answer-row .act { padding-inline: 4px; border-color: transparent; background: transparent; color: var(--soft); box-shadow: none; }
.notice { border-radius: 8px; padding: 9px 11px; background: var(--accent-soft); color: var(--ink); font-size: 12px; }
.notice.error { background: transparent; border: .5px solid var(--warn); color: var(--ink); }
.notice.error button { margin-top: 8px; }
.loading { display: flex; flex-direction: column; gap: 10px; }
.loading div { height: 64px; border-radius: 10px; background: var(--well); animation: breathe 1.2s ease-in-out infinite alternate; }
@keyframes breathe { to { opacity: .5; } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
code { font: 11px/1.4 ui-monospace, SFMono-Regular, monospace; word-break: break-all; white-space: pre-wrap; display: block; padding: 8px 10px;
  border-radius: 7px; background: var(--well); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition-property: opacity, background-color, color !important; }
  .card.leaving, button.act:active, .switch:active span { transform: none; } .switch[aria-checked="true"] span { transform: translateX(13px); } }
@media (prefers-reduced-transparency: reduce) { body { background: var(--ground); } header { background: var(--ground); -webkit-backdrop-filter: none; backdrop-filter: none; } }
@media (prefers-contrast: more) { :root { --edge: #8C8981; --line: #B5B2AB; --mute: #4A4843; } .card, .list, button.act { border-width: 1px; } }
</style>
</head>
<body>
<div id="edge" aria-hidden="true"></div>
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
  var focusNext = null;
  // The fact being written in « Ce que je publie » (T4.4), kept across live refreshes.
  var factDraft = null;

  function announce(message) {
    document.getElementById('announcement').textContent = message;
  }

  function api(method, path, body, form) {
    var headers = { Authorization: 'Bearer ' + token };
    var payload;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    return fetch(path, { method: method, headers: headers, body: payload }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) { var error = new Error((data && data.message) || 'Action impossible. Réessaie dans un instant.'); error.code = data && data.code; throw error; }
        return data;
      });
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

  // Phosphor Icons regular set (MIT, phosphoricons.com): check, lock-simple, check-circle.
  var ICONS = {
    give: 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
    keep: 'M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z',
    calm: 'M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z'
  };

  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
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
    var names = { claude_code: 'Claude Code', claude_desktop: 'Claude Desktop', cursor: 'Cursor', codex: 'Codex', other: 'un autre agent' };
    return names[agent] || agent.replace(/_/g, ' ');
  }

  var CODES = {
    E_CLI_MISSING: 'Outil en ligne de commande introuvable sur ce Mac. Installe-le, puis relance l’analyse.',
    E_CONFIG_INVALID_OR_UNREADABLE: 'Configuration de cet agent illisible. Corrige-la ou ajoute drop à la main.',
    E_DROP_CONFLICT: 'Un serveur nommé drop existe déjà avec une autre commande.',
    E_CONFIG_CHANGED: 'La configuration a changé depuis l’analyse. Relance l’analyse.',
    E_CLI_COMMAND: 'L’agent n’a pas accepté l’ajout du connecteur. Réessaie ou ajoute drop à la main.',
    E_CLI_UNVERIFIED: 'L’agent n’a pas confirmé l’ajout du connecteur. Réessaie ou ajoute drop à la main.',
    E_AGENT_INVALID: 'Agent non pris en charge.',
    E_SECRET_DETECTED: 'Secret détecté dans ta réponse : retire-le, rien n’est parti.',
    E_TOO_LARGE: 'Réponse trop longue : 8 000 caractères et un fichier de 128 Kio au plus.',
    E_SCHEMA: 'Réponse vide ou fichier illisible : écris un texte ou joins un fichier texte.'
  };

  function explain(detail) {
    return CODES[detail] ? CODES[detail] + ' (' + detail + ')' : detail;
  }

  function initials(name) {
    return name.split(/\\s+/).map(function (part) { return part.charAt(0); }).join('').slice(0, 2).toUpperCase();
  }

  var USD = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });
  var seen = {};
  // Hand-written answers being composed, by dropId: a live refresh rebuilds the card without losing them (T4.3).
  var drafts = {};

  function costLine(card, requester) {
    if (!card.cost) return null;
    if (card.cost.kind === 'free') return 'Coût : gratuit.';
    var payer = card.paidBy === 'requester' ? 'payé par ' + requester : 'à ta charge';
    if (card.cost.kind === 'capped') return 'Coût max : ' + USD.format(card.cost.maxUsd) + ', ' + payer + '.';
    return 'Coût : ' + payer + ', non mesuré.';
  }

  function decide(path, dropId, decision, button) {
    button.disabled = true;
    api('POST', path, undefined, { dropId: dropId, decision: decision }).then(function () {
      var card = button.closest('.card');
      if (card) card.classList.add('leaving');
      info = decision === 'allow_once' ? 'Demande autorisée une fois.' : decision === 'deny' ? 'Demande refusée.' : decision === 'not_now' ? 'Demande reportée.' : decision === 'send' ? 'Réponse envoyée.' : 'Réponse conservée sur ce Mac.';
      announce(info);
      setTimeout(function () { render(true); }, 160);
    }, function (error) { notice = error.message; announce('Action impossible. ' + notice); render(true); });
  }

  // True while a field or a box in the view has the focus: only then is a refresh deferred.
  function editing() {
    var active = document.activeElement;
    return Boolean(active && active.closest('#view') && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT'));
  }

  function countdown(expiresAt) {
    var seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (rest < 10 ? '0' : '') + rest;
  }

  // The expiry line of every visible card counts down each second; an expired card leaves at the next refresh.
  setInterval(function () {
    var expired = false;
    Array.prototype.forEach.call(document.querySelectorAll('[data-expires]'), function (node) {
      var at = Number(node.getAttribute('data-expires'));
      node.textContent = 'Expire dans ' + countdown(at);
      if (at <= Date.now()) expired = true;
    });
    if (expired && !editing()) render();
  }, 1000);

  var MEDIA = { md: 'text/markdown', csv: 'text/csv', json: 'application/json' };

  // Moves the focus to a given control after the next render, so keyboard and VoiceOver users keep their place.
  function focusTo(key) {
    focusNext = key;
    render();
  }

  function attach(item, draft, input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 128 * 1024) { notice = explain('E_TOO_LARGE'); announce(notice); input.value = ''; focusTo(item.dropId + ':file'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var content = String(reader.result);
      // readAsText replaces bytes that are not UTF-8: what would leave is not what the file says.
      if (content.indexOf('\\uFFFD') !== -1) { notice = 'Fichier illisible : enregistre-le en UTF-8, puis joins-le à nouveau.'; announce(notice); focusTo(item.dropId + ':file'); return; }
      var ext = file.name.split('.').pop().toLowerCase();
      draft.file = { name: file.name, mediaType: MEDIA[ext] || 'text/plain', content: content, size: file.size };
      focusTo(item.dropId + ':unattach');
    };
    reader.onerror = function () { notice = explain('E_SCHEMA'); announce(notice); focusTo(item.dropId + ':file'); };
    reader.readAsText(file);
  }

  function sendAnswer(item, draft, button) {
    var file = draft.file ? { name: draft.file.name, mediaType: draft.file.mediaType, content: draft.file.content } : undefined;
    var payload = { dropId: item.dropId, text: draft.text, file: file };
    if (new Blob([JSON.stringify(payload)]).size > 160 * 1024) {
      draft.stage = 'write';
      notice = explain('E_TOO_LARGE');
      announce('Action impossible. ' + notice);
      focusTo(item.dropId + ':answer');
      return;
    }
    button.disabled = true;
    api('POST', '/ui/answer', payload).then(function () {
      delete drafts[item.dropId];
      var card = button.closest('.card');
      if (card) card.classList.add('leaving');
      info = 'Réponse envoyée.';
      announce(info);
      setTimeout(function () { render(true); }, 160);
    }, function (error) {
      draft.stage = 'write';
      notice = error.code === 'E_SECRET_DETECTED' ? error.message + ' (E_SECRET_DETECTED)' : error.code ? explain(error.code) : error.message;
      announce('Action impossible. ' + notice);
      focusTo(item.dropId + ':answer');
    });
  }

  // « Répondre moi-même » (T4.3): write, then review exactly what will leave, then send. Nothing leaves before « Envoyer ».
  // When the capability lives on another node, that node receives the answer first: it is named from the local peer
  // store (executorName), never from the card a peer sent.
  function composer(item, who) {
    var draft = drafts[item.dropId];
    var route = item.executorName ? el('div', { class: 'cost', text: 'Ta réponse part chez ' + item.executorName + ', qui gère cet outil, puis vers ' + who + '.' }) : null;
    var close = el('button', { class: 'act', 'data-focus': item.dropId + ':cancel', onclick: function () { delete drafts[item.dropId]; focusTo(item.dropId + ':compose'); } }, 'Annuler');
    if (draft.stage === 'review') {
      return el('div', { class: 'composer', role: 'group', 'aria-label': 'Ta réponse, à relire' },
        el('div', { class: 'label', text: item.executorName ? item.executorName + ' recevra exactement, pour ' + who + ' :' : who + ' recevra exactement :' }),
        draft.text.trim() ? el('p', { class: 'quote', text: draft.text }) : null,
        draft.file ? el('div', { class: 'attached', text: 'Fichier : ' + draft.file.name + ' (' + Math.ceil(draft.file.size / 1024) + ' Kio, ' + draft.file.content.replace(/\\n$/, '').split('\\n').length + ' lignes)' }) : null,
        draft.file ? el('pre', { class: 'filepreview', tabindex: '0', 'aria-label': 'Contenu de ' + draft.file.name, text: draft.file.content }) : null,
        el('div', { class: 'cost', text: 'Les secrets reconnus bloquent l’envoi. Rien n’est parti.' }),
        el('div', { class: 'actions' },
          el('button', { class: 'act', 'data-focus': item.dropId + ':edit', onclick: function () { draft.stage = 'write'; focusTo(item.dropId + ':answer'); } }, 'Modifier'),
          el('button', { class: 'act fill', 'data-focus': item.dropId + ':send', 'aria-label': 'Envoyer ta réponse : ' + item.card.title, onclick: function (event) { sendAnswer(item, draft, event.currentTarget); } }, 'Envoyer')));
    }
    var counter = el('span', { class: 'counter', 'aria-live': 'off', text: draft.text.length + ' / 8 000' });
    var text = el('textarea', { maxlength: '8000', rows: '5', 'data-focus': item.dropId + ':answer', 'aria-label': 'Ta réponse à ' + who });
    text.value = draft.text;
    text.addEventListener('input', function () { draft.text = text.value; counter.textContent = draft.text.length + ' / 8 000'; });
    var picker = el('input', { type: 'file', 'data-focus': item.dropId + ':file', accept: '.txt,.md,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json', 'aria-label': 'Joindre un fichier texte' });
    picker.addEventListener('change', function () { attach(item, draft, picker); });
    return el('div', { class: 'composer', role: 'group', 'aria-label': 'Répondre moi-même' },
      el('label', { class: 'field' }, 'Ta réponse', text), counter, route,
      draft.file
        ? el('div', { class: 'attached' }, 'Fichier : ' + draft.file.name,
          el('button', { class: 'act', 'data-focus': item.dropId + ':unattach', onclick: function () { draft.file = null; focusTo(item.dropId + ':file'); } }, 'Retirer'))
        : el('label', { class: 'field' }, 'Fichier texte (facultatif, 128 Kio au plus)', picker),
      el('div', { class: 'actions' }, close,
        el('button', { class: 'act fill', 'data-focus': item.dropId + ':review', onclick: function () {
          if (!draft.text.trim() && !draft.file) { text.setAttribute('aria-invalid', 'true'); announce('Écris une réponse ou joins un fichier.'); text.focus(); return; }
          draft.stage = 'review';
          focusTo(item.dropId + ':send');
        } }, 'Relire la réponse')));
  }

  function approvalCard(item) {
    var who = item.requestedBy.displayName;
    var cost = costLine(item.card, who);
    var first = firstName(who);
    return el('article', { class: 'card ask' + fresh(item.dropId), 'aria-label': who + ' : ' + item.card.title },
      el('div', { class: 'who' }, el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(who) }),
        el('div', { class: 'grow' }, el('div', {}, el('span', { class: 'name', text: who }), ' a besoin d’aide'),
          el('div', { class: 'muted', text: 'via ' + agentName(item.requestedBy.agent) }))),
      el('div', { class: 'name', text: item.card.title }),
      el('p', { class: 'quote', text: '« ' + item.inputPreview + ' »' }),
      el('div', { class: 'why' }, el('b', { text: 'Pourquoi : ' }), item.purpose),
      el('div', { class: 'ledger' },
        el('div', { class: 'give' }, icon('give'), el('div', {}, el('div', { class: 'label', text: who + ' recevra :' }), list(item.card.receives))),
        el('div', { class: 'keep' }, icon('keep'), el('div', {}, el('div', { class: 'label', text: who + ' ne recevra jamais :' }), list(item.card.neverReceives)))),
      cost ? el('div', { class: 'cost', text: cost }) : null,
      item.card.sensitivity === 'high' ? el('div', { class: 'cost', text: 'Sensibilité haute : tu reliras le résultat avant envoi.' }) : null,
      el('div', { class: 'cost', 'data-expires': String(item.expiresAt), text: 'Expire dans ' + countdown(item.expiresAt) }),
      el('div', { class: 'decision-actions' },
        el('button', { class: 'act subtle', autofocus: 'autofocus', 'data-focus': item.dropId + ':not_now', 'aria-label': 'Reporter : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'not_now', event.currentTarget); } }, 'Pas maintenant'),
        el('button', { class: 'act', 'data-focus': item.dropId + ':deny', 'aria-label': 'Refuser : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'deny', event.currentTarget); } }, 'Refuser'),
        el('button', { class: 'act fill', 'data-focus': item.dropId + ':allow', 'aria-label': 'Autoriser une fois : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'allow_once', event.currentTarget); } }, 'Autoriser une fois')),
      drafts[item.dropId]
        ? composer(item, who)
        : el('div', { class: 'answer-row' }, el('button', { class: 'act', 'data-focus': item.dropId + ':compose', 'aria-label': 'Répondre moi-même : ' + item.card.title, onclick: function () {
          drafts[item.dropId] = { stage: 'write', text: '', file: null };
          focusTo(item.dropId + ':answer');
        } }, 'Répondre moi-même')));
  }

  function fresh(dropId) {
    if (seen[dropId]) return '';
    seen[dropId] = true;
    return ' fresh';
  }

  function reviewCard(item) {
    var fields = el('dl', { class: 'fields' });
    var output = item.output || {};
    var removals = [];
    Object.keys(output).forEach(function (key) {
      var value = output[key];
      var box = el('input', { type: 'checkbox', 'aria-label': 'Retirer ' + key + ' avant l’envoi' });
      removals.push({ key: key, box: box });
      fields.appendChild(el('dt', { text: key }));
      fields.appendChild(el('dd', {}, el('div', { text: Array.isArray(value) ? value.join(', ') : String(value) }),
        el('label', { class: 'muted redact' }, box, ' Retirer')));
    });
    function send(event) {
      var button = event.currentTarget;
      button.disabled = true;
      var form = new URLSearchParams();
      form.append('dropId', item.dropId);
      form.append('decision', 'send');
      removals.forEach(function (removal) { if (removal.box.checked) form.append('redact', removal.key); });
      api('POST', '/ui/review', undefined, form).then(function () {
        var card = button.closest('.card');
        if (card) card.classList.add('leaving');
        info = 'Réponse envoyée.';
        announce(info);
        setTimeout(function () { render(true); }, 160);
      }, function (error) { notice = error.message; announce('Action impossible. ' + notice); render(true); });
    }
    return el('article', { class: 'card ask' + fresh(item.dropId), 'aria-label': 'À relire : ' + item.title },
      el('div', {}, el('div', { class: 'name', text: item.title }),
        el('div', { class: 'muted', text: 'À relire avant envoi. Rien n’est parti : tu peux envoyer ou garder pour toi.' })),
      fields,
      el('div', { class: 'actions' },
        el('button', { class: 'act', 'aria-label': 'Ne pas envoyer : ' + item.title, onclick: function (event) { decide('/ui/review', item.dropId, 'discard', event.currentTarget); } }, 'Ne pas envoyer'),
        el('button', { class: 'act fill', 'aria-label': 'Envoyer : ' + item.title, onclick: send }, 'Envoyer')));
  }

  var STATES = { proposed: 'envoyée', awaiting_approval: 'en attente', approved: 'acceptée', running: 'en cours', in_review: 'relue',
    delivered: 'reçue', receipted: 'reçue', denied: 'refusée', not_now: 'pas maintenant', expired: 'expirée', failed: 'échouée' };
  var TONES = { delivered: 'ok', receipted: 'ok', denied: 'bad', failed: 'bad', expired: '', not_now: '' };

  function renderRequests(view) {
    return Promise.all([api('GET', '/ui/pending'), api('GET', '/ui/outbound')]).then(function (data) {
      var pending = data[0].pending;
      // A draft whose card was decided, answered elsewhere or expired leaves the page memory with it.
      Object.keys(drafts).forEach(function (id) { if (!pending.some(function (item) { return item.dropId === id; })) delete drafts[id]; });
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
        var name = el('input', { type: 'text', name: 'team', autocomplete: 'off', spellcheck: 'false', placeholder: 'Ex. Atlas…' });
        view.appendChild(el('div', { class: 'card' },
          el('div', {}, el('div', { class: 'name', text: 'Pas encore d’équipe' }),
            el('div', { class: 'muted', text: 'Crée-la, puis invite tes collègues : chacun verra les outils des autres.' })),
          el('label', { class: 'field' }, 'Nom de l’équipe', name),
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

  var DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  function factForm(peers) {
    var draft = factDraft;
    function field(label, node) { return el('label', { class: 'field' }, label, node); }
    function bound(node, key) { node.value = draft[key]; node.addEventListener('input', function () { draft[key] = node.value; }); return node; }
    var topic = bound(el('input', { type: 'text', maxlength: '120', 'data-focus': 'fact:topic' }), 'topic');
    var statement = bound(el('textarea', { maxlength: '1000', rows: '4', 'data-focus': 'fact:statement' }), 'statement');
    var keywords = bound(el('input', { type: 'text', maxlength: '330', placeholder: 'Ex. déploiement, mise en production' }), 'keywords');
    var label = bound(el('input', { type: 'text', maxlength: '200', placeholder: 'Ex. Planning des releases' }), 'label');
    var url = bound(el('input', { type: 'url', maxlength: '500', placeholder: 'https://… (facultatif)' }), 'url');
    var days = el('select', {}, el('option', { value: '7', text: '7 jours' }), el('option', { value: '30', text: '30 jours' }),
      el('option', { value: '90', text: '90 jours' }), el('option', { value: '365', text: '1 an' }));
    if (!days.querySelector('option[value="' + draft.validDays + '"]')) days.appendChild(el('option', { value: String(draft.validDays), text: draft.validDays + ' jours' }));
    days.value = String(draft.validDays);
    days.addEventListener('change', function () { draft.validDays = Number(days.value); });
    var team = el('input', { type: 'radio', name: 'audience', value: 'team' });
    var chosen = el('input', { type: 'radio', name: 'audience', value: 'peers' });
    team.checked = draft.audience === 'team';
    chosen.checked = draft.audience === 'peers';
    team.addEventListener('change', function () { draft.audience = 'team'; render(); });
    chosen.addEventListener('change', function () { draft.audience = 'peers'; render(); });
    var people = el('div', { class: 'choices' });
    if (draft.audience === 'peers') peers.forEach(function (peer) {
      var box = el('input', { type: 'checkbox' });
      box.checked = draft.nodeIds.indexOf(peer.nodeId) !== -1;
      box.addEventListener('change', function () {
        draft.nodeIds = draft.nodeIds.filter(function (id) { return id !== peer.nodeId; });
        if (box.checked) draft.nodeIds.push(peer.nodeId);
      });
      people.appendChild(el('label', {}, box, peer.displayName));
    });
    function submit(event) {
      var button = event.currentTarget;
      if (!draft.topic.trim() || !draft.statement.trim() || !draft.label.trim()) { announce('Sujet, énoncé et source sont nécessaires.'); topic.focus(); return; }
      button.disabled = true;
      var body = {
        topic: draft.topic, statement: draft.statement, validDays: draft.validDays,
        keywords: draft.keywords.split(',').map(function (word) { return word.trim(); }).filter(Boolean),
        source: draft.url.trim() ? { label: draft.label, url: draft.url.trim() } : { label: draft.label },
        audience: draft.audience === 'team' ? { kind: 'team' } : { kind: 'peers', nodeIds: draft.nodeIds }
      };
      api('POST', draft.factId ? '/ui/facts/' + draft.factId : '/ui/facts', body).then(function () {
        info = draft.factId ? 'Fait modifié : la nouvelle version remplace l’ancienne.' : 'Fait publié : il est servi tel quel jusqu’à sa date de fin.';
        factDraft = null;
        announce(info);
        render(true);
      }, function (error) {
        notice = error.code === 'E_SECRET_DETECTED' ? error.message + ' (E_SECRET_DETECTED)' : error.code ? error.message + ' (' + error.code + ')' : error.message;
        announce('Action impossible. ' + notice);
        focusTo('fact:topic');
      });
    }
    return el('div', { class: 'card composer', role: 'group', 'aria-label': draft.factId ? 'Modifier le fait' : 'Publier un fait' },
      field('Sujet', topic), field('Énoncé', statement), field('Mots-clés (séparés par des virgules, 8 au plus)', keywords),
      field('Source', label), field('Lien de la source', url), field('Valable', days),
      el('div', { class: 'field' }, 'Public', el('div', { class: 'choices' },
        el('label', {}, team, 'Tous mes pairs appairés'), el('label', {}, chosen, 'Des personnes choisies')), people),
      el('div', { class: 'cost', text: 'Servi tel quel, sans te redemander, à ce public seulement. Les secrets reconnus bloquent la publication.' }),
      el('div', { class: 'actions' },
        el('button', { class: 'act', onclick: function () { factDraft = null; render(true); } }, 'Annuler'),
        el('button', { class: 'act fill', onclick: submit }, draft.factId ? 'Enregistrer' : 'Publier')));
  }

  // « Ce que je publie » (T4.4, D65): facts served as is to their audience, until their end date.
  function factsSection(view, data) {
    view.appendChild(el('h2', { text: 'Ce que je publie' }));
    if (!data) { view.appendChild(el('div', { class: 'notice error', role: 'alert', text: 'Impossible de lire tes faits publiés. Ils ne sont plus servis tant que ce n’est pas réglé.' })); return; }
    var names = {};
    data.peers.forEach(function (peer) { names[peer.nodeId] = peer.displayName; });
    if (factDraft) { view.appendChild(factForm(data.peers)); return; }
    if (data.facts.length === 0) view.appendChild(el('div', { class: 'card empty' },
      el('strong', { text: 'Rien de publié' }),
      el('div', { class: 'muted', text: 'Un fait publié est servi tel quel à ton équipe, sans te redemander, jusqu’à sa date de fin.' })));
    data.facts.forEach(function (fact) {
      var state = fact.status === 'retired' ? 'Retiré' : fact.live ? null : 'Expiré';
      var audience = fact.audience.kind === 'team' ? 'Tous mes pairs' : fact.audience.nodeIds.map(function (id) { return names[id] || 'un pair'; }).join(', ');
      view.appendChild(el('article', { class: 'card' + (fact.live ? '' : ' faded'), 'aria-label': fact.topic + (state ? ' (' + state + ')' : '') },
        el('div', { class: 'name', text: fact.topic + (state ? ' · ' + state : '') }),
        el('p', { class: 'quote', text: fact.statement }),
        el('div', { class: 'muted', text: 'Source : ' + fact.source.label + (fact.source.url ? ' (' + fact.source.url + ')' : '') }),
        el('div', { class: 'cost', text: 'Jusqu’au ' + DATE.format(fact.validTo) + ' · ' + audience + ' · servi ' + fact.served + ' fois' }),
        fact.status === 'active' ? el('div', { class: 'actions' },
          el('button', { class: 'act', 'aria-label': 'Retirer : ' + fact.topic, onclick: function (event) {
            event.currentTarget.disabled = true;
            api('POST', '/ui/facts/' + fact.factId + '/retire', {}).then(function () { info = 'Fait retiré : il n’est plus servi.'; announce(info); render(true); },
              function (error) { notice = error.message; render(true); });
          } }, 'Retirer'),
          el('button', { class: 'act', 'aria-label': 'Modifier : ' + fact.topic, onclick: function () {
            factDraft = { factId: fact.factId, topic: fact.topic, statement: fact.statement, keywords: fact.keywords.join(', '),
              label: fact.source.label, url: fact.source.url || '', validDays: Math.max(1, Math.round((fact.validTo - fact.publishedAt) / 86400000)),
              audience: fact.audience.kind, nodeIds: fact.audience.kind === 'peers' ? fact.audience.nodeIds.slice() : [] };
            focusTo('fact:topic');
          } }, 'Modifier')) : null));
    });
    view.appendChild(el('button', { class: 'act wide', onclick: function () {
      factDraft = { factId: null, topic: '', statement: '', keywords: '', label: '', url: '', validDays: 30, audience: 'team', nodeIds: [] };
      focusTo('fact:topic');
    } }, 'Publier un fait'));
  }

  function renderTools(view) {
    // A failing fact store must not take the rest of « Mes outils » down with it.
    var facts = api('GET', '/ui/facts').catch(function () { return null; });
    return Promise.all([api('GET', '/ui/admin/tools'), facts]).then(function (all) {
      var data = all[0];
      factsSection(view, all[1]);
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
        found.appendChild(el(checkbox ? 'label' : 'div', { class: 'row' }, checkbox,
          el('div', { class: 'grow' }, el('div', { class: 'name', text: plan.label }),
            el('div', { class: plan.state === 'error' || plan.state === 'conflict' ? 'error' : 'muted', text: explain(plan.detail) })),
          plan.state === 'already_connected' ? el('button', { class: 'act', onclick: function () {
            api('POST', '/ui/admin/onboarding', { selections: [{ agent: plan.agent, fingerprint: plan.fingerprint, action: 'disconnect' }] }).then(function (result) {
              info = result.results.map(function (item) { return agentName(item.agent) + ' : ' + explain(item.detail); }).join(' · ');
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
          info = result.results.map(function (item) { return agentName(item.agent) + ' : ' + explain(item.detail); }).join(' · ') + ' · Connecteur utilisable : à vérifier après relance. L’état de l’équipe apparaît en haut.';
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
    var focusKey = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-focus') : null;
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
      var wanted = focusNext && Array.prototype.find.call(next.querySelectorAll('[data-focus]'), function (node) { return node.getAttribute('data-focus') === focusNext; });
      focusNext = null;
      if (wanted) wanted.focus();
      else if (focusResult) {
        var target = next.querySelector('h2, [role="alert"], .notice, button');
        if (target) { target.setAttribute('tabindex', '-1'); target.focus(); }
      } else if (!document.activeElement || document.activeElement === document.body) {
        // Back on the button that had the focus before the refresh; otherwise « Pas maintenant », never « Autoriser ».
        var preferred = (focusKey && Array.prototype.find.call(next.querySelectorAll('[data-focus]'), function (node) { return node.getAttribute('data-focus') === focusKey; })) || next.querySelector('[autofocus]');
        if (preferred) preferred.focus();
      }
    }
    if (pendingInvite) {
      inviteCard(next);
      complete();
      return;
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

  // Opened from a drop://pair link (T4.14): show who invites, then pair only after « Rejoindre ». The code leaves the
  // URL at once and stays in this page's memory until the choice.
  var invitation = new URLSearchParams(location.search).get('pair');
  var pendingInvite = null;
  if (invitation) {
    history.replaceState(null, '', '/app?token=' + encodeURIComponent(token));
    api('POST', '/ui/pair/preview', undefined, { code: invitation }).then(function (preview) {
      pendingInvite = { code: invitation, displayName: preview.displayName, team: preview.team || '' };
      render(true);
    }, function () { notice = 'Ce lien d’invitation n’est plus valable. Demande-en un nouveau.'; render(true); });
  }

  function inviteCard(view) {
    var invite = pendingInvite;
    view.appendChild(el('div', { class: 'card ask' },
      el('div', { class: 'name', text: invite.team ? invite.displayName + ' t’invite dans l’équipe ' + invite.team : 'Invitation de ' + invite.displayName }),
      el('div', { class: 'muted', text: 'Nom et équipe annoncés par le lien : si tu ne l’attendais pas, vérifie avec la personne avant de rejoindre.' }),
      el('div', { class: 'muted', text: 'En rejoignant, vous verrez les outils partagés l’un de l’autre. Chaque question reste soumise à ton accord ; personne ne reçoit d’accès.' }),
      el('div', { class: 'actions' },
        el('button', { class: 'act', autofocus: 'autofocus', onclick: function () { pendingInvite = null; info = 'Invitation refusée.'; announce(info); render(true); } }, 'Refuser'),
        el('button', { class: 'act fill', onclick: function (event) {
          event.currentTarget.disabled = true;
          api('POST', '/ui/pair', undefined, { code: invite.code }).then(function () {
            pendingInvite = null;
            info = 'Invitation acceptée : tu rejoins l’équipe dans quelques secondes.';
            tab = 'team';
            announce(info);
            render(true);
          }, function () { pendingInvite = null; notice = 'Ce lien d’invitation n’est plus valable. Demande-en un nouveau.'; render(true); });
        } }, 'Rejoindre'))));
  }
  var events = new EventSource('/ui/events?token=' + encodeURIComponent(token));
  events.onmessage = function () {
    if (tab !== 'requests') return;
    if (editing()) { pendingRefresh = true; return; }
    render();
  };
  document.addEventListener('focusin', function (event) {
    if (pendingRefresh && !event.target.closest('#view')) { pendingRefresh = false; render(); }
  });
  new IntersectionObserver(function (entries) {
    document.querySelector('header').classList.toggle('edge', !entries[0].isIntersecting);
  }).observe(document.getElementById('edge'));
  render();
})();
</script>
</body>
</html>
`;
}
