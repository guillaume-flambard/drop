## MODIFIED Requirements

### Requirement: Analyse des treize clients dans le panneau
« Connecter mes agents » SHALL analyser les treize clients, séparer configuration globale et projets, proposer d'ajouter ou de retirer un dossier de projet, et proposer de raccorder chaque client installé. L'extrait à coller et sa marche à suivre MUST n'apparaître qu'en secours, avec la raison, quand drop ne peut pas écrire. Les textes « quatre agents » et « à copier » pour un client automatique MUST disparaître.

#### Scenario: AC: analyse et projets dans le panneau
<!-- openspec-guard:test="menu bar panel (T4.5) > analyses thirteen clients, separates global and project configurations, and shows manual steps" -->
- **WHEN** le propriétaire analyse son ordinateur
- **THEN** il voit les treize clients, une section projets avec ajout et retrait de dossier, et l'extrait de secours d'un client que drop ne peut pas écrire

#### Scenario: AC: aucun copier-coller pour un client automatique
<!-- openspec-guard:test="menu bar panel (T4.22) > connects every client without a copy step and explains the fallback only when a write is impossible" -->
- **WHEN** le panneau affiche l'analyse sur macOS, Windows ou Linux
- **THEN** aucun client n'est marqué « raccordement à la main », le bouton dit « Analyser cet ordinateur », et chaque cause de secours (fichier verrouillé, emplacement non documenté, commande non sûre, fichier illisible) a son explication
