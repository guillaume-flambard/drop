## ADDED Requirements

### Requirement: Analyse des treize clients dans le panneau
« Connecter mes agents » SHALL analyser les treize clients, séparer configuration globale et projets, proposer d'ajouter ou de retirer un dossier de projet, et montrer pour un client `manual` son extrait et sa marche à suivre. Les textes « quatre agents » MUST disparaître.

#### Scenario: AC: analyse et projets dans le panneau
<!-- openspec-guard:test="menu bar panel (T4.5) > analyses thirteen clients, separates global and project configurations, and shows manual steps" -->
- **WHEN** le propriétaire analyse ce Mac
- **THEN** il voit les treize clients, une section projets avec ajout et retrait de dossier, et les étapes manuelles des clients qui en ont besoin
