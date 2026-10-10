## ADDED Requirements

### Requirement: Agent inconnu ramené à other
Le MCP demandeur SHALL transmettre comme agent la valeur de `DROP_AGENT` si elle fait partie des agents acceptés, et `other` sinon.

#### Scenario: AC: agent inconnu
<!-- openspec-guard:test="mcp clients (T4.5) > reports an unknown DROP_AGENT as other" -->
- **WHEN** `DROP_AGENT` vaut `zed`, puis `chatgpt`
- **THEN** les demandes portent `zed`, puis `other`
