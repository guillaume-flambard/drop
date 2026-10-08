# capability-a2a-answer Specification

## Purpose
La capacité `a2a.answer` branche l'agent A2A d'une entreprise comme source de réponses (T2.15, D33), comme
`mcp.answer` le fait pour un serveur MCP. Le propriétaire relit chaque réponse avant qu'elle parte.

## Requirements

### Requirement: Une publication par agent
`a2a.answer` SHALL être une famille publiée sous `a2a.answer.<nom>`, avec une carte qui nomme l'agent et la sensibilité
`high`. La config porte `label`, `url` et `headersFromEnv` (noms de variables, jamais de valeurs).

#### Scenario: Carte d'un agent
<!-- openspec-guard:test="a2a.answer (T2.15) > is published once per agent as a2a.answer.<name>, with a card naming it" -->
- **WHEN** Sami publie `a2a.answer.ventes` avec `label: "l'agent ventes"`
- **THEN** la carte a le titre « Répondre avec l'agent ventes » et la sensibilité `high`

### Requirement: Question encadrée et réponse de l'agent
La capacité SHALL envoyer la question encadrée comme donnée, avec les en-têtes lus dans l'environnement du
propriétaire, et rendre `{ answer, verdict: 'unknown', sources: [nom de l'agent] }` quand la tâche est terminée.
Un refus, une demande de précision ou d'authentification, ou un échec MUST finir en `E_RUNNER` sans les mots de l'agent.

#### Scenario: Réponse transmise
<!-- openspec-guard:test="a2a.answer (T2.15) > sends the question framed as data with the owner credentials, and returns the agent answer" -->
- **WHEN** l'agent ventes répond à une question sur un contrat
- **THEN** la réponse est rendue avec l'agent pour source, et la question est partie encadrée avec le jeton du propriétaire

#### Scenario: Refus sans fuite
<!-- openspec-guard:test="a2a.answer (T2.15) > ends a refusal, a question back or a failure as E_RUNNER, never with the agent own words" -->
- **WHEN** l'agent refuse ou demande une précision avec un texte qui contient une donnée
- **THEN** la demande finit en `E_RUNNER` et la donnée n'apparaît nulle part
