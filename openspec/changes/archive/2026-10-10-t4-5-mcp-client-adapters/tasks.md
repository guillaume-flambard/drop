## 1. Tests d'abord

- [x] 1.1 Registre et lecteurs : treize clients sur fixtures, JSONC, TOML, YAML, sans secret.
- [x] 1.2 Installation : application ou binaire, jamais un dossier seul.
- [x] 1.3 Projets : connus ou ajoutés, jamais de parcours du disque.
- [x] 1.4 Raccordement : Gemini CLI, VS Code, Cline, relecture ; manuel pour les autres.
- [x] 1.5 Protocole et MCP : agents acceptés, `other` en repli.
- [x] 1.6 Panneau et API.

## 2. Réalisation

- [x] 2.1 `packages/capabilities` : `clients.ts`, lecteurs.
- [x] 2.2 `packages/node` : détection, raccordement, projets, API, panneau.
- [x] 2.3 `packages/protocol`, `packages/requester-mcp`.
- [x] 2.4 `docs/ONBOARDING.md`.
- [x] 2.5 Recette réelle sur ce Mac (lecture seule de la vraie configuration ; raccordement sur un `HOME` temporaire).

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --all --strict`, openspec-guard.
- [x] 3.2 Revue adverse, `/cso`.
- [x] 3.3 Correctifs de la revue : lectures bornées (fichier régulier, taille), goose en échec fermé, JSONC (commentaire avant virgule finale, BOM), placeholders non partageables, commandes officielles exécutables et limitées à 60 s, ni racine ni dossier personnel comme projet, chemin réel, écriture atomique de `projects.json`, agent inconnu lu `other`, noms des treize clients dans la boîte de réception HTML, extrait goose sans clé de tête.
