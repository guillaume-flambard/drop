## ADDED Requirements

### Requirement: Voie Internet par iroh
Le Node SHALL pouvoir joindre un pair par iroh quand le mode Internet est actif : programme `drop-iroh` avec la même clé que l'identité drop, sans annuaire ni relais n0 sauf choix explicite. Une enveloppe ne MUST compter comme remise qu'après un accusé signé par la clé du destinataire. Le programme MUST refuser la connexion d'un nœud qui n'est ni pair ni en appairage, sauf pendant une invitation vivante (D60).

#### Scenario: AC: identité iroh issue de drop
<!-- openspec-guard:test="internet (T4.2b) > derives the iroh identity from the drop key, so the iroh id is the drop node id" -->
- **WHEN** le programme démarre avec la graine d'une identité drop
- **THEN** son identifiant iroh est l'identifiant drop

#### Scenario: AC: échange direct avec accusé
<!-- openspec-guard:test="internet (T4.2b) > delivers an envelope directly between two nodes with no relay, with a signed acknowledgement" -->
- **WHEN** deux pairs connaissent leurs adresses directes et qu'aucun relais n'est configuré
- **THEN** une enveloppe passe par iroh et compte comme remise après l'accusé signé

#### Scenario: AC: non-pair refusé
<!-- openspec-guard:test="internet (T4.2b) > refuses a connection from a node that is not a paired peer" -->
- **WHEN** un nœud qui n'est pas un pair se connecte sans invitation vivante et envoie une enveloppe, ou qu'un pair envoie une enveloppe signée par un autre
- **THEN** rien n'est transmis au moteur et l'envoi échoue chez lui

#### Scenario: AC: échec expliqué
<!-- openspec-guard:test="internet (T4.2b) > explains the failure when no path exists without a relay" -->
- **WHEN** aucun chemin direct n'existe et aucun relais n'est configuré
- **THEN** l'envoi iroh échoue avec `E_IROH_NO_PATH`, la voie suivante est essayée et l'état explique qu'il faut un relais

### Requirement: Adresses iroh partagées entre pairs
Le Node SHALL envoyer à chaque pair, chiffrées, ses adresses iroh au démarrage et à chaque changement, et les mettre dans ses invitations. Il MUST n'accepter que celles d'un pair connu pour lui-même, relais en https (http seulement en boucle locale), 8 adresses directes au plus, gardées en `0600`.

#### Scenario: AC: adresses partagées
<!-- openspec-guard:test="internet (T4.2b) > shares its iroh addresses with each paired peer and keeps only valid ones" -->
- **WHEN** un pair envoie ses adresses, un autre un relais en http public, et qu'une invitation est utilisée
- **THEN** l'adresse valide est gardée, celle en http public refusée, et l'invité connaît les adresses de l'hôte avant tout relais drop
