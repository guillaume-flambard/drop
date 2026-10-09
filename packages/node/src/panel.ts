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
:root { color-scheme: light dark; --ground: #F7F6F3; --card: #FFFFFF; --ink: #1A1A19; --soft: #55534E; --mute: #6B6862; --line: #E4E2DC;
  --edge: #DAD8D2; --accent: #0E5F58; --accent-on: #FFFFFF; --accent-soft: #E3EFEC; --warn: #9A3412; --ok: #2E8B57; --wait: #C2850C; }
@media (prefers-color-scheme: dark) { :root { --ground: #1C1C1B; --card: #262624; --ink: #F2F1EE; --soft: #C9C6BE;
  --mute: #A29F97; --line: #34332F; --edge: #3D3C38; --accent: #5CC2B5; --accent-on: #122923; --accent-soft: #23403C; --warn: #F0A27A; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, sans-serif; }
button, input { font: inherit; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .55; cursor: wait; }
::selection { background: var(--accent); color: var(--accent-on); }
header { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; }
header strong { font-size: 17px; letter-spacing: -0.02em; }
.status { display: flex; align-items: center; gap: 6px; color: var(--soft); font-size: 12px; flex-grow: 1; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--edge); flex-shrink: 0; }
.dot.ok { background: var(--ok); } .dot.wait { background: var(--wait); }
nav { display: flex; gap: 4px; padding: 0 12px 10px; border-bottom: 1px solid var(--line); }
nav button { min-height: 40px; padding: 0 12px; border-radius: 8px; border: none; background: transparent;
  color: var(--soft); font: inherit; cursor: pointer; }
nav button[aria-selected="true"] { background: var(--ink); color: var(--ground); font-weight: 500; }
.badge { margin-left: 4px; font-size: 11px; padding: 1px 6px; border-radius: 999px; background: var(--accent); color: var(--accent-on); }
main { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
h2 { margin: 8px 4px 0; font-size: 13px; font-weight: 650; color: var(--ink); }
.card { background: var(--card); border: 1px solid var(--edge); border-radius: 12px; padding: 14px; display: flex;
  flex-direction: column; gap: 10px; }
.row { display: flex; align-items: center; gap: 10px; }
.grow { flex-grow: 1; min-width: 0; }
.muted { color: var(--mute); font-size: 12px; }
.quote { background: var(--ground); border-radius: 8px; padding: 10px; }
.receives b { color: var(--accent); } .never b { color: var(--warn); }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.decision-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.decision-actions button { min-width: 0; padding-inline: 6px; }
.decision-actions .subtle { grid-column: 1 / -1; border-color: transparent; background: transparent; color: var(--soft); }
button.act { min-height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--edge); background: var(--card);
  color: var(--ink); font: inherit; cursor: pointer; }
button.accent { border-color: var(--accent); color: var(--accent); font-weight: 500; }
button.fill { background: var(--accent); border-color: var(--accent); color: var(--accent-on); }
.list { background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.list > div { padding: 10px 12px; border-bottom: 1px solid var(--line); }
.list > div:last-child { border-bottom: none; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { font-size: 12px; padding: 3px 8px; border-radius: 999px; background: var(--ground); border: 1px solid var(--line); }
.avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 600;
  font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.switch { width: 44px; height: 26px; border-radius: 999px; border: none; padding: 3px; display: flex; cursor: pointer;
  background: var(--edge); justify-content: flex-start; flex-shrink: 0; }
.switch[aria-checked="true"] { background: var(--accent); justify-content: flex-end; }
.switch span { width: 20px; height: 20px; border-radius: 50%; background: #fff; display: block; }
.empty { border: 1px dashed var(--edge); border-radius: 12px; padding: 14px; color: var(--soft); text-align: center; }
input[type="text"] { min-height: 40px; border-radius: 8px; border: 1px solid var(--edge); padding: 0 10px; font: inherit;
  background: var(--card); color: var(--ink); width: 100%; }
.error { color: var(--warn); font-size: 12px; }
.notice { border: 1px solid var(--edge); border-radius: 10px; padding: 10px 12px; background: var(--card); }
.notice.error { border-color: var(--warn); }
.loading { color: var(--soft); padding: 16px 4px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
code { font: 11px ui-monospace, monospace; word-break: break-all; }
</style>
</head>
<body>
<header>
  <strong>drop</strong>
  <div class="status"><span class="dot" id="relay-dot" aria-hidden="true"></span><span id="status-text" role="status" aria-live="polite">Connexion…</span></div>
</header>
<nav role="tablist" aria-label="Sections de drop">
  <button role="tab" id="tab-requests" aria-controls="view" aria-selected="true" tabindex="0">Demandes<span class="badge" id="badge" hidden></span></button>
  <button role="tab" id="tab-team" aria-controls="view" aria-selected="false" tabindex="-1">Équipe</button>
  <button role="tab" id="tab-tools" aria-controls="view" aria-selected="false" tabindex="-1">Mes outils</button>
</nav>
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
    return el('div', { class: 'card' },
      el('div', { class: 'row' }, el('span', { class: 'avatar', text: initials(who) }),
        el('div', { class: 'grow' }, el('div', { text: who + ' a besoin d’aide' }),
          el('div', { class: 'muted', text: 'via ' + item.requestedBy.agent.replace('_', ' ') }))),
      el('strong', { text: item.card.title }),
      el('div', { class: 'quote', text: '« ' + item.inputPreview + ' »' }),
      el('div', { class: 'muted', text: 'Pourquoi : ' + item.purpose }),
      el('div', { class: 'receives' }, el('b', { text: 'Reçoit ' }), item.card.receives.join(', ')),
      el('div', { class: 'never' }, el('b', { text: 'Ne reçoit jamais ' }), item.card.neverReceives.join(', ')),
      cost ? el('div', { class: 'muted', text: cost }) : null,
      el('div', { class: 'actions decision-actions' },
        el('button', { class: 'act', 'aria-label': 'Refuser : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'deny', event.currentTarget); } }, 'Refuser'),
        el('button', { class: 'act fill', 'aria-label': 'Autoriser une fois : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'allow_once', event.currentTarget); } }, 'Autoriser une fois'),
        el('button', { class: 'act subtle', 'aria-label': 'Reporter : ' + item.card.title, onclick: function (event) { decide('/ui/decide', item.dropId, 'not_now', event.currentTarget); } }, 'Pas maintenant')));
  }

  function reviewCard(item) {
    var fields = el('div', { class: 'quote' });
    var output = item.output || {};
    Object.keys(output).forEach(function (key) {
      var value = output[key];
      fields.appendChild(el('div', {}, el('span', { class: 'muted', text: key + ' ' }), Array.isArray(value) ? value.join(', ') : String(value)));
    });
    return el('div', { class: 'card' },
      el('strong', { text: 'À relire avant envoi : ' + item.title }),
      el('div', { class: 'muted', text: 'Rien n’est parti. Tu peux envoyer ou garder pour toi.' }),
      fields,
      el('div', { class: 'actions' },
        el('button', { class: 'act', 'aria-label': 'Ne pas envoyer : ' + item.title, onclick: function (event) { decide('/ui/review', item.dropId, 'discard', event.currentTarget); } }, 'Ne pas envoyer'),
        el('button', { class: 'act fill', 'aria-label': 'Envoyer : ' + item.title, onclick: function (event) { decide('/ui/review', item.dropId, 'send', event.currentTarget); } }, 'Envoyer')));
  }

  var STATES = { proposed: 'envoyée', awaiting_approval: 'en attente', approved: 'acceptée', running: 'en cours', in_review: 'relue',
    delivered: 'reçue', receipted: 'reçue', denied: 'refusée', not_now: 'pas maintenant', expired: 'expirée', failed: 'échouée' };

  function renderRequests(view) {
    return Promise.all([api('GET', '/ui/pending'), api('GET', '/ui/outbound')]).then(function (data) {
      var pending = data[0].pending;
      var badge = document.getElementById('badge');
      badge.hidden = pending.length === 0;
      badge.textContent = String(pending.length);
      view.appendChild(el('h2', { text: 'À décider' }));
      if (pending.length === 0) view.appendChild(el('div', { class: 'empty', text: 'Rien à décider. Une notification arrivera quand quelqu’un aura besoin de toi.' }));
      pending.forEach(function (item) { view.appendChild(item.kind === 'approval' ? approvalCard(item) : reviewCard(item)); });
      var drops = data[1].drops;
      if (drops.length > 0) {
        view.appendChild(el('h2', { text: 'Mes questions' }));
        var list = el('div', { class: 'list' });
        drops.slice(0, 10).forEach(function (drop) {
          var done = drop.result || drop.state === 'delivered' || drop.state === 'receipted';
          list.appendChild(el('div', { class: 'row' },
            el('span', { class: 'dot ' + (done ? 'ok' : drop.error ? '' : 'wait') }),
            el('div', { class: 'grow' }, el('div', { text: drop.ownerName + ' · ' + drop.title })),
            el('span', { class: 'muted', text: STATES[drop.state] || drop.state })));
        });
        view.appendChild(list);
      }
    });
  }

  function renderTeam(view) {
    return api('GET', '/ui/team').then(function (data) {
      if (!data.team) {
        var name = el('input', { type: 'text', placeholder: 'Nom de l’équipe', 'aria-label': 'Nom de l’équipe' });
        view.appendChild(el('div', { class: 'card' },
          el('strong', { text: 'Pas encore d’équipe' }),
          el('div', { class: 'muted', text: 'Crée-la, puis invite tes collègues : chacun verra les outils des autres.' }),
          name,
          el('button', { class: 'act fill', onclick: function () {
            if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); announce('Donne un nom à l’équipe.'); name.focus(); return; }
            api('POST', '/ui/admin/team', { name: name.value.trim() }).then(function () { info = 'Équipe créée.'; announce(info); render(true); }, function (error) { notice = error.message; render(true); });
          } }, 'Créer l’équipe')));
        return;
      }
      view.appendChild(el('h2', { text: data.team.name + ' · ' + data.members.length + ' membres' }));
      data.members.forEach(function (member) {
        var chips = el('div', { class: 'chips' });
        member.capabilities.forEach(function (capability) { chips.appendChild(el('span', { class: 'chip', text: capability.title.replace('Répondre à partir de ', '') })); });
        view.appendChild(el('div', { class: 'card' },
          el('div', { class: 'row' }, el('span', { class: 'avatar', text: initials(member.displayName) }),
            el('div', { class: 'grow' }, el('div', { text: member.displayName + (member.self ? ' (toi)' : '') }),
              el('div', { class: 'muted', text: member.agents.join(', ') || 'aucun agent signalé' })),
            el('span', { class: 'dot ' + (member.online ? 'ok' : '') }),
            el('span', { class: 'muted', text: member.online ? 'en ligne' : 'hors ligne' })),
          member.capabilities.length > 0 ? chips : null));
      });
      var code = el('div', {});
      view.appendChild(el('button', { class: 'act', onclick: function () {
        api('POST', '/ui/invite').then(function (data) {
          var link = 'drop://pair?code=' + encodeURIComponent(data.code);
          code.textContent = '';
          code.appendChild(el('div', { class: 'card' }, el('div', { class: 'muted', text: 'Envoie ce lien, valable 24 h, une seule fois :' }), el('code', { text: link }),
            el('button', { class: 'act accent', onclick: function () { navigator.clipboard.writeText(link); } }, 'Copier')));
        });
      } }, 'Inviter quelqu’un dans l’équipe'));
      view.appendChild(code);
    });
  }

  function renderTools(view) {
    return api('GET', '/ui/admin/tools').then(function (data) {
      view.appendChild(el('h2', { text: 'Connecter mes agents' }));
      view.appendChild(el('div', { class: 'muted', text: '1. Analyse locale des quatre agents compatibles. 2. Choisis puis confirme les connecteurs à ajouter. Aucun outil ne sera partagé.' }));
      view.appendChild(el('button', { class: 'act', onclick: function () {
        api('GET', '/ui/admin/onboarding').then(function (result) { onboardingPlans = result.agents; manualConnector = result.manual; render(true); }, function (error) { notice = error.message; render(true); });
      } }, '1. Analyser ce Mac'));
      var plans = onboardingPlans || [];
      var selectable = [];
      plans.forEach(function (plan) {
        if (plan.state === 'absent') return;
        var checkbox = plan.state === 'ready' ? el('input', { type: 'checkbox', 'aria-label': 'Connecter ' + plan.label }) : null;
        if (checkbox) { checkbox.checked = true; selectable.push({ plan: plan, checkbox: checkbox }); }
        view.appendChild(el('div', { class: 'card' },
          el('div', { class: 'row' }, checkbox, el('strong', { text: plan.label })),
          el('div', { class: plan.state === 'error' || plan.state === 'conflict' ? 'error' : 'muted', text: plan.detail }),
          plan.state === 'already_connected' ? el('button', { class: 'act', onclick: function () {
            api('POST', '/ui/admin/onboarding', { selections: [{ agent: plan.agent, fingerprint: plan.fingerprint, action: 'disconnect' }] }).then(function (result) {
              info = result.results.map(function (item) { return item.agent + ' : ' + item.detail; }).join(' · ');
              onboardingPlans = null;
              announce(info);
              render(true);
            }, function (error) { notice = error.message; render(true); });
          } }, 'Retirer ce connecteur') : null));
      });
      if (selectable.length > 0) view.appendChild(el('button', { class: 'act fill', onclick: function () {
        var selected = selectable.filter(function (item) { return item.checkbox.checked; }).map(function (item) {
          return { agent: item.plan.agent, fingerprint: item.plan.fingerprint, action: 'connect' };
        });
        if (!selected.length) return;
        api('POST', '/ui/admin/onboarding', { selections: selected }).then(function (result) {
          info = result.results.map(function (item) { return item.agent + ' : ' + item.detail; }).join(' · ') + ' · Connecteur utilisable : à vérifier après relance. L’état de l’équipe apparaît en haut.';
          onboardingPlans = null;
          announce(info);
          render(true);
        }, function (error) { notice = error.message; render(true); });
      } }, '2. Connecter les agents sélectionnés'));
      if (onboardingPlans && plans.every(function (plan) { return plan.state === 'absent'; })) view.appendChild(el('div', { class: 'empty', text: 'Aucun de ces quatre agents détecté. Tu peux ajouter manuellement le connecteur MCP drop dans ton agent.' }));
      view.appendChild(el('div', { class: 'muted', text: 'Autre agent ? Ajoute manuellement un serveur MCP stdio nommé drop. Aucune permission générale n’est nécessaire.' }));
      if (onboardingPlans && manualConnector) view.appendChild(el('div', { class: 'card' },
        el('strong', { text: 'Configuration manuelle' }),
        el('code', { text: JSON.stringify({ mcpServers: { drop: manualConnector } }, null, 2) }),
        el('div', { class: 'muted', text: 'Copie cette entrée dans la configuration MCP de ton agent, puis relance-le. Cela ne partage aucun outil.' })));
      view.appendChild(el('h2', { text: 'Mes outils' }));
      view.appendChild(el('div', { class: 'muted', text: 'Partager un outil, c’est répondre aux questions de l’équipe avec lui, après ton accord. Personne ne reçoit l’accès.' }));
      data.agents.forEach(function (agent) {
        if (!agent.installed) return;
        view.appendChild(el('h2', { text: agent.label }));
        var card = el('div', { class: 'list' });
        card.appendChild(el('div', { class: 'row' },
          el('div', { class: 'grow', text: agent.dropInstalled ? 'drop est installé dans ' + agent.label : 'drop n’est pas encore installé' })));
        agent.servers.forEach(function (server) {
          if (!server.shareable) return;
          var shared = data.shared[agent.agent + '/' + server.name];
          card.appendChild(el('div', { class: 'row' },
            el('div', { class: 'grow' }, el('div', { text: server.name }), el('div', { class: 'muted', text: (server.kind ? server.kind + ' · ' : '') + server.where })),
            el('button', { class: 'switch', role: 'switch', 'aria-checked': shared ? 'true' : 'false', 'aria-label': (shared ? 'Ne plus partager ' : 'Partager ') + server.name,
              onclick: function () {
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
            el('div', { class: 'grow' }, el('div', { text: link.clientName }), el('div', { class: 'muted', text: 'peut demander à ton équipe en ton nom' })),
            el('button', { class: 'act', onclick: function () {
              api('POST', '/ui/admin/unlink', { gateway: link.gateway, client: link.clientName }).then(render);
            } }, 'Retirer')));
        });
        view.appendChild(linked);
      }
      view.appendChild(el('div', { class: 'muted', text: 'Qui paie le modèle : ' + (data.payer === 'owner' ? 'toi' : 'celui qui demande') }));
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
    var loading = el('div', { class: 'loading', text: 'Chargement…' });
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
      document.getElementById('relay-dot').className = 'dot';
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
