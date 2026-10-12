## MODIFIED Requirements

### Requirement: Sortie de request_drop
`request_drop` SHALL renvoyer `{ drop_id, status: 'awaiting_approval', message: "En attente de l'accord de {owner}." }`,
où `{owner}` est le propriétaire de la capacité. Le cas d'une réception non confirmée suit l'exigence suivante.

#### Scenario: Demande envoyée
- **WHEN** l'agent appelle `request_drop` avec une entrée valide pour une capacité dont le propriétaire est Julie
- **THEN** il reçoit un `drop_id`, `status: 'awaiting_approval'` et `message: "En attente de l'accord de Julie."`

### Requirement: États de get_drop_result
Selon l'état de la demande, `get_drop_result` SHALL renvoyer `pending` (avec l'état courant), `result`, ou `error`
(code + message). Tant que l'API locale signale `delivery: 'unconfirmed'`, la sortie `pending` SHALL le porter aussi.

#### Scenario: Demande en attente
- **WHEN** la demande n'a pas encore de résultat à la fin de l'attente
- **THEN** la sortie est `pending` et contient l'état courant

#### Scenario: Demande en erreur
- **WHEN** l'API locale du Node signale une erreur pour la demande
- **THEN** la sortie est `error` avec un code et un message

#### Scenario: AC: attente d'une demande non confirmée
<!-- openspec-guard:test="requester MCP tools > get_drop_result and the fan-out tools carry an unconfirmed delivery (T4.39)" -->
- **WHEN** la demande attend toujours et que l'API locale signale `delivery: 'unconfirmed'`
- **THEN** la sortie est `pending` avec l'état courant et `delivery: 'unconfirmed'`

## ADDED Requirements

### Requirement: Réception non confirmée dans les sorties groupées
`request_drops`, `get_drop_results` et `ask_team` MUST signaler, pour chaque demande concernée, que sa réception n'est
pas confirmée tant que l'API locale rend `delivery: 'unconfirmed'`, sans la présenter comme refusée.

#### Scenario: AC: sorties groupées
<!-- openspec-guard:test="requester MCP tools > get_drop_result and the fan-out tools carry an unconfirmed delivery (T4.39)" -->
- **WHEN** une demande d'un envoi groupé, d'une question à l'équipe ou d'un suivi groupé a `delivery: 'unconfirmed'`
- **THEN** la sortie de l'outil mentionne « réception non confirmée » pour cette demande et aucune autre

### Requirement: Sortie de request_drop non confirmée
Quand l'API locale signale `delivery: 'unconfirmed'` (spec `node`, « Demande initiale à la réception non confirmée »), `request_drop` SHALL renvoyer, sans erreur, `{ drop_id, status: 'unconfirmed', message: "Demande envoyée à {owner}, mais le relais n'a pas confirmé sa réception. drop la renvoie : ne la relance pas, suis-la avec get_drop_result." }` : la demande n'est ni refusée ni présentée comme reçue (T4.39).

#### Scenario: AC: réception non confirmée
<!-- openspec-guard:test="requester MCP tools > request_drop says a request the relay never confirmed is unconfirmed, not refused (T4.39)" -->
- **WHEN** l'API locale répond 201 avec `delivery: 'unconfirmed'` pour une capacité de Julie
- **THEN** l'agent reçoit le `drop_id`, `status: 'unconfirmed'` et le message qui dit que la réception n'est pas confirmée, sans `isError`
