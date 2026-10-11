import { request } from 'node:http';
import { Script } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { startLocalApi, type AdminHooks, type LocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import { renderPanel } from '../src/panel.ts';
import { renderWorkspace } from '../src/workspace.ts';
import { MemoryStore } from './helpers.ts';

const TOKEN = 'panel-token-0123456789abcdefghijklmn';
let api: LocalApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

function call(port: number, method: string, path: string, body?: unknown, auth = true) {
  return new Promise<{ status: number; headers: Record<string, unknown>; text: string }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Host: `127.0.0.1:${String(port)}`,
          ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text });
        });
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

describe('menu bar panel and its admin routes (T2.4)', () => {
  it('serves the panel only with the token, under a CSP that allows nothing but this node', async () => {
    const calls: string[] = [];
    const admin: AdminHooks = {
      status: () => ({ displayName: 'Julie', nodeId: 'n', relayConnected: true }),
      tools: () => ({ agents: [], shared: {}, payer: 'requester' }),
      share: (body) => {
        calls.push(`share ${body.agent}/${body.server}`);
        return Promise.resolve({ capabilityId: 'mcp.answer.figma' });
      },
      unshare: (id) => {
        calls.push(`unshare ${id}`);
        return true;
      },
      install: (agent, remove) => {
        calls.push(`${remove ? 'uninstall' : 'install'} ${agent}`);
        return { ok: true };
      },
      onboardingPreview: () => ({
        agents: [
          {
            agent: 'cursor',
            label: 'Cursor',
            state: 'ready',
            action: 'connect',
            fingerprint: 'a'.repeat(64),
            detail: 'Ajout du connecteur',
          },
        ],
        manual: { command: '/usr/bin/node', args: ['/app/drop-mcp.mjs'], env: { DROP_AGENT: 'other' } },
      }),
      onboardingApply: (selections) => {
        calls.push(`connect ${selections[0]?.agent ?? 'none'}`);
        return [{ agent: 'cursor', state: 'connected', detail: 'Configuration modifiée', restartRequired: true }];
      },
      link: (gateway, request) => {
        calls.push(`link ${request.clientName} (${request.redirectHost})`);
        return Promise.resolve({ ok: true, gateway });
      },
      unlink: (_gateway, client) => {
        calls.push(`unlink ${client}`);
        return true;
      },
      createTeam: (name) => {
        calls.push(`team ${name}`);
        return { ok: true };
      },
      connect: (agent, server) => {
        calls.push(`connect ${agent}/${server}`);
        return Promise.resolve({ connected: true });
      },
    };
    const engine = new NodeEngine({
      identity: await generateIdentity('Julie'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
    });
    api = await startLocalApi({
      engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://x/v1',
      shellInstance: 'shell-test-instance',
      refreshCatalogs: () => Promise.resolve(),
      admin,
    });
    const { port } = api;

    expect((await call(port, 'GET', '/app', undefined, false)).status).toBe(401);
    expect((await call(port, 'GET', '/workspace', undefined, false)).status).toBe(401);
    expect(JSON.parse((await call(port, 'GET', '/_shell/health', undefined, false)).text)).toEqual({
      instance: 'shell-test-instance',
    });
    const page = await call(port, 'GET', `/app?token=${TOKEN}`, undefined, false);
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    );
    const workspace = await call(port, 'GET', `/workspace?token=${TOKEN}`, undefined, false);
    expect(workspace.status).toBe(200);
    expect(workspace.headers['content-security-policy']).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    );
    expect(workspace.headers['referrer-policy']).toBe('no-referrer');
    expect(workspace.text).toContain('Outils partagés');
    expect(JSON.parse((await call(port, 'GET', '/ui/admin/status')).text)).toMatchObject({ relayConnected: true });
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code', server: 'figma' })).status).toBe(200);
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code' })).status).toBe(400);
    await call(port, 'POST', '/ui/admin/unshare', { capabilityId: 'mcp.answer.figma' });
    expect((await call(port, 'POST', '/ui/admin/install', { agent: 'cursor', remove: true })).status).toBe(409);
    expect((await call(port, 'GET', '/ui/admin/onboarding')).text).toContain('Ajout du connecteur');
    expect(
      (
        await call(port, 'POST', '/ui/admin/onboarding', {
          selections: [{ agent: 'cursor', fingerprint: 'bad', action: 'connect' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(port, 'POST', '/ui/admin/onboarding', {
          selections: [{ agent: 'cursor', fingerprint: 'a'.repeat(64), action: 'connect' }],
        })
      ).status,
    ).toBe(200);
    await call(port, 'POST', '/ui/admin/team', { name: 'Atlas' });
    expect(calls).toEqual(['share claude_code/figma', 'unshare mcp.answer.figma', 'connect cursor', 'team Atlas']);
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code', server: 'figma' }, false)).status).toBe(
      401,
    );
    expect(JSON.parse((await call(port, 'GET', '/ui/outbound')).text)).toEqual({ drops: [] });

    // Linking an assistant: the request must carry its client and return domain, which the gateway checks (T2.13).
    const link = { gateway: 'gw', session: 's'.repeat(24), client: 'Claude', clientId: 'c'.repeat(24) };
    expect((await call(port, 'POST', '/ui/admin/link', link)).status).toBe(400);
    expect((await call(port, 'POST', '/ui/admin/link', { ...link, redirect: 'claude.ai' })).status).toBe(200);
    expect(calls.at(-1)).toBe('link Claude (claude.ai)');
  });

  it('offers to sign in when a shared server needs OAuth, and links only an https sign-in page (T2.17)', () => {
    const html = renderPanel();
    expect(html).toContain("if (error.code === 'E_SHARE_OAUTH') signInOffer");
    expect(html).toContain("api('POST', '/ui/admin/connect', offer)");
    expect(html).toContain("if (signInLink.indexOf('https://') === 0)");
  });

  it('names the domain a linked assistant returns to, and warns when it is neither Claude nor ChatGPT', () => {
    const html = renderPanel();
    expect(html).toContain('var knownHosts = ["claude.ai","chatgpt.com","chat.openai.com"];');
    expect(html).toContain('qui n’est ni Claude ni ChatGPT');
    expect(html).toContain('clientId: request.clientId, redirect: request.redirect');
  });

  it('inserts what peers wrote as text only', () => {
    const html = renderPanel();
    expect(html).not.toContain('innerHTML');
    expect(html).not.toContain('insertAdjacentHTML');
    expect(html).toContain('node.textContent = a[key]');
    expect(html).toContain('1. Analyser ce Mac');
    expect(html).toContain('2. Connecter les agents sélectionnés');
    expect(html).toContain('Configuration manuelle');
    expect(html).toContain('hors ligne');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(script).toBeDefined();
    expect(() => new Script(script ?? '')).not.toThrow();
  });

  it('reports a failed invite, unlink or link copy instead of leaving its promise unhandled', () => {
    const html = renderPanel();
    const between = (start: string, end: string) =>
      html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
    expect(between("api('POST', '/ui/invite')", "'Inviter quelqu’un dans l’équipe'")).toContain(
      "function (error) { notice = error.message; announce('Action impossible. ' + notice); render(true); }",
    );
    expect(between("api('POST', '/ui/admin/unlink'", "'Retirer')")).toContain(
      "function (error) { notice = error.message; announce('Action impossible. ' + notice); render(true); }",
    );
    expect(between('navigator.clipboard.writeText(link)', "'Copier le lien'")).toContain("class: 'notice error'");
  });
});

describe('menu bar panel and its admin routes (T4.14)', () => {
  it('previews an invitation without pairing and pairs only after Rejoindre', async () => {
    const { createInvite, encodeInvite } = await import('@drop/protocol');
    const julie = await generateIdentity('Julie');
    const sent: unknown[] = [];
    const engine = new NodeEngine({
      identity: await generateIdentity('Natha'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: {
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve('sent');
        },
      },
    });
    api = await startLocalApi({
      engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://x/v1',
      refreshCatalogs: () => Promise.resolve(),
    });
    const code = encodeInvite(createInvite(julie, 'ws://x/v1'));
    const form = (value: string) => new URLSearchParams({ code: value }).toString();
    const preview = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: api?.port,
          path: '/ui/pair/preview',
          method: 'POST',
          headers: {
            Host: `127.0.0.1:${String(api?.port)}`,
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
        (res) => {
          let text = '';
          res.on('data', (chunk: Buffer) => {
            text += chunk.toString();
          });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, text });
          });
        },
      );
      req.on('error', reject);
      req.end(form(code));
    });
    expect(preview.status).toBe(200);
    expect(JSON.parse(preview.text)).toEqual({ displayName: 'Julie' });
    expect(sent).toHaveLength(0);
    expect((await call(api.port, 'POST', '/ui/pair/preview', undefined, false)).status).toBe(401);
    expect((await call(api.port, 'POST', '/ui/pair/preview', { code: 'not-a-code' })).status).toBe(400);
    const html = renderPanel();
    expect(html).toContain("'/ui/pair/preview'");
    // The one pairing call lives inside inviteCard, the « Rejoindre » handler; nothing pairs at load.
    const pairCalls = html.split("api('POST', '/ui/pair', undefined").length - 1;
    expect(pairCalls).toBe(1);
    const inviteCard = html.slice(html.indexOf('function inviteCard(view)'));
    const handler = inviteCard.slice(0, inviteCard.indexOf("'Rejoindre'"));
    expect(handler).toContain("api('POST', '/ui/pair', undefined");
  });

  it('renders expiry, high sensitivity, a default Pas maintenant and per-field redaction', () => {
    const html = renderPanel();
    expect(html).toContain('Expire dans ');
    expect(html).toContain('Sensibilité haute : tu reliras le résultat avant envoi.');
    // The keyboard default is « Pas maintenant », never « Autoriser ».
    expect(html).toMatch(/autofocus: 'autofocus', 'data-focus': item\.dropId \+ ':not_now'/);
    expect(html).not.toMatch(/autofocus: 'autofocus', 'data-focus': item\.dropId \+ ':allow'/);
    expect(html).toContain("el('b', { text: 'Pourquoi : ' })");
    expect(html).toContain("text: who + ' recevra :'");
    expect(html).toContain("text: who + ' ne recevra jamais :'");
    expect(html).toContain(
      "removals.forEach(function (removal) { if (removal.box.checked) form.append('redact', removal.key); });",
    );
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});

describe('menu bar panel (T4.3)', () => {
  it('offers to answer by hand, keeps the ledger visible and reviews the answer before sending', () => {
    const html = renderPanel();
    const card = html.slice(html.indexOf('function approvalCard(item)'), html.indexOf('function fresh(dropId)'));
    expect(card).toContain("'Répondre moi-même'");
    // The composer lives inside the decision card, after the ledger, which stays in place while writing.
    expect(card.indexOf("text: who + ' recevra :'")).toBeLessThan(card.indexOf('composer(item, who)'));
    const composer = html.slice(html.indexOf('function attach(item'), html.indexOf('function approvalCard(item)'));
    expect(composer).toContain("maxlength: '8000'");
    expect(composer).toContain("accept: '.txt,.md,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json'");
    expect(composer).toContain("'Relire la réponse'");
    expect(composer).toContain(": who + ' recevra exactement :'");
    // The first real recipient is named from the local peer store when the capability lives elsewhere (T4.3 review).
    expect(composer).toContain("'Ta réponse part chez ' + item.executorName");
    // The review shows the file content itself, as text only, and refuses a file that is not UTF-8.
    expect(composer).toContain(
      "el('pre', { class: 'filepreview', tabindex: '0', 'aria-label': 'Contenu de ' + draft.file.name, text: draft.file.content })",
    );
    expect(composer).toContain("content.indexOf('\\uFFFD') !== -1");
    expect(composer).toContain("focusTo(item.dropId + ':send')");
    expect(html).toContain('if (!pending.some(function (item) { return item.dropId === id; })) delete drafts[id];');
    // Only « Envoyer », in the review step, posts the answer; a draft survives the live refresh.
    expect(composer.split("api('POST', '/ui/answer'").length).toBe(2);
    const send = composer.slice(composer.indexOf('function sendAnswer('));
    expect(send).toContain("api('POST', '/ui/answer'");
    const builder = composer.slice(composer.indexOf('function composer(item, who)'));
    const review = builder.slice(builder.indexOf("if (draft.stage === 'review')"), builder.indexOf('var counter'));
    const write = builder.slice(builder.indexOf('var counter'));
    expect(review).toContain("'Envoyer'");
    expect(review).toContain('sendAnswer(item, draft');
    expect(write).not.toContain("'Envoyer'");
    expect(write).not.toContain('sendAnswer(');
    expect(html).toContain('var drafts = {};');
    expect(composer).toContain('drafts[item.dropId]');
    expect(html).toContain('E_SECRET_DETECTED:');
    expect(html).toContain('E_TOO_LARGE:');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});

describe('menu bar panel (T4.4)', () => {
  it('lists what I publish with add, edit and retire, and greys out an expired fact', () => {
    const html = renderPanel();
    const section = html.slice(
      html.indexOf('function factsSection(view, data)'),
      html.indexOf('function renderTools(view)'),
    );
    expect(section).toContain("el('h2', { text: 'Ce que je publie' })");
    expect(section).toContain("'Publier un fait'");
    expect(section).toContain("'Modifier'");
    expect(section).toContain("api('POST', '/ui/facts/' + fact.factId + '/retire', {})");
    // Expired or retired facts are greyed out and say so.
    expect(section).toContain("class: 'card' + (fact.live ? '' : ' faded')");
    expect(section).toContain("fact.status === 'retired' ? 'Retiré' : fact.live ? null : 'Expiré'");
    expect(section).toContain("' · servi ' + fact.served + ' fois'");
    // Statements and sources are inserted as text only.
    expect(section).toContain("el('p', { class: 'quote', text: fact.statement })");
    expect(section).not.toContain('innerHTML');
    const form = html.slice(
      html.indexOf('function factForm(peers)'),
      html.indexOf('function factsSection(view, data)'),
    );
    expect(form).toContain("api('POST', draft.factId ? '/ui/facts/' + draft.factId : '/ui/facts', body)");
    expect(form).toContain("'Tous mes pairs appairés'");
    expect(form).toContain("'Des personnes choisies'");
    expect(html).toContain("var facts = api('GET', '/ui/facts').catch(function () { return null; });");
    expect(section).toContain("'Impossible de lire tes faits publiés.");
    // Editing keeps the fact's own duration instead of resetting it.
    expect(section).toContain('validDays: Math.max(1, Math.round((fact.validTo - fact.publishedAt) / 86400000))');
    expect(html).toContain('.card.faded { opacity: .55; }');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});

describe('menu bar panel (T4.5)', () => {
  it('analyses thirteen clients, separates global and project configurations, and shows manual steps', () => {
    const html = renderPanel();
    expect(html).not.toContain('quatre agents');
    expect(html).toContain(
      "'Analyse locale des treize clients MCP compatibles, dans leurs fichiers documentés seulement.'",
    );
    expect(html).toContain("'Aucun des treize clients détecté'");
    // Analysis reads the clients and the projects together.
    expect(html).toContain("api('GET', '/ui/admin/projects')");
    // A manual client shows its own steps and snippet, as text.
    expect(html).toContain(
      "plan.state === 'manual' && plan.manual ? el('details', {}, el('summary', { text: 'Marche à suivre' }),",
    );
    expect(html).toContain("el('code', { text: plan.manual.snippet })");
    const projects = html.slice(
      html.indexOf('function projectsSection(view, projects)'),
      html.indexOf('function renderTools(view)'),
    );
    expect(projects).toContain("el('h2', { text: 'Configurations par projet' })");
    expect(projects).toContain("api('POST', '/ui/admin/projects', { dir: dir.value.trim() })");
    expect(projects).toContain("api('POST', '/ui/admin/projects/remove', { dir: project.dir })");
    expect(projects).toContain("project.sources.indexOf('added') !== -1");
    for (const label of [
      'OpenCode',
      'Gemini CLI',
      'Devin Desktop',
      'Zed',
      'goose',
      'VS Code',
      'Cline',
      'Roo Code',
      'JetBrains AI',
    ])
      expect(html).toContain(`'${label}'`);
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});

describe('Drop Human V2 panel (presentation, no protocol changes)', () => {
  it('injects the human palette, preserves the system theme, and remains self-contained', () => {
    const html = renderPanel();
    expect(html).toContain('--ground: #fbfaf8');
    expect(html).toContain('--accent: #5656a9');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('describes only the outbound state that the Node actually exposes', () => {
    const html = renderPanel();
    expect(html).toContain('function outboundSentence(drop)');
    expect(html).toContain('Tu attends ');
    expect(html).toContain('La réponse est arrivée. Retrouve-la dans ton assistant.');
    expect(html).toContain("el('details', { class: 'activity-item' })");
    expect(html).toContain('expandedOutbounds[drop.dropId]');
    // An expandable current status is honest; a historic timeline would require a new backend API.
    expect(html).not.toContain('42 %');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});

describe('workspace window — local management UI (Human V2)', () => {
  it('uses local-only endpoints, no external images or Tauri IPC', () => {
    const html = renderWorkspace();
    expect(html).toContain('Vue d’ensemble');
    expect(html).toContain('Ton équipe');
    expect(html).toContain('Connecter les assistants sélectionnés');
    expect(html).toContain('Confirmer le partage');
    expect(html).toContain('Publier un fait');
    expect(html).toContain('Connexion par Internet');
    expect(html).toContain("api('GET','/ui/admin/tools')");
    expect(html).toContain("api('POST','/ui/admin/onboarding'");
    expect(html).not.toContain('window.__TAURI_INTERNALS__');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('innerHTML');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});
