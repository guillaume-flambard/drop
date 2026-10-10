## ADDED Requirements

### Requirement: Présentation d'un fait publié
Le MCP demandeur SHALL présenter un résultat portant l'empreinte de `FACT_OUTPUT_SCHEMA` comme un fait publié, avec son propriétaire et sa fin de validité, toujours encadré comme une donnée.

#### Scenario: AC: fait présenté
<!-- openspec-guard:test="published facts (T4.4) > presents a fact with its owner and end of validity" -->
- **WHEN** un agent lit un fait publié par Julie valable jusqu'au 9 novembre
- **THEN** le texte commence par « Fait publié par Julie » et donne la date de fin
