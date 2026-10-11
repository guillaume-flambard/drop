## Why

D84 (choix de Guillaume du 11 octobre 2026, non négociable) : les treize clients MCP de D55 se raccordent tous automatiquement, sans copier-coller, sur macOS, Windows et Linux, en gardant commentaires et mise en forme de leurs fichiers. Aujourd'hui (D66, T4.5), sept seulement sont automatiques, tous les chemins sont ceux de macOS, et OpenCode, Devin Desktop, Zed, goose, Roo Code et JetBrains AI reçoivent une configuration à copier.

## What Changes

- **Chemins par système** : chaque emplacement de configuration et chaque signe d'installation dépend du système (`darwin`, `win32`, `linux`), injecté avec le dossier personnel et l'environnement pour que les tests simulent les trois systèmes sur un Mac. Recherche par le `PATH` avec le séparateur et les extensions d'exécutables de Windows.
- **Écriture qui garde le fichier** : JSON et JSONC par `jsonc-parser` (Microsoft, MIT), YAML par la bibliothèque `yaml` (Document API, ISC) ; seule l'entrée drop change, commentaires, ordre, indentation, fins de ligne et BOM restent. Deux dépendances nouvelles du seul paquet `@drop/node`, décision D85.
- **Raccordement** : Claude Code et Codex par leurs CLI officielles (avec, sous Windows, le passage par `cmd.exe` d'un script `.cmd` aux arguments sûrs) ; les onze autres par leur fichier documenté, avec les règles de T3.3 (aperçu, empreinte relue avant écriture, fichier temporaire renommé, sauvegarde privée de trois versions, idempotence, conflit visible, retrait de notre seule entrée, lecture bornée d'un fichier régulier).
- **Secours expliqué** : la configuration à copier ne reste que si l'écriture est impossible (fichier illisible, invalide, verrouillé, trop gros, CLI absente ou arguments non sûrs pour `cmd.exe`) ; elle dit pourquoi et où coller.
- **Panneau, CLI et docs** : plus de « à copier » pour les clients automatiques, aide de `drop install` à jour, tableau de `docs/ONBOARDING.md` par système.

## Capabilities

### Modified Capabilities

- `node` : registre par système, détection d'installation, raccordement automatique des treize clients, secours expliqué.
- `owner-app` : le panneau n'affiche la marche à suivre qu'en secours.

`capability-mcp-answer` lit les serveurs déclarés par les mêmes emplacements : aucun changement de contrat, seulement les chemins par système.

## Non-goals

- Raccordement par projet (inchangé : lecture seule des projets connus ou ajoutés).
- Recette sur de vrais postes Windows et Linux : le banc maison T4.6c la fera.
- Variantes non documentées (VS Code Insiders, profils VS Code autres que celui par défaut, Roo Code installé dans Cursor).

## Impact

`packages/capabilities` (registre et chemins), `packages/node` (édition des fichiers, raccordement, détection, CLI, panneau), `docs/ONBOARDING.md`, `README.md`, `docs/GUIDE.md`, `docs/DECISIONS.md` (D85), `docs/research`.
