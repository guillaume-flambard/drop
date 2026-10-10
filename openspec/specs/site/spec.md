# site Specification

## Purpose

Le site présente drop à quelqu'un qui n'a jamais vu le dépôt : ce que ça fait, comment démarrer, à quoi ça sert, ce
que ça protège, et où en est le projet (T2.6, D72). Il est servi sur `drop.memolabs.dev` par l'image drop, à côté du
relais et de la passerelle, et sert aussi les fichiers de mise à jour de l'app Mac (D70). Il ne contient aucun script.

## Requirements

### Requirement: Pages publiques

Le site SHALL comprendre l'accueil, « Démarrer en 5 minutes », les cas d'usage, la sécurité, le guide et l'avancement,
reliés entre eux. Chaque lien interne MUST mener à une page ou une ancre existante, et chaque image MUST avoir un texte
alternatif. Seuls les fichiers d'une liste explicite sont publiés : jamais le dépôt entier.

#### Scenario: Liens et images

<!-- openspec-guard:test="documentation site > serves every page, their local links and anchors, and all image alternatives" -->

- **WHEN** on parcourt chaque page publiée
- **THEN** chaque lien interne répond, chaque ancre existe, et chaque image a un attribut `alt`

#### Scenario: Surface limitée

<!-- openspec-guard:test="documentation site > serves only the selected public assets and refuses traversal, mutations and invalid encodings" -->

- **WHEN** on demande un fichier du dépôt, un chemin qui remonte, une méthode autre que GET ou HEAD, ou un autre hôte
- **THEN** le site répond 404, 405 ou 403 selon le cas

### Requirement: Installation selon l'ouverture

`site/site.json` SHALL fixer `installs` (`beta` ou `open`) et `contact`. En `beta`, l'accueil MUST proposer de demander
un accès (un lien `mailto:` si `contact` est une adresse, sinon un texte) et MUST NOT contenir de lien de
téléchargement. En `open`, il MUST proposer l'app Mac (`downloads/drop.dmg`), le paquet Claude Desktop
(`downloads/drop.mcpb`) et les guides de connexion des agents et des assistants. Une adresse de contact invalide MUST
faire échouer la construction (`E_SITE_CONTACT`).

#### Scenario: Bêta

<!-- openspec-guard:test="documentation site > during the beta, offers to ask for access and links no download (T2.6)" -->

- **WHEN** le site est construit avec `installs: beta`
- **THEN** l'accueil propose de demander un accès et aucune page ne pointe vers un `.dmg`, un `.mcpb` ou un lien `cursor://`

#### Scenario: Ouvert

<!-- openspec-guard:test="documentation site > once open, links the Mac app, the Claude Desktop bundle and the connector address (T2.6)" -->

- **WHEN** le site est construit avec `installs: open`
- **THEN** l'accueil pointe vers `downloads/drop.dmg` et `downloads/drop.mcpb`, et « Démarrer » donne l'adresse du connecteur

### Requirement: Service public

`node scripts/site.ts serve` SHALL servir le site sur l'hôte public configuré (`SITE_PUBLIC_HOST`, 403 sinon), avec la
politique de contenu de la prévisualisation et `Strict-Transport-Security`. Il MUST servir depuis `SITE_RELEASES_DIR`,
par nom exact seulement : `/updates/latest.json` (sans cache), `/updates/drop-<version>-darwin-aarch64.app.tar.gz`,
`/downloads/drop.dmg` et `/downloads/drop.mcpb`. Tout autre nom MUST répondre 404.

#### Scenario: Fichiers de release

<!-- openspec-guard:test="documentation site > serves the public site on its own host with release files by exact name only (T2.6)" -->

- **WHEN** le dossier des releases contient le manifeste, une archive, l'image disque et un autre fichier
- **THEN** les trois premiers sont servis sous leur adresse, l'autre fichier, un chemin qui remonte ou un nom absent répondent 404
