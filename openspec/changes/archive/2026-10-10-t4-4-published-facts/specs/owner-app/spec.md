## ADDED Requirements

### Requirement: Ce que je publie
L'onglet « Mes outils » SHALL montrer « Ce que je publie » : sujet, énoncé, source, fin de validité, public et nombre de fois servi, avec ajouter, modifier et retirer. Un fait expiré ou retiré MUST apparaître en grisé avec son état. Le texte des faits MUST être inséré comme texte.

#### Scenario: AC: liste des faits publiés
<!-- openspec-guard:test="menu bar panel (T4.4) > lists what I publish with add, edit and retire, and greys out an expired fact" -->
- **WHEN** le propriétaire ouvre « Mes outils »
- **THEN** il voit ses faits, peut en ajouter, modifier et retirer, et un fait expiré est grisé
