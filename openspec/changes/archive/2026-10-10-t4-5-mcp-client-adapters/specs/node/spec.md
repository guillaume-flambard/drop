## ADDED Requirements

### Requirement: Treize clients MCP détectés sans modèle
Le Node SHALL reconnaître les treize clients de D55 par leurs emplacements documentés, en JSON, JSONC, TOML ou YAML, et lister pour chacun s'il est installé, si drop y est raccordé et quels serveurs MCP il déclare, sans jamais afficher de valeur secrète. Un client MUST être dit installé par son application, son binaire ou son extension, jamais par un dossier de configuration seul.

#### Scenario: AC: lecture des treize clients
<!-- openspec-guard:test="mcp clients (T4.5) > reads each client's documented global configuration, including JSONC, TOML and YAML, without any secret value" -->
- **WHEN** chaque client a sa configuration globale avec un serveur portant un secret
- **THEN** l'analyse liste le serveur pour chacun, avec seulement des noms et des hôtes

#### Scenario: AC: installation prouvée
<!-- openspec-guard:test="mcp clients (T4.5) > tells an installed client by its app or binary, never by a configuration folder alone" -->
- **WHEN** seuls les dossiers de configuration de Zed, goose, Devin et Gemini existent
- **THEN** ces clients sont dits absents, et présents dès que leur application ou leur binaire existe

### Requirement: Configurations par projet
Le Node SHALL lire les configurations par projet seulement dans les projets que Claude Code et Codex connaissent déjà et dans les dossiers ajoutés depuis le panneau (50 au plus, ni la racine ni le dossier personnel), sans jamais parcourir le disque, et MUST ne lire que des fichiers réguliers de 1 Mio au plus.

#### Scenario: AC: projets connus ou ajoutés
<!-- openspec-guard:test="mcp clients (T4.5) > lists project configurations only for known or added projects, never by scanning the disk" -->
- **WHEN** un projet connu de Claude Code, un projet connu de Codex, un dossier ajouté et un dossier inconnu portent des configurations, l'une étant un lien vers `/dev/zero`
- **THEN** seuls les trois premiers apparaissent, le lien est ignoré sans attente, et le dossier personnel n'est jamais un projet

### Requirement: Raccordement par outil officiel ou à la main
Le Node SHALL raccorder Gemini CLI et VS Code par leurs commandes officielles, et Cline par son fichier JSON, avec relecture, empreinte et sauvegarde comme en T3.3. Pour OpenCode, Devin Desktop, Zed, goose, Roo Code et JetBrains AI, il MUST ne rien écrire et fournir une configuration à copier au format du client avec la marche à suivre.

#### Scenario: AC: raccordement automatique vérifié
<!-- openspec-guard:test="mcp clients (T4.5) > connects Gemini CLI and VS Code through their official commands and Cline through its file, then verifies" -->
- **WHEN** le propriétaire raccorde Gemini CLI, VS Code et Cline
- **THEN** les commandes officielles sont lancées, le fichier de Cline est écrit, et chaque résultat est relu ; une commande sans effet donne `E_CLI_UNVERIFIED`

#### Scenario: AC: configuration à copier
<!-- openspec-guard:test="mcp clients (T4.5) > offers a client-specific copyable configuration where no safe automatic connection exists" -->
- **WHEN** l'analyse trouve OpenCode, Zed, goose ou JetBrains AI
- **THEN** leur état est `manual`, rien n'est écrit, et l'extrait suit le format du client
