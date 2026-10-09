# Tâches : index

Une tâche = une session d'agent = une change OpenSpec. Statuts : `todo` · `doing` · `done` · `blocked`.
Prendre la première `todo` dont les dépendances sont `done` (voir AGENTS.md).

Cet index est la seule source de l'ordre et des dépendances. Le contrat vit dans `openspec/specs/<capacité>/spec.md`,
le détail d'exécution dans `openspec/changes/<change>/` (créée au démarrage de la tâche avec `/opsx:propose <change>`,
puis archivée dans `openspec/changes/archive/` une fois livrée). La colonne « Tâche » délimite le périmètre : ne rien
implémenter qui appartient à une autre ligne.

## Étape 0 — Mesurer

| ID | Tâche (périmètre) | Capacités OpenSpec | Change | Dépend de | Statut |
| --- | --- | --- | --- | --- | --- |
| T0.0 | Initialiser le monorepo : pnpm workspaces, TypeScript strict, eslint, prettier, vitest, scripts `lint`/`typecheck`/`test` à la racine, `.gitignore` (inclut `.drop*/`, `.env*`) | `monorepo-tooling` | `t0-0-init-monorepo` | — | done |
| T0.1 | `blocked-observer` : schéma d'événement, stockage JSONL, serveur MCP stdio avec `report_blocked` | `blocked-observer` | `t0-1-observer-mcp` | T0.0 | done |
| T0.2 | `blocked-observer hook` pour Claude Code + fichier de motifs + tests (aucun extrait de sortie stocké) | `blocked-observer` | `t0-2-observer-claude-hook` | T0.1 | done |
| T0.3 | `blocked-observer import-codex` (vérifier d'abord l'emplacement et le format des logs Codex ; sinon `blocked` + note dans DECISIONS) | `blocked-observer` | `t0-3-observer-codex-import` | T0.1 | done |
| T0.4 | CLI `list`, `classify`, `report`, `export` (avec relecture), `install`, `print-instructions` + rapprochement A/B | `blocked-observer` | `t0-4-observer-cli` | T0.2 | done |
| T0.5 | `packages/blocked-observer/README.md` pour les testeurs : installation en 5 minutes (Claude Code et Codex), ce qui est collecté, ce qui ne l'est pas, comment exporter | `blocked-observer` | `t0-5-observer-readme` | T0.4 | done |
| T0.6 | `blocked-observer report --merge <exports…>` : agréger les exports relus de plusieurs développeurs (jours actifs et blocages YES additionnés) pour juger le seuil D24 | `blocked-observer` | `t0-6-observer-merge` | T0.4 | done |

**Point d'arrêt humain** : écrire le seuil go/no-go dans `docs/DECISIONS.md`, lancer la mesure, faire les entretiens.
L'étape 1 peut commencer en parallèle pour le prototype, mais pas le pilote.

## Étape 1 — Prototype Mac + VPS

| ID | Tâche (périmètre) | Capacités OpenSpec | Change | Dépend de | Statut |
| --- | --- | --- | --- | --- | --- |
| T1.1 | `protocol` : identité Ed25519, dérivation X25519, `canonical()`, enveloppe (signer, chiffrer, vérifier, déchiffrer), codes d'erreur dans l'ordre, cache anti-rejeu, vecteurs de test | `protocol` | `t1-1-protocol-envelope` | T0.0 | done |
| T1.2 | `protocol` : schémas zod de tous les messages, `CapabilityCard`, `Receipt`, export JSON Schema | `protocol` | `t1-2-protocol-messages` | T1.1 | done |
| T1.3 | `relay` : challenge/réponse, allowlist, routage, file différée, rate limit, ping, tests d'intégration | `relay` | `t1-3-relay` | T1.1 | done |
| T1.4 | `node` : `drop init`, stockage identité 0600, connexion relais avec reconnexion, dispatch des messages reçus, `peers`, `invite`/`pair` | `node`, `protocol` | `t1-4-node-core` | T1.2, T1.3 | done |
| T1.5 | `node` : API locale (jeton, contrôle `Host`), routes `/peers`, `/capabilities`, `/drops` | `node` | `t1-5-node-local-api` | T1.4 | done |
| T1.6 | `runner` : interface `CapabilityImpl`, pipeline en 8 étapes, scanner de secrets, écriture des reçus | `runner` | `t1-6-runner-pipeline` | T1.2 | done |
| T1.7 | Capacité `production.error_summary` (déterministe) + fixtures de logs piégées | `capability-error-summary` | `t1-7-error-summary` | T1.6 | done |
| T1.8 | `node` : flux complet côté exécuteur et approbateur : `catalog`, `drop_request`, `approval_request`/`decision`, expiration, `review`, `drop_result`/`drop_error`, `receipt` ; CLI `publish`, `pending`, `approve`, `deny`, `not-now`, `receipts` | `node`, `protocol` | `t1-8-node-drop-flow` | T1.5, T1.6 | done |
| T1.9 | `node` : UI de consentement web locale (SSE, échappement), écran de relecture, notification macOS | `node` | `t1-9-consent-ui` | T1.8 | done |
| T1.10 | `requester-mcp` : 3 outils, validation locale, encapsulation du résultat, `print-instructions` | `requester-mcp` | `t1-10-requester-mcp` | T1.5 | done |
| T1.11 | Test de bout en bout en mémoire : relais + 3 Nodes + capacité factice, scénarios allow / deny / not_now / expiré / sortie invalide / secret détecté | `node`, `runner`, `requester-mcp` | `t1-11-e2e-in-memory` | T1.8, T1.10 | done |
| T1.12 | déploiement sur le VPS lab : stack `lab-infra/stacks/drop` (Traefik, docker, autodeploy), D22 | `deploy-mac-vps` | `t1-12-deploy-vps` | T1.8 | done |
| T1.13 | Capacité `repo.answer` : snapshot en allowlist, modèle de n'importe quel fournisseur avec outils fixés par la capacité, post-contrôles (D19) | `capability-repo-answer` | `t1-13-repo-answer` | T1.6 | done |
| T1.14 | Script de démo `scripts/demo.md` + exécution réelle Mac + VPS du scénario 08, captures dans `docs/demo/` | `deploy-mac-vps` | `t1-14-demo` | T1.9, T1.11, T1.12, T1.13 | doing |

## Étape 2 — Installable chez n'importe qui (D26)

Objectif : une personne qui n'a jamais vu le dépôt installe drop en un clic, que ce soit pour demander (Claude Code,
Codex, Cursor, Claude Desktop) ou pour répondre (app Mac), et l'utilise sur ses propres outils MCP.

| ID | Tâche (périmètre) | Capacités OpenSpec | Change | Dépend de | Statut |
| --- | --- | --- | --- | --- | --- |
| T2.1 | `relay` : admission par invitation. Un Node déjà admis signe une invitation ; le relais admet le Node qui la présente, sans PR sur l'allowlist. L'allowlist reste pour l'amorçage | `relay`, `protocol`, `node` | `t2-1-relay-invite-admission` | T1.12 | done |
| T2.2 | Capacité `mcp.answer` : répondre à partir d'un serveur MCP du propriétaire (stdio ou HTTP local), avec les outils en lecture seule choisis à la publication. Cas Figma (Julie) et Notion, Linear, GitHub, base de données (Natha) | `capability-mcp-answer`, `runner` | `t2-2-mcp-answer` | T1.13 | done |
| T2.3 | Le demandeur paie (D27) : clé plafonnée créée par le demandeur pour une demande, chiffrée pour l'exécuteur, jamais écrite sur disque chez lui ; plafond affiché sur la carte | `protocol`, `node`, `runner`, `requester-mcp` | `t2-3-requester-pays` | T2.2 | done |
| T2.4 | App Mac pour le propriétaire : Tauri dans la barre de menus, Node embarqué, démarrage auto, cartes de consentement, appairage par lien `drop://`, choix des serveurs MCP à partager, mises à jour signées | `owner-app` | `t2-4-owner-mac-app` | T2.1, T2.2, T2.8, T2.9 | doing |
| T2.5 | Installation en un clic côté demandeur : `drop install <agent>` (Claude Code et Codex par leur CLI, Cursor et Claude Desktop par leur fichier), `.mcpb` pour Claude Desktop, lien « Add to Cursor », fichiers assemblés (D29) | `requester-mcp`, `node` | `t2-5-requester-one-click` | T2.1 | done |
| T2.12 | « Demander à mon équipe » : outil `ask_team` (question en langage courant), routage par règles et prénom, réponses rassemblées (D32) | `requester-mcp`, `node` | `t2-12-ask-team` | T2.10 | done |
| T2.13 | Passerelle pour ChatGPT et Claude : connecteur MCP distant sur `drop.memolabs.dev`, OAuth avec enregistrement dynamique, liaison confirmée dans l'app, transmission au Node par le relais (D31) | `gateway`, `node`, `relay` | `t2-13-consumer-gateway` | T2.12 | doing |
| T2.14 | A2A entrant : l'équipe exposée comme agent A2A v1.0 (carte, `SendMessage`, `GetTask`), chaque tâche passe par le consentement (D33) | `a2a`, `node` | `t2-14-a2a-inbound` | T2.12 | done |
| T2.15 | A2A sortant : capacité `a2a.answer`, un agent A2A de l'entreprise comme source de réponses (D33) | `capability-a2a-answer` | `t2-15-a2a-answer` | T2.2 | done |
| T2.11 | Publier drop sur npm (`npx <nom>`), pour les liens d'installation qui ne dépendent pas d'un chemin local ; attend le nom du produit et l'accord de Guillaume | `requester-mcp` | `t2-11-npm-publish` | T2.5 | blocked |
| T2.6 | Site et doc : page d'accueil avec la démo en vidéo et les boutons d'installation, démarrage en 5 minutes, sécurité, cas d'usage ; servi sur `drop.memolabs.dev` | `site` | `t2-6-site-docs` | T2.4, T2.5 | doing |
| T2.8 | Détection en trois secondes : agents installés (Claude Code, Codex, Cursor, Claude Desktop) et leurs serveurs MCP, lus dans leurs fichiers de config ; proposition de partage (`drop detect`, `drop share`) ; l'installation de drop dans chaque agent est en T2.5 (D28) | `node`, `capability-mcp-answer` | `t2-8-detect-agents` | T2.2 | done |
| T2.9 | Équipe : un annuaire signé des membres, appairage automatique entre membres, catalogue de l'équipe (qui, quels agents, quels outils, en ligne ou non) (D28) | `protocol`, `node`, `relay` | `t2-9-team-directory` | T2.1 | done |
| T2.10 | Demandes multiples : une question part vers plusieurs capacités de plusieurs personnes, suivi de chaque réponse, assemblage par l'agent ; scénario « où en est le projet X » (D28) | `requester-mcp`, `node` | `t2-10-fan-out` | T2.9 | done |
| T2.7 | Cas d'usage réels joués chez Julie (Figma) et Natha (Notion, Linear, GitHub, base de données), captures et vidéo pour les entreprises | `deploy-mac-vps` | `t2-7-real-use-cases` | T2.3, T2.4, T2.5, T2.10 | doing |
| T2.16 | Partage vérifié : `drop share` et le panneau se connectent toujours au serveur, refusent un outil choisi qu'il n'offre pas, et disent clairement qu'un serveur demande une connexion OAuth que drop ne fait pas encore (D38) | `node`, `capability-mcp-answer` | `t2-16-checked-share` | T2.8 | todo |
| T2.17 | Serveurs MCP distants avec OAuth (Notion, Figma, Linear distants) : drop se connecte en son nom propre, jetons gardés sur le poste ; à décider avant de commencer (D38) | `capability-mcp-answer`, `node`, `owner-app` | `t2-17-mcp-oauth` | T2.16 | todo |

**Points d'arrêt humains** : signature de l'app avec le compte Apple Developer de Guillaume (T2.4) ; dessin du
panneau de suivi (T2.4) ; accord avant toute publication npm ou
mise en ligne du site (T2.5, T2.6) ; installation chez Julie et Natha (T2.7).

Plus tard (étape 3) : un RAG d'entreprise (D28).

## Documentation et présentation demandées par l'humain

Cette préparation peut avancer avant les installateurs. Elle ne clôt pas T2.6 et ne requalifie pas les travaux déjà en cours.

| ID | Tâche (périmètre) | Capacités OpenSpec | Change | Dépend de | Statut |
| --- | --- | --- | --- | --- | --- |
| T2.6a | Analyser l'avancement, écrire le guide illustré, construire et vérifier le site en prévisualisation locale | Documentation, sans changement de contrat | `t2-6a-docs-site-preview` | Demande humaine explicite | done |

T2.6a : vérification terminée, change archivée dans `openspec/changes/archive/2026-10-08-t2-6a-docs-site-preview/`. Présentation en `READY_FOR_MANUAL_ACCEPTANCE` ; l'acceptation visuelle humaine et la publication restent distinctes de l'implémentation vérifiée.
