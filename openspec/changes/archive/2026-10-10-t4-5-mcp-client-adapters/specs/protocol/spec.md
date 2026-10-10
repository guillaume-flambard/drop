## ADDED Requirements

### Requirement: Agent du demandeur parmi les treize clients
`requestedBy.agent` SHALL accepter `claude_code`, `claude_desktop`, `cursor`, `codex`, `opencode`, `gemini_cli`, `devin_desktop`, `zed`, `goose`, `vscode`, `cline`, `roo_code`, `jetbrains` et `other` ; toute autre valeur MUST être lue comme `other`, pour qu'un pair plus récent ne voie pas ses demandes refusées.

#### Scenario: AC: agents acceptés
<!-- openspec-guard:test="requested-by agent (T4.5) > accepts the thirteen clients and other, and reads any other value as other" -->
- **WHEN** une demande porte `agent: 'zed'`, puis `agent: 'chatgpt'`
- **THEN** la première garde `zed` et la seconde est lue comme `other`
