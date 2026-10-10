# a2a Specification

## Purpose
drop parle A2A v1.0 (Agent2Agent, Linux Foundation) avec le SDK officiel `@a2a-js/sdk`, dans les deux sens (D33) :
l'équipe est un agent A2A que n'importe quel agent du marché peut interroger, et une entreprise peut brancher son propre
agent A2A comme source de réponses (`a2a.answer`). Le consentement de chaque propriétaire reste la règle.

## Requirements

### Requirement: L'équipe comme agent A2A
Le Node SHALL servir sur son API locale la carte `/.well-known/agent-card.json` (sans jeton, hôte local seulement) et
le point JSON-RPC `/a2a` (avec le jeton local, déclaré dans la carte comme schéma `bearer`). La carte MUST lister un
savoir-faire par capacité de l'équipe qui prend une question libre (T2.14).

#### Scenario: Carte de l'équipe
<!-- openspec-guard:test="the team as an A2A agent (T2.14) > serves a card listing the team tools, routes an A2A question to a colleague, and reports her refusal" -->
- **WHEN** Julie partage son Figma et qu'un client A2A lit la carte du Node de Guillaume
- **THEN** la carte liste « Répondre à partir de mon Figma », l'interface JSON-RPC `/a2a` et le schéma `bearer`

### Requirement: Tâche A2A et consentement
Un message A2A SHALL être routé comme `ask_team` (D32). La tâche MUST rester en cours pendant l'attente des accords,
se terminer `COMPLETED` avec une réponse par artefact, `REJECTED` si tous ont refusé, `FAILED` sinon, et
`INPUT_REQUIRED` sans rien envoyer quand personne ne correspond.

#### Scenario: Refus et précision demandée
<!-- openspec-guard:test="the team as an A2A agent (T2.14) > serves a card listing the team tools, routes an A2A question to a colleague, and reports her refusal" -->
- **WHEN** un client A2A pose une question sur une maquette et que Julie refuse, puis pose une question qui ne correspond à aucun outil
- **THEN** la première tâche est `REJECTED`, la seconde `INPUT_REQUIRED` avec la liste de qui peut aider, et sans jeton l'appel échoue

### Requirement: Client et serveur sur le SDK officiel
drop SHALL utiliser le client et le serveur JSON-RPC du SDK officiel, sur `node:http` sans framework web, et MUST
envoyer les en-têtes d'authentification du propriétaire avec chaque requête, carte comprise.

#### Scenario: Agent d'entreprise interrogé
<!-- openspec-guard:test="A2A v1.0 with the official SDK (D33) > asks an A2A agent and reads its artifacts, sending the owner headers with every request" -->
- **WHEN** drop interroge un agent A2A qui exige un jeton
- **THEN** il lit sa carte et ses artefacts (texte et données) avec ce jeton

#### Scenario: Refus et jeton manquant
<!-- openspec-guard:test="A2A v1.0 with the official SDK (D33) > reports a refusal as rejected, and fails without the token" -->
- **WHEN** l'agent refuse, ou que le jeton manque
- **THEN** le refus est rapporté comme tel, et sans jeton l'appel échoue
