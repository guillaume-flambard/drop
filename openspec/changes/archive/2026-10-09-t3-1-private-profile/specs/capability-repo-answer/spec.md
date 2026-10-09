## MODIFIED Requirements

### Requirement: Config propriétaire du fournisseur de modèle
La config MUST désigner explicitement un modèle compatible OpenAI. Sans fournisseur, l’URL proposée est `http://127.0.0.1:11434/v1`, sans clé. Aucun modèle n’est choisi ou téléchargé implicitement ; un modèle absent MUST échouer avant l’appel modèle. `maxTurns` vaut 15 et `maxUsd` 0,50 par défaut. La politique privée s’applique à tout fournisseur.

#### Scenario: Valeurs par défaut du modèle
<!-- openspec-guard:test="private adapters > refuses incompatible funding before contacting MCP and requires an explicit model" -->
- **WHEN** la config ne précise ni fournisseur ni limites
- **THEN** l’endpoint proposé est local, aucun appel modèle n’a lieu sans choix explicite, `maxTurns` vaut 15 et `maxUsd` 0,50
