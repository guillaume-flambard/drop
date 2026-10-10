## MODIFIED Requirements

### Requirement: Découverte sur le réseau local
En mode local actif, le Node SHALL annoncer le service `_drop._tcp` sous un nom aléatoire, avec un jeton tournant que seuls ses pairs reconnaissent, et jamais son identifiant ; il SHALL découvrir les annonces de ses pairs. Il MUST ignorer toute adresse annoncée qui n'est pas privée ; une adresse de bouclage n'est retenue que dans les tests et le banc de simulation. Il MUST borner le nombre d'annonces retenues.

#### Scenario: AC: adresses publiques ignorées
<!-- openspec-guard:test="local network (T4.2) > keeps only private addresses from discovery, loopback only when allowed" -->
- **WHEN** une annonce porte une adresse publique, une adresse de bouclage et une adresse privée
- **THEN** seule l'adresse privée est retenue

#### Scenario: AC: annonce tournante
<!-- openspec-guard:test="local network privacy (T4.2c) > announces only a rotating tag that paired peers recognize, never the node id" -->
- **WHEN** un nœud annonce son service pendant deux époques de 15 minutes
- **THEN** l'annonce ne contient pas son identifiant, son nom et son jeton changent, un pair qui a sa clé le reconnaît et un inconnu non

## ADDED Requirements

### Requirement: Inviteur trouvable pendant l'invitation
Tant qu'une invitation court, le Node SHALL ajouter à son annonce un jeton tiré du code à usage unique, que seul le détenteur du code reconnaît ; ce jeton MUST disparaître quand l'invitation expire ou est utilisée.

#### Scenario: AC: invitation reconnue puis oubliée
<!-- openspec-guard:test="local network privacy (T4.2c) > lets the invitee find the inviter through the invite only while it is live" -->
- **WHEN** l'invité cherche l'inviteur pendant puis après l'invitation
- **THEN** il le trouve pendant, plus après

### Requirement: Clé de découverte partagée avec les pairs
Le Node SHALL tirer une clé de découverte de 32 octets, la garder sous `DROP_HOME` en mode `0600` et l'envoyer chiffrée, par `lan_key`, à chaque pair à l'appairage, aux pairs présentés par l'équipe et à chaque démarrage. Il MUST n'accepter une clé que d'un pair connu, pour lui-même, et garder les clés des pairs à part, en `0600`.

#### Scenario: AC: clé partagée et privée
<!-- openspec-guard:test="local network privacy (T4.2c) > shares its discovery key with each paired peer and keeps it private on disk" -->
- **WHEN** deux nœuds s'appairent, puis qu'un inconnu envoie une clé
- **THEN** chacun garde la clé de l'autre dans un fichier `0600`, et la clé de l'inconnu est ignorée

### Requirement: Reprise après un refus passager
Après un refus de la découverte ou de l'écoute locale, le Node SHALL réessayer à 30 s, 1 min, 2 min puis toutes les 5 min, repasser à `on` dès que ça marche et journaliser chaque changement d'état.

#### Scenario: AC: reprise
<!-- openspec-guard:test="local network privacy (T4.2c) > recovers from a passing refusal with growing delays" -->
- **WHEN** la découverte échoue deux fois puis réussit
- **THEN** l'état passe de `denied` à `on`, après des délais croissants

### Requirement: Silence envers une connexion sans secret
Sur une session locale, le Node qui se connecte SHALL d'abord prouver qu'il détient la clé de découverte du nœud visé ou le jeton d'une invitation en cours ; le nœud joint MUST ne rien envoyer, ni identifiant ni raison de fermeture, tant que cette preuve manque, et le nœud qui se connecte MUST ne dire qui il est qu'après une réponse prouvant le même secret.

#### Scenario: AC: rien pour un inconnu
<!-- openspec-guard:test="local network privacy (T4.2c) > says nothing to a connection that cannot knock with a key it holds" -->
- **WHEN** une connexion se tait, frappe avec un mauvais secret ou dit bonjour d'emblée, puis qu'un nœud rejoue le jeton d'un pair à sa propre adresse
- **THEN** la connexion ne reçoit rien, et le nœud qui appelle ce faux pair n'envoie jamais son identifiant
