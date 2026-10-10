## ADDED Requirements

### Requirement: Propriétaire désigné par l'agent
`list_capabilities` SHALL montrer `owner_node_id` pour chaque capacité. `request_drop` et `request_drops` SHALL accepter `owner_node_id` ; sans lui, un identifiant publié par plusieurs pairs MUST être refusé avant tout envoi, avec les propriétaires possibles.

#### Scenario: AC: identifiant ambigu refusé par l'outil
<!-- openspec-guard:test="owner targeting (T4.17) > lets the agent name the owner and refuses an ambiguous id before sending anything" -->
- **WHEN** deux pairs publient le même identifiant et que l'agent appelle `request_drop` sans `owner_node_id`, puis avec
- **THEN** le premier appel est refusé en nommant les deux propriétaires et rien n'est envoyé ; le second part chez le propriétaire nommé
