# Clients MCP sur macOS, Windows et Linux (T4.22, D84)

Lu le 11 octobre 2026, documentation officielle de chaque client et, quand elle se tait, code source officiel (marqué « source »). Une déduction est marquée « déduit ». Cette note remplace, pour les chemins par système, le §4 de [la note du 10 octobre](2026-10-10-repositionnement.md), qui ne donnait que macOS.

`~` est le dossier personnel (`%USERPROFILE%` sous Windows). « Ordre » : plusieurs fichiers lus, le premier existant est celui que drop écrit.

| Client | macOS | Windows | Linux | Format, clé | drop écrit par |
|---|---|---|---|---|---|
| Claude Code | `~/.claude.json` | `%USERPROFILE%\.claude.json` | `~/.claude.json` | JSON, `mcpServers` | `claude mcp add --scope user` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` ; copie privée de la version Store en premier si elle existe | bêta sans emplacement documenté : secours | JSON, `mcpServers` | fichier |
| Cursor | `~/.cursor/mcp.json` | `%USERPROFILE%\.cursor\mcp.json` | `~/.cursor/mcp.json` | JSON, `mcpServers` | fichier |
| Codex | `$CODEX_HOME/config.toml`, sinon `~/.codex/config.toml` | idem sous `%USERPROFILE%` | idem | TOML, `[mcp_servers.<nom>]` | `codex mcp add` |
| OpenCode | `$XDG_CONFIG_HOME/opencode/` sinon `~/.config/opencode/`, ordre `opencode.jsonc`, `opencode.json`, `config.json` ; `OPENCODE_CONFIG` | `%USERPROFILE%\.config\opencode\` (source) | comme macOS | JSONC ; v1 `mcp.<nom>` (`type: local`, `command` en tableau, `environment`, `enabled`) ; OpenCode 2 `mcp.servers.<nom>` | fichier, dans la mise en page déjà présente |
| Gemini CLI | `$GEMINI_CLI_HOME/.gemini/settings.json`, sinon `~/.gemini/settings.json` | idem | idem | JSONC (commentaires retirés à la lecture, source), `mcpServers` | fichier |
| Devin Desktop (ex-Windsurf) | `$XDG_CONFIG_HOME/devin/mcp_config.json` sinon `~/.config/devin/mcp_config.json` ; lus aussi, jamais écrits : `~/.codeium/windsurf/mcp_config.json`, `~/.config/devin/config.json` | `%APPDATA%\devin\mcp_config.json` | comme macOS | JSONC, `mcpServers` | fichier, toujours le premier |
| Zed | `~/.config/zed/settings.json` | `%APPDATA%\Zed\settings.json` | `$FLATPAK_XDG_CONFIG_HOME` ou `$XDG_CONFIG_HOME` ou `~/.config`, puis `zed/settings.json` | JSONC, `context_servers.<nom>` (`command`, `args`, `env`) | fichier |
| goose | `$XDG_CONFIG_HOME/goose/config.yaml` sinon `~/.config/goose/config.yaml` ; `$GOOSE_PATH_ROOT/config/config.yaml` | `%APPDATA%\Block\goose\config\config.yaml` | comme macOS | YAML, `extensions.<id>` (`name`, `type: stdio`, `cmd`, `args`, `envs`, `enabled`, `timeout`) | fichier |
| VS Code (Copilot) | `~/Library/Application Support/Code/User/mcp.json` | `%APPDATA%\Code\User\mcp.json` | `$XDG_CONFIG_HOME/Code/User/mcp.json` sinon `~/.config/Code/User/mcp.json` | JSONC (source), `servers.<nom>` (`type: stdio`) | fichier (profil par défaut) |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` ; `CLINE_MCP_SETTINGS_PATH`, `CLINE_DIR`, `CLINE_DATA_DIR` | idem sous `%USERPROFILE%` (source) | idem | JSON strict, `mcpServers` | fichier |
| Roo Code (archivé le 15 mai 2026) | `globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` sous le dossier utilisateur de VS Code | idem sous `%APPDATA%\Code\User` | idem sous `~/.config/Code/User` | JSON, `mcpServers` | fichier (chemin déduit de la convention de VS Code et du code de Roo) |
| JetBrains AI | Junie : `~/.junie/mcp/mcp.json` | `%USERPROFILE%\.junie\mcp\mcp.json` (déduit) | `~/.junie/mcp/mcp.json` | JSON, `mcpServers` | fichier ; le chat AI Assistant garde sa liste dans l'IDE (« Import from Claude ») |

## Signes d'installation

Jamais un dossier de configuration seul (D66). Dossiers lus, sans parcours : macOS `/Applications` et `~/Applications` ; Windows `%LOCALAPPDATA%\Programs`, `%LOCALAPPDATA%`, `%ProgramFiles%`, `%ProgramFiles%\JetBrains`, `%ProgramFiles(x86)%` ; Linux les dossiers de fichiers `.desktop` (`/usr/share/applications`, `~/.local/share/applications`, Flatpak, Snap) et `~/.local/share/JetBrains/Toolbox/apps`. Binaires sur le `PATH` (séparateur `;` et extensions `PATHEXT` sous Windows) ou aux emplacements des installateurs officiels : `~/.local/bin/claude` (`claude.exe`), `~/.local/bin/codex` et `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`, `~/.opencode/bin/opencode`, `~/.local/bin/devin` et `%LOCALAPPDATA%\devin\bin\devin.exe`, `~/.local/bin/zed`, `~/.local/bin/goose` (`goose.exe`), `~/.local/bin/junie` (`junie.bat`). Applications : `Microsoft VS Code`, `Zed`, `Devin` sous Windows ; `code.desktop`, `dev.zed.Zed.desktop`, `io.github.block.Goose.desktop` sous Linux.

## Contradictions et choix

- **Devin Desktop.** Quatre pages officielles divergent. Les plus récentes (CLI, « MCP config file location changed in v3000.3 », et la page Cascade) disent `~/.config/devin/mcp_config.json` et `%APPDATA%\devin\mcp_config.json`, et importent les anciens fichiers au démarrage. La page Devin Local cite encore `~/.config/devin/config.json` (antérieure à v3000.3) et la FAQ du renommage `~/.codeium/mcp_config.json`. drop écrit le fichier des pages récentes et lit les autres.
- **Claude Desktop sous Windows, version Store (MSIX).** La doc d'Anthropic ne donne que `%APPDATA%`. Microsoft documente qu'une application empaquetée ouvre d'abord sa copie privée, puis le vrai `AppData` si elle n'existe pas. drop écrit donc `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json` si cette copie existe (nom de dossier rapporté par des utilisateurs, ticket anthropics/claude-code#26073), sinon le fichier documenté.
- **Claude Desktop sous Linux** existe en bêta (Debian, Ubuntu) sans emplacement documenté : secours expliqué, rien n'est écrit.
- **OpenCode.** La version stable 1.19 lit `mcp.<nom>` ; OpenCode 2 lit `mcp.servers.<nom>`. drop garde la mise en page déjà présente dans le fichier ; un fichier sans `mcp` reçoit celle de la version stable.
- **Windows et les commandes officielles.** Node refuse de lancer un `.cmd` sans shell depuis la sécurité d'avril 2024 (CVE-2024-27980) et propose `cmd.exe` ; drop n'y passe que des arguments sûrs entre guillemets, sinon il donne la commande à lancer.

## Sources lues le 11 octobre 2026

- Claude : https://code.claude.com/docs/en/mcp, https://code.claude.com/docs/en/setup, https://modelcontextprotocol.io/docs/develop/connect-local-servers, https://support.claude.com/en/articles/10065433-installing-claude-desktop, https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows, https://github.com/anthropics/claude-code/issues/26073
- Microsoft : https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes (mise à jour du 28 janvier 2026)
- Cursor : https://cursor.com/docs/context/mcp, https://cursor.com/help/getting-started/install
- VS Code : https://code.visualstudio.com/docs/copilot/customization/mcp-servers, https://code.visualstudio.com/docs/copilot/reference/mcp-configuration, https://code.visualstudio.com/docs/configure/settings, https://code.visualstudio.com/docs/setup/windows, https://code.visualstudio.com/docs/setup/linux ; source `userDataProfile.ts`, `configurationModels.ts`
- Gemini CLI : https://geminicli.com/docs/reference/configuration, https://geminicli.com/docs/tools/mcp-server/ ; source `cli/src/config/settings.ts`, `core/src/utils/paths.ts`
- Codex : https://learn.chatgpt.com/docs/extend/mcp?surface=cli, https://learn.chatgpt.com/docs/config-file/config-basic ; source `codex-rs/utils/home-dir`, `install.ps1`
- Cline : https://docs.cline.bot/mcp/mcp-overview, https://docs.cline.bot/getting-started/config ; source `SdkController.ts` (v4.1.23), `mcp-settings-legacy-migration.ts`, `McpHub.ts`
- OpenCode : https://opencode.ai/docs/config/, https://opencode.ai/docs/mcp-servers/, https://opencode.ai/v2/docs/mcp-servers ; source v1.19.0 `packages/core/src/global.ts`, `config/paths.ts`, `config/v2-compat.ts`
- Devin : https://docs.devin.ai/desktop/cascade/mcp, https://docs.devin.ai/cli/extensibility/mcp/configuration, https://docs.devin.ai/cli/reference/configuration/config-file, https://docs.devin.ai/desktop/devin-desktop-faq, https://docs.devin.ai/desktop/devin-local
- Zed : https://zed.dev/docs/ai/mcp, https://zed.dev/docs/configuring-zed, https://zed.dev/docs/windows, https://zed.dev/docs/linux ; source `crates/paths/src/paths.rs`
- goose : https://goose-docs.ai/docs/guides/config-files, https://goose-docs.ai/docs/getting-started/using-extensions, https://goose-docs.ai/docs/getting-started/installation ; source `crates/goose/src/config/paths.rs`, `config/extensions.rs`
- Roo Code : https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo ; source `src/utils/storage.ts`, README (arrêt le 15 mai 2026)
- JetBrains : https://www.jetbrains.com/help/ai-assistant/mcp.html, https://junie.jetbrains.com/docs/junie-plugin-mcp-settings.html, https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html ; scripts `install.sh`, `install.ps1`
- Node.js : https://nodejs.org/api/child_process.html (« Spawning .bat and .cmd files on Windows »), https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
- Bibliothèques : README et types de `jsonc-parser` 3.3.1 (`modify`, `applyEdits`, `parseTree`) et de `yaml` 2.9.1 (`parseDocument`, `setIn`, `deleteIn`, options `indentSeq` et `lineWidth`), lus dans les paquets installés.

## Restent ouverts

- Emplacement de Claude Desktop sous Linux (non documenté).
- Nom exact du paquet Store de Claude Desktop et dossiers d'installation Windows d'OpenCode Desktop et de Devin Desktop : rapportés ou déduits, à confirmer au banc maison (T4.6c).
- Un fichier OpenCode sans clé `mcp` reçoit la mise en page de la version stable ; OpenCode 2 ne la lirait pas.
- Le chat AI Assistant de JetBrains n'a pas de fichier documenté : drop raccorde Junie, l'import depuis Claude reste un geste dans l'IDE.
