## ADDED Requirements

### Requirement: Configurations de l'onboarding lues sans lien ni attente
L'onboarding (aperçu, écriture, contrôles d'avant et d'après écriture) SHALL lire les fichiers des clients par le lecteur partagé des configurations (une ouverture, contrôle et lecture par ce descripteur, tube nommé refusé sans attendre), sans suivre un lien : un fichier qui est un lien MUST être refusé avec `E_CONFIG_SYMLINK` avant toute lecture.

#### Scenario: AC: lien refusé quand il ne doit pas être suivi
<!-- openspec-guard:test="configuration files read without following a link (T4.42) > refuses a linked file with E_CONFIG_SYMLINK when links are not followed, and still follows one by default" -->
- **WHEN** une configuration est un lien vers un autre fichier, lue une fois sans suivre les liens et une fois par défaut
- **THEN** la première lecture est refusée avec `E_CONFIG_SYMLINK`, la seconde rend le contenu de la cible, et un fichier ordinaire ou absent se lit comme avant

#### Scenario: AC: tube nommé refusé à l'onboarding sans attente
<!-- openspec-guard:test="onboarding configuration read (T4.42) > refuses a named pipe planted at a client configuration path at once, without waiting for a writer" -->
- **WHEN** la configuration de Zed est remplacée par un tube nommé dont l'écrivain n'arrive qu'au bout de 5 s, et que l'onboarding analyse les clients
- **THEN** l'analyse rend la main en moins de 2,5 s, Zed est en erreur `E_CONFIG_INVALID_OR_UNREADABLE` et les autres clients sont analysés normalement (macOS et Linux)
