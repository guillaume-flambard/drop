## MODIFIED Requirements

### Requirement: Aperçu d'entrée échappé
`inputPreview` MUST être un rendu lisible et échappé de l'entrée : aucun HTML n'est interprété.

#### Scenario: AC: l'UI échappe une entrée contenant script
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > inserts what peers wrote as text only" -->
- **WHEN** l'entrée d'une demande contient `<script>`
- **THEN** l'UI affiche le texte littéral et n'exécute ni n'interprète le HTML (test)

### Requirement: Bouton par défaut au clavier
Le bouton par défaut au clavier MUST être « Pas maintenant », jamais « Autoriser ».

#### Scenario: Entrée au clavier
<!-- openspec-guard:test="menu bar panel and its admin routes (T4.14) > renders expiry, high sensitivity, a default Pas maintenant and per-field redaction" -->
- **WHEN** l'utilisateur presse Entrée sur une carte sans avoir choisi de bouton
- **THEN** la décision émise est `not_now`
