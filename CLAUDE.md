# CLAUDE.md

Les instructions de ce repo sont communes à tous les agents et vivent dans AGENTS.md.

@AGENTS.md

## Spécifique à Claude Code

- Utilise le mode plan pour le plan court de l'étape 3 d'AGENTS.md quand la tâche touche plus de 3 fichiers.
- Pour tester les serveurs MCP de ce repo dans Claude Code : `claude mcp add <nom> -- node <chemin>/dist/index.js`,
  puis `/mcp` pour vérifier qu'ils sont connectés.
