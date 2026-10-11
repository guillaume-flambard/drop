## MODIFIED Requirements

### Requirement: Treize clients MCP détectés sans modèle
Le Node SHALL reconnaître les treize clients de D55 par leurs emplacements documentés sur macOS, Windows et Linux, en JSON, JSONC, TOML ou YAML, et lister pour chacun s'il est installé, si drop y est raccordé et quels serveurs MCP il déclare, sans jamais afficher de valeur secrète. Un client MUST être dit installé par son application, son binaire ou son extension, jamais par un dossier de configuration seul.

#### Scenario: AC: lecture des treize clients
<!-- openspec-guard:test="mcp clients (T4.5) > reads each client's documented global configuration, including JSONC, TOML and YAML, without any secret value" -->
- **WHEN** chaque client a sa configuration globale avec un serveur portant un secret
- **THEN** l'analyse liste le serveur pour chacun, avec seulement des noms et des hôtes

#### Scenario: AC: installation prouvée
<!-- openspec-guard:test="mcp clients (T4.5) > tells an installed client by its app or binary, never by a configuration folder alone" -->
- **WHEN** seuls les dossiers de configuration de Zed, goose, Devin et Gemini existent
- **THEN** ces clients sont dits absents, et présents dès que leur application ou leur binaire existe

#### Scenario: AC: installation reconnue sur chaque système
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > finds apps and executables the way each system installs them, never from a configuration folder alone" -->
- **WHEN** les clients sont installés comme chaque système les installe : application dans `/Applications`, dossier sous `%LOCALAPPDATA%\Programs` ou `Program Files`, fichier `.desktop`, binaire sur un `PATH` séparé par `;` avec les extensions de `PATHEXT` sous Windows
- **THEN** chacun est dit installé sur son système, et aucun ne l'est sans application, binaire ni extension

#### Scenario: AC: emplacements déplacés par l'environnement
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > honours the documented overrides of each location on the real home only" -->
- **WHEN** une variable documentée déplace une configuration (`XDG_CONFIG_HOME`, `APPDATA`, `CODEX_HOME`, `GEMINI_CLI_HOME`, `OPENCODE_CONFIG`, `GOOSE_PATH_ROOT`, `CLINE_DIR`)
- **THEN** le fichier lu et écrit suit la variable si elle est absolue, l'ignore sinon, et un dossier personnel donné explicitement ne prend jamais l'environnement du processus

## REMOVED Requirements

### Requirement: Raccordement par outil officiel ou à la main
**Reason**: D84 et D85 : les treize clients se raccordent automatiquement sur les trois systèmes ; la configuration à copier ne reste qu'en secours expliqué.
**Migration**: Voir « Raccordement automatique des treize clients sur trois systèmes », « Fichier du client gardé tel quel » et « Secours expliqué quand l'écriture est impossible ».

## ADDED Requirements

### Requirement: Raccordement automatique des treize clients sur trois systèmes
Le Node SHALL raccorder les treize clients sur macOS, Windows et Linux sans copier-coller : Claude Code et Codex par leur commande officielle, relue après coup, les onze autres par leur fichier documenté pour ce système. Chaque écriture MUST suivre les règles de T3.3 : empreinte de l'aperçu relue avant d'écrire, fichier temporaire renommé, sauvegarde privée de trois versions par fichier, entrée identique sans effet, entrée drop différente en conflit, retrait de notre seule entrée.

#### Scenario: AC: raccordement automatique sur macOS
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > connects every file client at its documented macOS path, keeps comments and layout, is idempotent, then removes only its entry" -->
- **WHEN** le propriétaire raccorde les treize clients installés sur un Mac
- **THEN** chacun reçoit l'entrée drop dans sa mise en page à son emplacement macOS, une seconde fois rien ne change, et le retrait rend chaque fichier d'origine

#### Scenario: AC: raccordement automatique sous Windows
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > connects every file client at its documented Windows path, keeps comments and layout, is idempotent, then removes only its entry" -->
- **WHEN** le propriétaire raccorde les treize clients installés sous Windows
- **THEN** chacun est écrit à son emplacement Windows (`%APPDATA%\Claude`, `%APPDATA%\Zed`, `%APPDATA%\Block\goose\config`, `%APPDATA%\Code\User`, `%APPDATA%\devin`…), de façon idempotente, et le retrait rend chaque fichier d'origine

#### Scenario: AC: raccordement automatique sous Linux
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > connects every file client at its documented Linux path, keeps comments and layout, is idempotent, then removes only its entry" -->
- **WHEN** le propriétaire raccorde les clients installés sous Linux
- **THEN** chacun est écrit à son emplacement Linux (`~/.config/…`), de façon idempotente, et le retrait rend chaque fichier d'origine

#### Scenario: AC: fichier absent créé, ajout tiers conservé
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > creates a missing file where each client documents it, and keeps a neighbour added after the connection" -->
- **WHEN** le fichier d'un client est vide, puis un tiers ajoute un serveur après le raccordement
- **THEN** l'entrée drop est créée à la bonne clé, et le retrait garde le serveur du tiers

#### Scenario: AC: fichier modifié ou autre entrée drop
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > refuses a file changed since the preview and a different drop entry, for the new clients too" -->
- **WHEN** le fichier de goose change après l'aperçu, celui de Zed change entre le fichier temporaire et le renommage, et OpenCode porte déjà une autre entrée drop
- **THEN** les trois actions sont refusées (`changed`, `changed`, `conflict`) et chaque fichier garde le contenu du tiers

#### Scenario: AC: commande officielle bornée et relue
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > runs the official command of Codex without blocking the daemon, then verifies what it wrote" -->
- **WHEN** la commande officielle de Codex met du temps à écrire sa configuration
- **THEN** le daemon reste réactif et l'entrée écrite est relue avant d'annoncer le succès

#### Scenario: AC: script de commande sous Windows
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > runs a Windows .cmd shim through cmd.exe only with arguments that are safe inside quotes" -->
- **WHEN** la commande officielle est un script `.cmd` installé par npm sous Windows
- **THEN** elle passe par `cmd.exe` avec chaque argument entre guillemets, et un argument portant `"`, `%`, `!`, `^`, un saut de ligne ou une barre oblique inverse finale est refusé (`E_CLI_SHIM_UNSAFE`)

#### Scenario: AC: Claude Desktop version Store
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > writes the private copy of the Store build of Claude Desktop on Windows when it exists" -->
- **WHEN** la version Store de Claude Desktop a sa copie privée de configuration sous `%LOCALAPPDATA%\Packages`
- **THEN** drop écrit cette copie, que Windows ouvre en premier, et laisse le fichier de `%APPDATA%` intact

### Requirement: Fichier du client gardé tel quel
Une écriture dans le fichier d'un client SHALL ne changer que l'entrée drop : commentaires, ordre des clés, indentation, fins de ligne, BOM et virgules finales MUST rester ; un document relu qui diffère autrement MUST être refusé (`E_CONFIG_EDIT`). Quand les serveurs sont un par ligne, comme les clients les écrivent, le retrait MUST rendre le fichier d'origine à l'octet près. Un fichier invalide MUST être refusé sans écriture.

#### Scenario: AC: JSONC commenté
<!-- openspec-guard:test="format-preserving configuration edits (T4.22) > adds then removes one JSONC entry, keeping comments, trailing commas, order and indentation" -->
- **WHEN** drop ajoute puis retire son entrée dans un fichier JSONC commenté à virgules finales
- **THEN** chaque ligne d'origine reste, l'entrée suit l'indentation du fichier, et le retrait rend le texte d'origine

#### Scenario: AC: BOM, CRLF et tabulations
<!-- openspec-guard:test="format-preserving configuration edits (T4.22) > keeps a BOM, CRLF line endings and tab indentation, and creates a missing file" -->
- **WHEN** le fichier commence par un BOM, finit ses lignes en CRLF et indente par tabulations, ou n'existe pas
- **THEN** BOM, CRLF et tabulations restent, et un fichier absent est créé avec deux espaces et une fin de ligne

#### Scenario: AC: fichier refusé sans écriture
<!-- openspec-guard:test="format-preserving configuration edits (T4.22) > refuses a broken file, comments in strict JSON, or a container that is not an object" -->
- **WHEN** le fichier est tronqué, porte un commentaire alors qu'il est en JSON strict, ou que sa clé de serveurs n'est pas un objet
- **THEN** l'édition est refusée (`E_CONFIG_INVALID`) et rien n'est écrit

#### Scenario: AC: YAML de goose
<!-- openspec-guard:test="format-preserving configuration edits (T4.22) > adds then removes one goose extension, keeping comments and the flush list style goose writes" -->
- **WHEN** drop ajoute puis retire son extension dans un `config.yaml` commenté écrit par goose
- **THEN** chaque ligne d'origine reste, dans le style de listes du fichier, et le retrait rend le texte d'origine

#### Scenario: AC: YAML avec BOM, CRLF et quatre espaces
<!-- openspec-guard:test="format-preserving configuration edits (T4.22) > keeps a YAML BOM, CRLF line endings and four-space indentation, and refuses an edit that would touch anything else" -->
- **WHEN** le `config.yaml` commence par un BOM, finit ses lignes en CRLF et indente de quatre espaces, ou que l'entrée à retirer n'existe pas
- **THEN** BOM, CRLF et indentation restent, le retrait rend le texte d'origine, et retirer une entrée absente ne change rien

### Requirement: Secours expliqué quand l'écriture est impossible
Le Node SHALL proposer la configuration à coller, ou la commande à lancer, seulement quand il ne peut pas écrire : fichier illisible, invalide, verrouillé, trop gros ou lien vers un autre fichier, emplacement non documenté sur ce système, commande officielle absente ou arguments non sûrs pour `cmd.exe`. Le secours MUST dire la raison, quoi coller et où, et MUST NOT écrire ni préparer quoi que ce soit pour ce client.

#### Scenario: AC: secours seulement si l'écriture est impossible
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > falls back to an explained configuration only when a write is impossible" -->
- **WHEN** sous Linux, la configuration de Zed est invalide, Claude Desktop (bêta, emplacement non documenté) est installé et Codex n'a pas de commande exécutable
- **THEN** ces trois reçoivent leur secours avec la raison (`E_CONFIG_INVALID_OR_UNREADABLE`, `E_CONFIG_UNDOCUMENTED`, `E_CLI_MISSING`), le fichier invalide reste intact, et tous les autres clients installés sont prêts sans copier-coller

#### Scenario: AC: conflit plutôt que secours
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > reports a drop entry in a Claude Code project as a conflict, never as something to paste" -->
- **WHEN** Claude Code déclare déjà une entrée drop dans l'un de ses projets
- **THEN** l'état est `conflict` (`E_SCOPE_CONFLICT`), sans configuration à coller

#### Scenario: AC: commande de secours prête à coller
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > prints a fallback command quoted for the shell of the owner, Windows paths unchanged" -->
- **WHEN** la commande officielle de Codex manque sous Windows, avec des chemins à espaces
- **THEN** la commande donnée est citée pour PowerShell, sans doubler une barre oblique inverse, et pour un shell POSIX entre apostrophes

#### Scenario: AC: cas limites sans écriture fautive
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > keeps edge cases out: a stable OpenCode server named servers, an older Devin entry, a linked file, script extensions" -->
- **WHEN** un serveur OpenCode 1 s'appelle `servers`, l'ancien fichier de Devin porte déjà une entrée drop, la configuration de Zed est un lien, et `PATHEXT` liste des scripts
- **THEN** drop écrit sous `mcp` et non dans ce serveur, Devin est en conflit, le lien n'est pas suivi (`E_CONFIG_SYMLINK` avec sa raison), et seuls `.exe`, `.com`, `.cmd` et `.bat` comptent comme exécutables

#### Scenario: AC: rien de préparé pour un client non écrit
<!-- openspec-guard:test="all thirteen clients connected automatically (T4.22) > keeps the requester server out of a client drop could not write" -->
- **WHEN** une sélection forgée vise un client dont le fichier est illisible
- **THEN** l'action échoue et le serveur demandeur n'est même pas copié
