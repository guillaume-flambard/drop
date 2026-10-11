## Context

T4.5 (D66) détecte les treize clients et n'en raccorde que sept, avec des chemins macOS seulement : deux par commande officielle (Claude Code, Codex), deux autres par commande (Gemini CLI, VS Code), trois par JSON strict réécrit en entier (Claude Desktop, Cursor, Cline). D84 exige les treize, automatiques, sur les trois systèmes, en gardant commentaires et mise en forme. Les règles de T3.3 (D45) restent : aperçu, empreinte relue, fichier temporaire renommé, sauvegarde privée de trois versions, idempotence, conflit visible, retrait de notre seule entrée, lecture bornée d'un fichier régulier.

Sources lues le 11 octobre 2026 pour chaque client et chaque système, avec les contradictions et leur arbitrage : [note de recherche](../../../../docs/research/2026-10-11-clients-par-systeme.md). Bibliothèques : README et types de `jsonc-parser` 3.3.1 et `yaml` 2.9.1 dans les paquets installés ; Node : page `child_process` (« Spawning .bat and .cmd files on Windows ») et bulletin de sécurité d'avril 2024.

## Goals / Non-Goals

**Goals** : chemins et signes d'installation par système ; écriture en place pour JSON, JSONC et YAML ; secours seulement quand l'écriture est impossible ; tests qui simulent macOS, Windows et Linux sur un Mac.

**Non-Goals** : raccordement par projet ; recette sur de vrais PC Windows et Linux (T4.6c) ; VS Code Insiders, profils VS Code autres que le profil par défaut, Roo Code installé dans Cursor.

## Decisions

- **Hôte injecté** (`packages/capabilities/src/clients.ts`) : `ClientHost { home, platform, env }`. Chaque client donne ses emplacements globaux pour un hôte ; `clientConfigLocation` choisit le fichier écrit (le premier existant dans l'ordre de priorité du client, sinon celui que sa doc nomme pour une création ; Devin écrit toujours son fichier actuel). Les variables d'environnement ne valent que pour le vrai dossier personnel et seulement absolues : un test ou un autre dossier ne prend jamais l'environnement du processus. Les fonctions existantes acceptent toujours un dossier personnel en texte.
- **Installation** : `InstallProbe` porte le système et `PATHEXT` ; dossiers d'applications par système (Applications ; `%LOCALAPPDATA%\Programs`, `Program Files`, `Program Files\JetBrains` ; dossiers `.desktop` et Toolbox), lus sans parcours ; `PATH` découpé par `;` sous Windows et essayé avec chaque extension.
- **Modes** : `cli` pour Claude Code et Codex seulement (leurs fichiers sont gérés par leur outil, TOML pour Codex) ; `file` pour les onze autres. Gemini CLI et VS Code passent au fichier : même chemin sur les trois systèmes, pas de script `.cmd` sous Windows, et un retrait réel pour VS Code.
- **Édition en place** (`packages/node/src/config-edit.ts`) : JSON et JSONC par `jsonc-parser`. `modify` donne l'endroit exact de l'insertion ; drop met l'entrée sur ses propres lignes avec l'indentation et la fin de ligne du fichier (tabulations, CRLF), garde un commentaire de fin de ligne après la virgule et la virgule finale d'un JSONC. Le retrait enlève les lignes de notre propriété et la virgule qui lui revient, et rend le texte d'origine. Le BOM est gardé. Après l'édition, la valeur relue doit être exactement celle demandée, sinon rien n'est écrit (`E_CONFIG_EDIT`). YAML par l'API Document de `yaml` : `setIn` et `deleteIn`, lignes jamais repliées, style de listes du fichier conservé (goose écrit ses listes au ras de la clé).
- **Entrée par mise en page** (`packages/node/src/install.ts`) : `mcpServers.drop` (`command`, `args`, `env`), `servers.drop` avec `type: stdio` (VS Code), `context_servers.drop` (Zed), `mcp.drop` (OpenCode stable : `type: local`, `command` en tableau, `environment`, `enabled`) ou `mcp.servers.drop` si le fichier a déjà cette forme (OpenCode 2), `extensions.drop` (goose : `name`, `type: stdio`, `cmd`, `args`, `envs`, `enabled`, `timeout`). La comparaison ramène chaque forme à commande, arguments et variables.
- **Commande officielle sous Windows** (`packages/node/src/official-command.ts`) : un `.exe` part directement ; un `.cmd` ou `.bat` passe par `cmd.exe /d /s /c` avec chaque argument entre guillemets et `windowsVerbatimArguments`, seulement si aucun argument ne contient `"`, `%`, `!`, `^`, un caractère de contrôle ou une barre oblique inverse finale ; sinon `E_CLI_SHIM_UNSAFE` et la commande à lancer.
- **Secours** : `fallbackStep` donne la raison, l'extrait dans la forme du client (JSON, YAML ou commande) et le chemin. Codes : `E_CONFIG_INVALID_OR_UNREADABLE`, `E_CONFIG_LOCKED` (EACCES, EPERM, EBUSY), `E_CONFIG_UNDOCUMENTED`, `E_CLI_MISSING`, `E_CLI_SHIM_UNSAFE`. L'état `manual` et le code `E_MANUAL_ONLY` disparaissent.
- **Sauvegardes** : le nom porte une empreinte du chemin complet, pour garder trois versions par fichier (Cursor, VS Code et Junie ont tous un `mcp.json`).
- **Bundle** : `jsonc-parser` est pris dans sa version module (`lib/esm`), sa version UMD ne s'assemblant pas avec esbuild.

## Risks / Trade-offs

- [Emplacement Windows ou Linux inexact] → chaque chemin cite sa source ; un fichier introuvable donne « non détecté » ; recette réelle au banc maison T4.6c.
- [Claude Desktop Store : nom du paquet rapporté par des utilisateurs] → la copie privée n'est écrite que si elle existe déjà ; sinon le fichier documenté.
- [OpenCode 2 sans clé `mcp`] → reçoit la forme stable, qu'OpenCode 2 ne lit pas ; limite écrite.
- [Le client réécrit son fichier pendant l'écriture] → empreinte relue juste avant le renommage ; la fenêtre lecture-renommage reste une limite de D45.
- [`cmd.exe`] → liste blanche stricte de caractères ; tout le reste part en secours.
- [JetBrains AI Assistant] → seul Junie a un fichier ; le chat de l'IDE importe depuis Claude, geste resté dans l'IDE.
