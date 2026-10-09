# Architecture

> Contexte descriptif, lu par les agents avant chaque change. Les exigences normatives vivent dans
> `openspec/specs/<capacité>/spec.md` ; en cas d'écart, la spec fait foi. État décrit : `main` au 9 octobre 2026
> (décisions jusqu'à D40).

## Vue d'ensemble

```text
 Poste du demandeur                    drop.memolabs.dev (VPS lab, Traefik)            Mac du propriétaire
 ──────────────────                    ────────────────────────────────────            ───────────────────
 Claude Code, Codex, Cursor,           relay        /v1 (wss), /health                 app de la barre de menus
 Claude Desktop                          ▲   ▲                                          (Tauri, Node embarqué)
   │ stdio MCP                           │   │      gateway  /mcp, /oauth, /.well-known   │
 requester-mcp                           │   │        ▲  (Claude et ChatGPT en ligne)     │ panneau /app
   │ HTTP 127.0.0.1 + jeton              │   │        │                                   ▼
 node (demandeur) ── wss sortant ────────┘   └─── wss sortant ─────────────────── node (exécuteur, approbateur)
                                                site      /, /updates, /downloads        ├ runner + capacités
                                                                                          └ serveurs MCP du
                                                                                            propriétaire (Figma…)
```

- Le **relais** ne voit que des enveloppes signées et chiffrées de bout en bout. Il route par identifiant de Node,
  garde une file courte jusqu'à l'expiration de l'enveloppe (15 min au plus), admet les Nodes par allowlist ou par
  ticket d'invitation, et applique les révocations (D34, D40). Il ne garde rien d'autre que cette file, l'état
  d'admission et le fichier de révocations.
- Chaque **Node** a une paire de clés, se connecte en sortie au relais et joue un ou plusieurs rôles : demandeur,
  exécuteur (runner), approbateur. Il n'écoute que sur 127.0.0.1, derrière un jeton.
- Le **runner** exécute une capacité dans un cadre fixe : outils figés par la capacité, répertoire temporaire, budget,
  validation stricte de la sortie, scan de secrets.
- L'**approbateur** peut être un autre Node que l'exécuteur : le VPS exécute, le Mac de Guillaume approuve.
- La **passerelle** rend drop accessible depuis Claude et ChatGPT en ligne, qui n'acceptent que des connecteurs
  distants : elle fait l'OAuth du connecteur, la liaison se confirme dans l'app du poste, puis chaque appel passe au
  Node de l'utilisateur par le relais (D31, D36). Elle voit questions et réponses en clair et ne détient aucune clé
  d'équipe.
- Le **site** sert la vitrine et les fichiers de mise à jour de l'app Mac (D35, D37).

## Organisation du monorepo

```text
packages/
  blocked-observer/   Étape 0, autonome : n'importe aucun autre package.
  protocol/           Schémas zod, enveloppes, signature, chiffrement, reçus, tickets d'admission. Aucune I/O.
  relay/              Serveur WebSocket de routage, admission, révocation ; client utilisé par les Nodes.
  runner/             Cadre d'exécution, validation, scan de secrets, budget.
  capabilities/       production.error_summary, repo.answer, mcp.answer (et sa connexion OAuth), a2a.answer.
  a2a/                Client et serveur A2A v1.0 autour du SDK officiel (D33).
  requester-mcp/      Serveur MCP stdio des agents : lib.ts (bibliothèque) et index.ts (point d'entrée, T2.18).
  node/               Daemon et CLI `drop` : moteur, API locale, panneau, détection des agents, partage,
                      installation, équipe, liaison des assistants, A2A entrant.
  gateway/            Passerelle OAuth + MCP distant pour Claude et ChatGPT (T2.13).
apps/mac/             App Tauri : coquille autour du Node, qui sert lui-même le panneau (D30, D35).
site/                 Pages du site public ; `scripts/site.ts` les assemble et les sert.
scripts/              bundle.ts (fichiers assemblés, D29), build-mac.ts, mac-updates.ts, site.ts.
docker/               Points d'entrée des services du lab ; une seule image pour tous (Dockerfile).
openspec/
  project/            Contexte descriptif : vision, architecture.
  specs/              Exigences normatives, une capacité par dossier.
docs/                 TASKS.md (index), DECISIONS.md (journal), guide, bilan, essais, déploiement.
```

Dépendances entre packages : `protocol` ← tous sauf `blocked-observer` et `a2a` ; `runner` ← `capabilities` ;
`a2a` ← `capabilities`, `node` ; `relay` ← `node`, `gateway` ; `requester-mcp` ← `node` (outils exécutés pour les assistants
liés), `gateway`. `requester-mcp` ne parle qu'à l'API locale d'un Node, jamais au relais.

## Modèle de données (extrait, normatif dans `openspec/specs/protocol/spec.md`)

```ts
type NodeId = string; // base64url de la clé publique Ed25519
type OwnerKind = 'human' | 'team' | 'machine' | 'service';

interface CapabilityCard {
  id: string; // "production.error_summary", ou "mcp.answer.figma" pour une famille
  version: string; // semver
  owner: { kind: OwnerKind; displayName: string; nodeId: NodeId };
  executorNodeId: NodeId;
  approverNodeIds: NodeId[]; // au moins 1
  title: string; // « Répondre à partir de mon Figma »
  sensitivity: 'low' | 'high'; // high : relecture avant envoi
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  receives: string[]; // ce que le demandeur recevra
  neverReceives: string[]; // ce qu'il ne recevra jamais
  approval: 'always' | 'auto_low';
  maxOutputChars: number;
  budget: { maxSeconds: number; maxUsd?: number; maxToolCalls?: number };
}
// Publiée signée par son exécuteur : { card, sig }.
```

Messages entre Nodes (`packages/protocol/src/messages.ts`) : appairage (`pair_request`, `pair_accept`), équipe
(`team_roster`), catalogue (`catalog_request`, `catalog`), demande (`drop_request`, `drop_status`,
`approval_request`, `approval_decision`, `review_request`, `review_decision`, `drop_result`, `drop_error`,
`receipt`), assistants liés par la passerelle (`link_grant`, `agent_call`, `agent_reply`). Le coût affiché sur la
carte est `free`, `capped` ou `unmeasured` ; une clé plafonnée du demandeur voyage chiffrée avec la demande (D27).

## Cycle de vie d'un Drop

```text
proposed → awaiting_approval → (denied | expired | not_now)
                             → approved → running → (failed | delivered)
                                                  → in_review → (delivered | failed)
delivered → receipted
```

`in_review` n'existe que pour `sensitivity: 'high'` : l'approbateur voit la sortie et peut en retirer des champs.

## Séquence nominale (VPS exécute, Mac approuve)

1. L'agent appelle `request_drop(capability_id, input, purpose)`, ou `ask_team(question)` qui choisit les
   destinataires par des règles (D32).
2. `requester-mcp` → API locale du Node → enveloppe `drop_request` chiffrée pour l'exécuteur, via le relais.
3. L'exécuteur vérifie l'enveloppe (schéma, signature, pair connu, expiration, rejeu) puis la requête, et envoie
   `approval_request` à l'approbateur.
4. L'approbateur voit la carte de consentement (panneau, notification) : autoriser une fois, refuser, plus tard.
5. `approval_decision` signée → exécuteur ; le runner exécute la capacité.
6. Sortie validée par le schéma, scannée ; si `high`, `review_request` à l'approbateur.
7. `drop_result` (ou `drop_error`, code fermé) → demandeur ; chaque côté écrit un reçu signé (empreintes, pas de
   contenu).
8. L'agent récupère la réponse par `get_drop_result(drop_id, wait_seconds)`, attente bornée à 50 s.

Variantes : `request_drops` et `get_drop_results` (plusieurs destinataires, T2.10) ; un assistant en ligne passe par
la passerelle (`agent_call` vers le Node de l'utilisateur, qui exécute les mêmes outils) ; un agent A2A externe
appelle `/a2a` du Node (T2.14).

## Outils du propriétaire

`mcp.answer` répond à partir d'un serveur MCP que le propriétaire a déjà : déclaré par un de ses agents (lu dans leur
configuration, secrets compris, au moment de l'exécution, D28), ou décrit à la main. Les outils utilisables sont fixés
au partage, jamais par la question, et ceux marqués destructifs sont retirés (D19). Le partage vérifie d'abord le
serveur (T2.16). Pour un serveur en ligne qui exige OAuth, drop se connecte une fois en son nom, et garde ses jetons
sur le poste (T2.17, D39).

## Configuration locale

`DROP_HOME` (défaut `~/.drop`) : `identity.json` (clés, 0600), `config.json` (relais, port de l'API, passerelles de
confiance, qui paie), `local-token`, `peers.json`, `team.json`, `capabilities/` (publications), `receipts/` (JSONL),
`links.json` (assistants liés), `admission.json` (ticket en attente), `oauth/` (jetons OAuth, 0700), `bin/` (serveur
MCP installé dans les agents). Plusieurs Nodes sur une machine = plusieurs `DROP_HOME`, ainsi qu'on simule « Julie »
en développement.

## Déploiement

Relais, Node du lab, passerelle et site tournent dans une même image, construite à chaque commit sur `main` et
déployée par `lab-infra/stacks/drop` derrière Traefik (D22). Ce qui reste à y configurer est listé dans
`docs/deploiement-lab.md`. L'app Mac et le paquet Claude Desktop embarquent les fichiers assemblés de
`scripts/bundle.ts` (D29).
