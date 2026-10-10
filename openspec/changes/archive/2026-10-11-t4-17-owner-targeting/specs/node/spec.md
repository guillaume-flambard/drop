## ADDED Requirements

### Requirement: Propriétaire désigné d'une capacité
Le catalogue et `/capabilities` SHALL donner pour chaque entrée l'identifiant de son propriétaire, l'`executorNodeId` vérifié de sa carte. `POST /drops` SHALL accepter `ownerNodeId` ; sans lui, un identifiant publié par plusieurs pairs MUST être refusé avec 409 `E_AMBIGUOUS_CAPABILITY` et la liste des propriétaires, sans rien envoyer. Chaque route d'`ask_team` et de l'A2A entrant MUST viser le propriétaire de l'entrée choisie.

#### Scenario: AC: demande envoyée au propriétaire désigné
<!-- openspec-guard:test="owner targeting (T4.17) > sends a drop to the owner it names and refuses an id that two peers publish" -->
- **WHEN** deux pairs publient le même identifiant et que le demandeur envoie une demande sans propriétaire, puis avec chacun
- **THEN** la première est refusée avec 409 et les deux propriétaires, rien n'est envoyé, et chacune des suivantes part chez le pair nommé

#### Scenario: AC: ask_team vise chaque propriétaire
<!-- openspec-guard:test="owner targeting (T4.17) > routes ask_team to each owner of a capability that two peers share" -->
- **WHEN** deux pairs partagent `mcp.answer.figma` et qu'une question parle d'une maquette
- **THEN** une demande part chez chacun des deux
