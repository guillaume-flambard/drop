## MODIFIED Requirements

### Requirement: Configurations des clients lues sans blocage
La lecture des configurations des clients (JSON, JSONC, TOML de Codex, YAML de goose) SHALL prendre un temps linéaire dans la taille du fichier, quelle que soit la ligne qu'il contient, et donner les mêmes valeurs qu'avant T4.26 sur une configuration bien formée. Un fichier de configuration SHALL être ouvert une fois, puis contrôlé (type, taille) et lu par ce même descripteur ; un tube nommé, un dossier ou un fichier trop gros MUST être refusé sans attendre. L'onboarding (aperçu, écriture, contrôles d'avant et d'après écriture) SHALL lire les fichiers des clients par ce même lecteur, sans suivre un lien : un fichier qui est un lien MUST être refusé avec `E_CONFIG_SYMLINK` avant toute lecture.

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

#### Scenario: AC: lien refusé quand il ne doit pas être suivi
<!-- openspec-guard:test="configuration files read without following a link (T4.42) > refuses a linked file with E_CONFIG_SYMLINK when links are not followed, and still follows one by default" -->
- **WHEN** une configuration est un lien vers un autre fichier, lue une fois sans suivre les liens et une fois par défaut
- **THEN** la première lecture est refusée avec `E_CONFIG_SYMLINK`, la seconde rend le contenu de la cible, et un fichier ordinaire ou absent se lit comme avant

#### Scenario: AC: tube nommé refusé à l'onboarding sans attente
<!-- openspec-guard:test="onboarding configuration read (T4.42) > refuses a named pipe planted at a client configuration path at once, without waiting for a writer" -->
- **WHEN** la configuration de Zed est remplacée par un tube nommé dont l'écrivain n'arrive qu'au bout de 5 s, et que l'onboarding analyse les clients
- **THEN** l'analyse rend la main en moins de 2,5 s, Zed est en erreur `E_CONFIG_INVALID_OR_UNREADABLE` et les autres clients sont analysés normalement (macOS et Linux)
