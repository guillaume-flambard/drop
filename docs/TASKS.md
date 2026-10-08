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
