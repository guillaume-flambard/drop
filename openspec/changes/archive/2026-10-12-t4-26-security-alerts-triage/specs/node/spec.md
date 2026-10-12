## ADDED Requirements

### Requirement: Publication nommée par un identifiant de capacité
`DropHome.publish` SHALL refuser, avec `E_CAPABILITY_ID` et sans rien écrire, un identifiant qui n'est pas un identifiant de capacité (`CapabilityIdSchema`). Le nom du fichier de publication MUST NOT sortir de `DROP_HOME/capabilities`, quel que soit l'appelant (`drop publish`, `drop share --id`, le panneau).

#### Scenario: AC: identifiant qui serait un chemin refusé
<!-- openspec-guard:test="security alerts triage (T4.26) > publishes under a capability id only, never under a path that leaves DROP_HOME" -->
- **WHEN** une publication porte l'identifiant `../../escaped`, `mcp.answer.../../../escaped`, `Upper.case` ou une chaîne vide
- **THEN** elle est refusée avec `E_CAPABILITY_ID`, aucun fichier n'apparaît hors de `DROP_HOME`, et `mcp.answer.figma` reste publiable

### Requirement: Configurations des clients lues sans blocage
La lecture des configurations des clients (JSON, JSONC, TOML de Codex, YAML de goose) SHALL prendre un temps linéaire dans la taille du fichier, quelle que soit la ligne qu'il contient, et donner les mêmes valeurs qu'avant T4.26 sur une configuration bien formée. Un fichier de configuration SHALL être ouvert une fois, puis contrôlé (type, taille) et lu par ce même descripteur ; un tube nommé, un dossier ou un fichier trop gros MUST être refusé sans attendre.

#### Scenario: AC: TOML de Codex en temps linéaire
<!-- openspec-guard:test="configuration and reply parsing in linear time (T4.26) > reads Codex TOML arrays, inline tables and pairs as before, in linear time on hostile lines" -->
- **WHEN** une configuration Codex porte une ligne de 100 000 caractères en forme de piège (chaîne non fermée répétée, clé sans fin, espaces sans valeur)
- **THEN** elle est lue en moins de 1,5 s, et les tableaux, tables en ligne et paires bien formés donnent les mêmes valeurs qu'avant

#### Scenario: AC: YAML de goose en temps linéaire
<!-- openspec-guard:test="configuration and reply parsing in linear time (T4.26) > reads goose extensions as before, in linear time on hostile lines" -->
- **WHEN** une extension goose porte une valeur de 100 000 espaces sans commentaire, ou des ` #` répétés
- **THEN** elle est lue en moins de 1,5 s, et une extension bien formée donne les mêmes valeurs qu'avant

#### Scenario: AC: fichier contrôlé par le descripteur lu
<!-- openspec-guard:test="configuration files read through one descriptor (T4.26) > reads a regular file, refuses a directory or an oversized file, and never waits on a named pipe" -->
- **WHEN** le chemin d'une configuration désigne un fichier, un fichier absent, un dossier, un fichier plus gros que la borne ou un tube nommé
- **THEN** le fichier est lu, l'absent donne `undefined`, le dossier et le tube sont refusés à l'instant avec `E_CONFIG_TYPE`, le fichier trop gros avec `E_CONFIG_TOO_LARGE`

### Requirement: Raccourci Windows lancé sans interprétation des métacaractères
La ligne `cmd.exe` d'un raccourci `.cmd` SHALL garder chaque argument entre une seule paire de guillemets, de sorte que `&`, `|`, `<`, `>`, les parenthèses et les espaces d'un chemin restent littéraux pour `cmd.exe` et pour le `%*` du raccourci. Le programme lancé SHALL être `cmd.exe`, jamais la variable `ComSpec`.

#### Scenario: AC: métacaractères d'un chemin gardés entre guillemets
<!-- openspec-guard:test="security alerts triage (T4.26) > keeps cmd.exe metacharacters of a Windows shim path inside quotes, and never runs ComSpec" -->
- **WHEN** le raccourci vit sous `C:\Users\a&b|c\npm (x86)\` et `ComSpec` désigne un autre programme
- **THEN** la commande lance `cmd.exe` avec chaque argument entre guillemets, et un chemin portant `"`, `%` ou un saut de ligne est refusé (`E_CLI_SHIM_UNSAFE`)
