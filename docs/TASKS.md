# Tâches

Une tâche = une session d'agent. Statuts : `todo` · `doing` · `done` · `blocked`.
Prendre la première `todo` dont les dépendances sont `done` (voir AGENTS.md).

## Étape 0 — Mesurer

| ID | Tâche | Spec | Dépend de | Statut |
| --- | --- | --- | --- | --- |
| T0.0 | Initialiser le monorepo : pnpm workspaces, TypeScript strict, eslint, prettier, vitest, scripts `lint`/`typecheck`/`test` à la racine, `.gitignore` (inclut `.drop*/`, `.env*`) | AGENTS.md | — | todo |
| T0.1 | `blocked-observer` : schéma d'événement, stockage JSONL, serveur MCP stdio avec `report_blocked` | 02 §A, §Stockage | T0.0 | todo |
| T0.2 | `blocked-observer hook` pour Claude Code + fichier de motifs + tests (aucun extrait de sortie stocké) | 02 §B | T0.1 | todo |
| T0.3 | `blocked-observer import-codex` (vérifier d'abord l'emplacement et le format des logs Codex ; sinon `blocked` + note dans DECISIONS) | 02 §B | T0.1 | todo |
| T0.4 | CLI `list`, `classify`, `report`, `export` (avec relecture), `install`, `print-instructions` + rapprochement A/B | 02 §CLI, §Classification | T0.2 | todo |
| T0.5 | `packages/blocked-observer/README.md` pour les testeurs : installation en 5 minutes (Claude Code et Codex), ce qui est collecté, ce qui ne l'est pas, comment exporter | 02 | T0.4 | todo |

**Point d'arrêt humain** : écrire le seuil go/no-go dans `docs/DECISIONS.md`, lancer la mesure, faire les entretiens.
L'étape 1 peut commencer en parallèle pour le prototype, mais pas le pilote.

## Étape 1 — Prototype Mac + VPS

| ID | Tâche | Spec | Dépend de | Statut |
| --- | --- | --- | --- | --- |
| T1.1 | `protocol` : identité Ed25519, dérivation X25519, `canonical()`, enveloppe (signer, chiffrer, vérifier, déchiffrer), codes d'erreur dans l'ordre, cache anti-rejeu, vecteurs de test | 03 §Identité, §Enveloppe | T0.0 | todo |
| T1.2 | `protocol` : schémas zod de tous les messages, `CapabilityCard`, `Receipt`, export JSON Schema | 03 §Messages, §Reçu ; 01 §Modèle | T1.1 | todo |
| T1.3 | `relay` : challenge/réponse, allowlist, routage, file différée, rate limit, ping, tests d'intégration | 04 | T1.1 | todo |
| T1.4 | `node` : `drop init`, stockage identité 0600, connexion relais avec reconnexion, dispatch des messages reçus, `peers`, `invite`/`pair` | 05 §Sous-commandes ; 03 §Appairage | T1.2, T1.3 | todo |
| T1.5 | `node` : API locale (jeton, contrôle `Host`), routes `/peers`, `/capabilities`, `/drops` | 05 §API locale | T1.4 | todo |
| T1.6 | `runner` : interface `CapabilityImpl`, pipeline en 8 étapes, scanner de secrets, écriture des reçus | 06 §Cadre | T1.2 | todo |
| T1.7 | Capacité `production.error_summary` (déterministe) + fixtures de logs piégées | 06 §Capacité 1 | T1.6 | todo |
| T1.8 | `node` : flux complet côté exécuteur et approbateur : `catalog`, `drop_request`, `approval_request`/`decision`, expiration, `review`, `drop_result`/`drop_error`, `receipt` ; CLI `publish`, `pending`, `approve`, `deny`, `not-now`, `receipts` | 01 §Séquence ; 03 §Messages | T1.5, T1.6 | todo |
| T1.9 | `node` : UI de consentement web locale (SSE, échappement), écran de relecture, notification macOS | 05 §Consentement | T1.8 | todo |
| T1.10 | `requester-mcp` : 3 outils, validation locale, encapsulation du résultat, `print-instructions` | 07 | T1.5 | todo |
| T1.11 | Test de bout en bout en mémoire : relais + 3 Nodes + capacité factice, scénarios allow / deny / not_now / expiré / sortie invalide / secret détecté | 01 §Séquence | T1.8, T1.10 | todo |
| T1.12 | `deploy/vps` : unités systemd durcies, Caddyfile d'exemple, guide pas à pas | 08 §VPS | T1.8 | todo |
| T1.13 | Capacité `repo.answer` : snapshot en allowlist, Agent SDK restreint, post-contrôles (vérifier les options exactes du SDK d'abord) | 06 §Capacité 2 | T1.6 | todo |
| T1.14 | Script de démo `scripts/demo.md` + exécution réelle Mac + VPS du scénario 08, captures dans `docs/demo/` | 08 §Scénario | T1.9, T1.11, T1.12, T1.13 | todo |
