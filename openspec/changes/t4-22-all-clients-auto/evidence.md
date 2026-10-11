# Preuves T4.22

| Critère | Preuve |
|---|---|
| Installation reconnue sur chaque système | Test « all thirteen clients connected automatically (T4.22) > finds apps and executables the way each system installs them, never from a configuration folder alone ». Applications macOS, dossiers Windows (`Microsoft VS Code`, `Zed`, `PyCharm 2026.2`…), fichiers `.desktop` Linux, `PATH` séparé par `;` et `PATHEXT` ; rien sans application, binaire ni extension. |
| Emplacements déplacés par l'environnement | Test « … > honours the documented overrides of each location on the real home only ». `XDG_CONFIG_HOME`, `GOOSE_PATH_ROOT`, `APPDATA`, `CODEX_HOME`, `CLINE_DIR`, `OPENCODE_CONFIG`, `GEMINI_CLI_HOME` ; variable relative ignorée ; dossier explicite sans l'environnement du processus. |
| Raccordement sur macOS, Windows, Linux | Trois tests « … > connects every file client at its documented macOS / Windows / Linux path, keeps comments and layout, is idempotent, then removes only its entry ». Pour chaque système : treize prêts (Claude Desktop absent sous Linux), chemin écrit égal au chemin de la doc, entrée dans la mise en page du client, chaque ligne d'origine gardée, une sauvegarde par fichier, seconde connexion sans un octet de changé, retrait rendant chaque fichier d'origine à l'octet près. |
| Fichier absent, ajout tiers | Test « … > creates a missing file where each client documents it, and keeps a neighbour added after the connection ». |
| Fichier modifié ou autre entrée drop | Test « … > refuses a file changed since the preview and a different drop entry, for the new clients too » : goose modifié après l'aperçu, Zed modifié entre le fichier temporaire et le renommage, OpenCode avec une autre entrée drop. |
| Commande officielle | Test « … > runs the official command of Codex without blocking the daemon, then verifies what it wrote ». |
| Script `.cmd` sous Windows | Test « … > runs a Windows .cmd shim through cmd.exe only with arguments that are safe inside quotes ». |
| Claude Desktop version Store | Test « … > writes the private copy of the Store build of Claude Desktop on Windows when it exists ». |
| Édition en place | Tests « format-preserving configuration edits (T4.22) > … » : JSONC commenté à virgules finales, BOM, CRLF, tabulations, fichier créé, refus (`E_CONFIG_INVALID`), YAML de goose à listes au ras de la clé ; chaque retrait rend le texte d'origine. |
| Secours expliqué | Tests « … > falls back to an explained configuration only when a write is impossible », « … > keeps the requester server out of a client drop could not write » et « … > reports a drop entry in a Claude Code project as a conflict, never as something to paste ». |
| Panneau | Test « menu bar panel (T4.22) > connects every client without a copy step and explains the fallback only when a write is impossible ». |

| YAML : BOM, CRLF, indentation | Test « format-preserving configuration edits (T4.22) > keeps a YAML BOM, CRLF line endings and four-space indentation, and refuses an edit that would touch anything else ». |
| Commande de secours | Test « … > prints a fallback command quoted for the shell of the owner, Windows paths unchanged ». |
| Cas limites | Test « … > keeps edge cases out: a stable OpenCode server named servers, an older Devin entry, a linked file, script extensions ». |

Les tests du raccordement fixent leur système ; ils passent aussi quand `process.platform` est forcé à `linux` (comme la CI) ou à `win32`.

## Vérification (11 octobre 2026)

- `pnpm -r lint`, `pnpm -r typecheck` : verts.
- `pnpm -r test` : 72 fichiers, 574 tests verts, 1 ignoré.
- `npx openspec validate --all --strict` : vert.
- openspec-guard 0.3.0 `--require-selector --fail-on fail` : vert après archivage ; la baseline ne fait que perdre des entrées.
- Bundle (`node scripts/bundle.ts`) : `drop install` et son aide fonctionnent ; `drop detect` en lecture seule sur ce Mac.

## Revue adverse

Sous-agent indépendant, environ trente entrées JSONC essayées (commentaires portant `,` `}` ou `//`, objets sur une ligne, conteneurs vides, CRLF, BOM, clés en double) : aucune corruption. Corrigé après la revue :

- YAML : BOM et CRLF remis, largeur d'indentation du fichier gardée.
- Chaque édition relit le document entier et refuse toute différence autre que notre entrée (`E_CONFIG_EDIT`) ; retirer une entrée absente ne change rien.
- Commande de secours citée pour PowerShell (barres obliques inverses intactes) ou pour un shell POSIX (apostrophes), plus jamais en JSON.
- Deux tables drop dans Codex, et une entrée drop dans un projet de Claude Code : conflit, sans extrait à coller.
- OpenCode 1 avec un serveur nommé `servers` n'est plus lu comme OpenCode 2.
- Variables d'environnement : absolues selon le système de l'hôte (lecteur ou UNC sous Windows).
- Sous Windows, un délai dépassé arrête tout l'arbre de `cmd.exe` (`taskkill /T`) ; `PATHEXT` réduit à `.exe`, `.com`, `.cmd`, `.bat` ; entrées du `PATH` entre guillemets acceptées.
- Fichier lié ailleurs : `E_CONFIG_SYMLINK`, lecture par descripteur ouvert sans suivre de lien (`O_NOFOLLOW` hors Windows).
- Devin : une entrée drop dans un ancien fichier qu'il importe encore est un conflit.

Écarté, écrit en limite : un conteneur créé par drop (`mcpServers` absent) reste vide après le retrait ; d'anciennes sauvegardes nommées sans empreinte ne sont plus élaguées ; la règle d'import de Devin (seulement si le nouveau fichier manque ?) n'est pas documentée.

## Lecture seule sur ce Mac

Aperçu réel sans écriture : Claude Code, Claude Desktop, Codex, OpenCode (fichier JSONC commenté, forme `mcp.servers` d'OpenCode 2 reconnue) et VS Code prêts ; Cursor en conflit (une autre entrée drop existe déjà) ; Gemini CLI, Devin, Zed, goose, Cline, Roo Code et JetBrains non installés.

## Reste

Recette sur de vrais PC Windows 10 et 11 et sur Linux, au banc maison (T4.6c) ; points ouverts de la note de recherche (Claude Desktop sous Linux, nom du paquet Store, OpenCode 2 sans clé `mcp`, chat AI Assistant de JetBrains).
