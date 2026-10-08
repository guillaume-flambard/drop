# deploy-mac-vps Specification

## Purpose
Déploiement de test sur un Mac et un VPS : relais et Node exécuteur durcis sur le VPS, deux personnes simulées sur le
Mac, et le scénario de démo qui sert de critère de fin de l'étape 1.

## Requirements

### Requirement: Processus du VPS
Le VPS SHALL faire tourner `drop-relay`, le relais derrière Caddy, exposé en `wss://relay.<domaine>/v1`, et
`drop-node` avec `DROP_HOME=/var/lib/drop`, exécuteur de `production.error_summary` dont le propriétaire est `machine`.

#### Scenario: Relais joignable via Caddy
- **WHEN** un Node se connecte à `wss://relay.<domaine>/v1`
- **THEN** Caddy transmet la connexion à `drop-relay`

#### Scenario: Node VPS exécuteur
- **WHEN** on inspecte `drop-node` sur le VPS
- **THEN** il tourne avec `DROP_HOME=/var/lib/drop` et expose `production.error_summary` avec le propriétaire `machine`

### Requirement: Processus du Mac
Le Mac SHALL faire tourner : `drop serve` avec `DROP_HOME=~/.drop` (Guillaume, demandeur et approbateur des capacités
du VPS) ; `drop serve` avec `DROP_HOME=~/.drop-julie` sur un autre port (« Julie » simulée, exécutrice de `repo.answer`
sur un repo de test) ; et `requester-mcp`, lancé par Claude Code / Codex.

#### Scenario: Deux personnes sur le même Mac
- **WHEN** les deux `drop serve` tournent sur le Mac
- **THEN** ils utilisent l'un `~/.drop`, l'autre `~/.drop-julie`, sur des ports différents
- **AND** seul celui de « Julie » expose `repo.answer`

### Requirement: Utilisateur système drop sur le VPS
Le VPS MUST avoir un utilisateur système `drop`, sans shell, membre du seul groupe qui lit les journaux visés
(`systemd-journal` ou `adm` selon la distribution).

#### Scenario: Groupes de l'utilisateur drop
- **WHEN** on inspecte l'utilisateur `drop`
- **THEN** il n'a pas de shell de connexion
- **AND** il n'appartient qu'au groupe qui lit les journaux visés, en plus de son groupe propre

### Requirement: Option Docker documentée
Pour des journaux Docker, l'option choisie MUST être documentée dans `docs/DECISIONS.md`, en tenant compte du fait que
l'accès au socket Docker équivaut à root.

#### Scenario: Journaux Docker
- **WHEN** les journaux visés sont ceux de conteneurs Docker
- **THEN** `docs/DECISIONS.md` décrit l'option retenue pour les lire et la justifie au regard de l'équivalence socket Docker = root

### Requirement: Unités systemd durcies
`deploy/vps/drop-relay.service` et `deploy/vps/drop-node.service` MUST déclarer `User=drop`, `NoNewPrivileges=yes`,
`ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes` et `ReadWritePaths=/var/lib/drop`.

#### Scenario: Directives présentes
- **WHEN** on lit chacun des deux fichiers `.service`
- **THEN** il contient `User=drop`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes` et `ReadWritePaths=/var/lib/drop`

### Requirement: Exemple de Caddyfile
`deploy/vps/Caddyfile.example` SHALL configurer un reverse proxy de `relay.<domaine>` vers `localhost:<port>`.

#### Scenario: Reverse proxy
- **WHEN** on lit `deploy/vps/Caddyfile.example`
- **THEN** il déclare le site `relay.<domaine>` en reverse proxy vers `localhost:<port>`

### Requirement: Node VPS sans clé API
Le Node du VPS MUST NOT avoir besoin de clé API, car `production.error_summary` est déterministe.

#### Scenario: Exécution sans ANTHROPIC_API_KEY
- **WHEN** `drop-node` tourne sur le VPS sans `ANTHROPIC_API_KEY` dans son environnement
- **THEN** `production.error_summary` s'exécute normalement

### Requirement: Seul le port 443 ouvert
Le VPS MUST NOT ouvrir aucun port hors 443 (Caddy).

#### Scenario: Ports exposés
- **WHEN** on liste les ports joignables de l'extérieur sur le VPS
- **THEN** seul le port 443, servi par Caddy, est ouvert

### Requirement: Clé API réservée à Julie sur le Mac
Sur le Mac, deux `DROP_HOME` MUST simuler deux personnes, et seule « Julie » MUST avoir `ANTHROPIC_API_KEY` dans son
environnement.

#### Scenario: Environnements séparés
- **WHEN** on inspecte l'environnement des deux `drop serve` du Mac
- **THEN** seul celui de `~/.drop-julie` contient `ANTHROPIC_API_KEY`

### Requirement: requester-mcp pointe vers le Node de Guillaume
Sur le Mac, `requester-mcp` MUST pointer vers l'API locale du Node de Guillaume via `DROP_LOCAL_URL` et
`DROP_LOCAL_TOKEN_FILE`.

#### Scenario: Configuration du demandeur
- **WHEN** Claude Code ou Codex lance `requester-mcp`
- **THEN** `DROP_LOCAL_URL` et `DROP_LOCAL_TOKEN_FILE` désignent l'API locale et le jeton du Node `~/.drop`

### Requirement: Démo production.error_summary
Le scénario de démo, critère de fin de l'étape 1, MUST passer de bout en bout pour `production.error_summary` : de la
question dans Claude Code sur le Mac jusqu'à la reprise du travail par l'agent après exécution sur le VPS.

#### Scenario: AC: étape 1, découverte et demande
<!-- openspec-guard:non-testable reason="Démo réelle Mac + VPS, captures dans docs/demo/" -->
- **WHEN** dans Claude Code sur le Mac l'utilisateur demande « La prod de {service} va bien ? »
- **THEN** l'agent appelle `list_capabilities` et propose `production.error_summary`
- **AND** après acceptation de l'utilisateur, l'agent appelle `request_drop`

#### Scenario: AC: étape 2, consentement sur le Mac
<!-- openspec-guard:non-testable reason="Démo réelle Mac + VPS, captures dans docs/demo/" -->
- **WHEN** la demande `production.error_summary` arrive
- **THEN** une notification s'affiche sur le Mac, puis la carte de consentement dans l'UI locale
- **AND** l'utilisateur choisit « Autoriser une fois »

#### Scenario: AC: étape 3, exécution sur le VPS
<!-- openspec-guard:non-testable reason="Démo réelle Mac + VPS, captures dans docs/demo/" -->
- **WHEN** la demande est autorisée
- **THEN** le VPS exécute `production.error_summary`
- **AND** l'agent reçoit `status` et `topErrors`, et continue

### Requirement: Démo repo.answer chez Julie
Le scénario de démo MUST passer de bout en bout pour `repo.answer` chez « Julie » : la réponse revient avec des noms
de fichiers, sans code.

#### Scenario: AC: étape 4, question sur le repo de Julie
<!-- openspec-guard:non-testable reason="Démo réelle Mac + VPS, captures dans docs/demo/" -->
- **WHEN** l'utilisateur demande « Est-ce que l'implémentation de Julie gère déjà le mode sombre ? »
- **THEN** l'agent passe par `repo.answer` et une carte s'affiche chez « Julie »
- **AND** après relecture et envoi par « Julie », la réponse arrive avec des noms de fichiers, sans code

### Requirement: Reçus des deux côtés
Après la démo, `drop receipts` MUST montrer les deux reçus des deux côtés.

#### Scenario: AC: étape 5, reçus
<!-- openspec-guard:non-testable reason="Démo réelle Mac + VPS, captures dans docs/demo/" -->
- **WHEN** on lance `drop receipts` côté demandeur et côté exécuteurs après les étapes 1 à 4
- **THEN** les deux reçus apparaissent des deux côtés

### Requirement: Test des 30 secondes
Les étapes 1 à 3 de la démo MUST pouvoir être montrées à quelqu'un sans prononcer « MCP ».

#### Scenario: AC: étape 6, test des 30 secondes
<!-- openspec-guard:non-testable reason="Démo réelle Mac + VPS, captures dans docs/demo/" -->
- **WHEN** on montre les étapes 1 à 3 à quelqu'un
- **THEN** la démonstration se fait sans prononcer « MCP »
