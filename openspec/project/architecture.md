# Architecture

> Contexte descriptif, lu par les agents avant chaque change. Les exigences normatives vivent dans
> `openspec/specs/<capacité>/spec.md` ; en cas d'écart, la spec fait foi.

## Vue d'ensemble

```text
  Mac de Guillaume                         VPS                              
  ─────────────────                        ───                              
  Claude Code / Codex                      relay  (wss, derrière Caddy)     
        │ stdio MCP                          ▲         ▲                    
  requester-mcp                              │         │                    
        │ HTTP 127.0.0.1                     │         │                    
  node "guillaume-mac" ──── wss sortant ─────┘         └──── wss sortant ── node "vps"
   ├ identité Ed25519                                                         ├ identité Ed25519
   ├ boîte de réception                                                       ├ runner
   └ UI de consentement (127.0.0.1)                                           └ capacité production.error_summary
                                                                                 (logs en lecture seule)
```

- Le **relais** ne voit que des enveloppes chiffrées de bout en bout. Il route par identifiant de Node, garde une
  file courte pour les Nodes déconnectés (TTL 10 min), et ne stocke rien d'autre.
- Chaque **Node** a une paire de clés, se connecte en sortie au relais, et joue un ou plusieurs rôles :
  demandeur, exécuteur (runner), approbateur.
- Le **runner** exécute une capacité dans un cadre fixe : outils figés, répertoire temporaire, budget, validation de
  sortie, scan de secrets.
- L'**approbateur** peut être un autre Node que l'exécuteur : le VPS exécute, le Mac de Guillaume approuve.

## Organisation du monorepo

```text
packages/
  blocked-observer/   Étape 0. Autonome : n'importe aucun autre package.
  protocol/           Schémas zod, enveloppes, signature, chiffrement, reçus. Aucune I/O.
  relay/              Serveur WebSocket de routage.
  node/               Daemon + CLI `drop` : identité, connexion relais, file d'approbation, UI locale, API locale.
  runner/             Registre de capacités, cadre d'exécution, validation, scan de secrets, budget.
  capabilities/       Implémentations : production-error-summary, repo-answer.
  requester-mcp/      Serveur MCP stdio exposé à Claude Code / Codex.
openspec/
  project/            Contexte descriptif : vision, architecture.
  specs/              Exigences normatives, une capacité par dossier.
  changes/            Une change par tâche T*, archivée une fois livrée.
docs/
  TASKS.md            Index ordonné des tâches et de leurs dépendances.
  DECISIONS.md        Journal des décisions.
deploy/
  vps/                Unités systemd, Caddyfile d'exemple.
```

Règle de dépendance : `protocol` ← tout le monde ; `runner` ← `capabilities` ; `node` ← `runner` ;
`requester-mcp` ne parle qu'à l'API locale de `node`, jamais au relais.

## Modèle de données (extrait, normatif dans `openspec/specs/protocol/spec.md`, implémenté dans `packages/protocol`)

```ts
type NodeId = string;            // base64url de la clé publique Ed25519
type OwnerKind = 'human' | 'team' | 'machine' | 'service';

interface Owner { kind: OwnerKind; displayName: string; nodeId: NodeId }

interface CapabilityCard {
  id: string;                    // ex. "production.error_summary"
  version: string;               // semver
  owner: Owner;
  executorNodeId: NodeId;        // qui exécute
  approverNodeIds: NodeId[];     // qui peut approuver (au moins 1)
  title: string;                 // phrase courte pour la carte de consentement, ex. "Résumer les erreurs de production"
  sensitivity: 'low' | 'high';
  inputSchema: JSONSchema;       // dérivé du schéma zod
  outputSchema: JSONSchema;
  receives: string[];            // phrases lisibles : ce que le demandeur recevra
  neverReceives: string[];       // phrases lisibles : ce qu'il ne recevra jamais
  approval: 'always' | 'auto_low';  // v1 : 'always' par défaut
  maxOutputChars: number;        // taille max de la sortie sérialisée
  budget: { maxSeconds: number; maxUsd?: number; maxToolCalls?: number };
}
```

## Cycle de vie d'un Drop

```text
proposed → awaiting_approval → (denied | expired | not_now)
                             → approved → running → (failed | in_review) → delivered → receipted
```

`in_review` n'existe que pour `sensitivity: 'high'` : l'approbateur voit la sortie avant envoi.

## Séquence nominale (VPS exécute, Mac approuve)

1. L'agent de Guillaume appelle l'outil MCP `request_drop(capabilityId, input, purpose)`.
2. `requester-mcp` → API locale du Node Mac → enveloppe `drop_request` chiffrée pour le Node VPS, via le relais.
3. Le Node VPS valide la requête (schéma, signature, expiration, quota), puis envoie `approval_request` à l'approbateur
   (le Node Mac).
4. Le Node Mac affiche la carte de consentement (UI locale + notification). Guillaume clique `Allow once`.
5. `drop_decision` signée → VPS. Le runner exécute la capacité.
6. Sortie validée par le schéma, scannée ; si `high`, retour à l'approbateur pour relecture.
7. `drop_result` → demandeur. Les deux côtés écrivent un `receipt`.
8. L'agent récupère le résultat via `get_result(dropId)` (polling) et continue.

## Configuration locale

- `DROP_HOME` (défaut `~/.drop`) : `identity.json` (clés, mode 0600), `peers.json` (Nodes connus et leurs noms),
  `capabilities/` (cartes publiées par ce Node), `receipts/` (JSONL), `config.json` (URL du relais, rôle).
- Plusieurs Nodes sur une même machine = plusieurs `DROP_HOME`. C'est ainsi qu'on simule « Julie » en dev.
