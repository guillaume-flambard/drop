## Why

D55 : drop reste un serveur MCP standard et doit reconnaître, sans modèle, les treize clients compatibles avec leurs configurations globales et par projet. Aujourd'hui seuls Claude Code, Claude Desktop, Cursor et Codex sont détectés et raccordés (T3.3).

Choix de Guillaume le 10 octobre 2026 (« oui aux 4 ») : détection des treize en lecture seule, raccordement automatique seulement par commande officielle ou fichier JSON simple, configuration à copier ailleurs ; projets connus des agents ou ajoutés dans le panneau, jamais de parcours du disque ; `requestedBy.agent` étendu aux treize ; serveurs des nouveaux clients partageables comme les autres. Emplacements revérifiés dans la doc officielle le même jour (note de recherche, §4). Décision D66.

## What Changes

- **Adaptateurs** : un registre de treize clients (emplacements global et projet, format JSON, JSONC, TOML ou YAML, clé, forme d'une entrée, signes d'installation par application ou binaire, mode de raccordement).
- **Détection** : lecture seule des treize ; un dossier de configuration seul ne vaut pas installation ; jamais de valeur secrète affichée.
- **Raccordement** : Gemini CLI (`gemini mcp add -s user`) et VS Code (`code --add-mcp`) par leurs commandes officielles, Cline par son fichier JSON, avec les règles de T3.3 ; OpenCode, Devin Desktop, Zed, goose, Roo Code et JetBrains AI reçoivent une configuration à copier adaptée et la marche à suivre.
- **Projets** : configurations par projet lues dans les projets que Claude Code et Codex connaissent déjà, et dans les dossiers ajoutés dans le panneau.
- **Protocole** : `requestedBy.agent` accepte les treize clients et `other` ; le MCP demandeur ramène une valeur inconnue à `other`.
- **Panneau** : analyse des treize, sections global et projets, étapes manuelles, textes « quatre agents » remplacés.

## Capabilities

### Modified Capabilities

- `node` : registre, détection, raccordement, projets.
- `owner-app` : analyse des treize clients et projets.
- `protocol` : `requestedBy.agent`.
- `requester-mcp` : agent inconnu ramené à `other`.

## Non-goals

- Écriture des fichiers JSONC, YAML ou d'interface (OpenCode, Zed, goose, JetBrains) et raccordement par projet : configuration à copier seulement.
- Windows et Linux : chemins macOS seulement, comme l'app.
- ChatGPT (serveurs distants HTTPS seulement) : passerelle publique, hors de cette tâche.

## Impact

`packages/capabilities` (registre et lecteurs), `packages/node` (détection, raccordement, projets, API, panneau), `packages/protocol`, `packages/requester-mcp`, `docs/ONBOARDING.md`.
