## ADDED Requirements

### Requirement: Destinations du profil privé
Le profil privé MUST autoriser explicitement chaque origine réseau, refuser les redirections et les destinations hors politique avant tout envoi. Les processus tiers nécessitent une isolation réseau externe ; sans cette isolation le profil privé MUST refuser leur lancement.

#### Scenario: AC: destinations et résolution refusées
<!-- openspec-guard:test="private network > rejects public addresses, DNS names, credentials and unlisted origins before transmission" -->
- **WHEN** un modèle, serveur MCP ou agent A2A désigne une destination non autorisée, un nom DNS non pris en charge ou une redirection
- **THEN** aucune question ni clé ne parvient à cette destination ; les limitations de résolution et la politique de l’hôte sont documentées.

### Requirement: Panne sans repli
Une panne du relais ou du modèle MUST rester visible et MUST NOT déclencher un repli vers un fournisseur externe. Une reprise MUST NOT réutiliser un consentement pour exécuter deux fois la même demande.

#### Scenario: AC: indisponibilité et reprise
<!-- openspec-guard:test="private system > runs two private nodes with internal MCP and model through consent failure and restart" -->
- **WHEN** le modèle ou le relais devient indisponible puis redémarre
- **THEN** aucun fournisseur alternatif n’est contacté, l’échec ou l’état déconnecté est visible et aucune demande déjà exécutée ne se répète.
