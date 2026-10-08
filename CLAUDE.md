# CLAUDE.md

Les instructions de ce repo sont communes à tous les agents et vivent dans AGENTS.md.

@AGENTS.md

## Spécifique à Claude Code

- Utilise le mode plan avant `/opsx:propose` (étape 4 d'AGENTS.md) quand la tâche touche plus de 3 fichiers.
- `/opsx:*` sont installées dans `.claude/commands/opsx/` par `openspec init` ; `openspec update` les régénère.
- `/review` et `/cso` viennent de gstack, `grilling` des skills globaux : rien à installer dans le repo.
- Pour tester les serveurs MCP de ce repo dans Claude Code : `claude mcp add <nom> -- node <chemin>/dist/index.js`,
  puis `/mcp` pour vérifier qu'ils sont connectés.
