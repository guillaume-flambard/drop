## MODIFIED Requirements

### Requirement: Ping de maintien
Le relais SHALL envoyer un ping toutes les 25 s à chaque Node et MUST le déconnecter après 2 pings sans réponse. Tout octet reçu d'un Node authentifié MUST compter comme une réponse : un Node dont la voie montante lente porte encore une grosse trame, et dont le pong attend derrière elle, n'est pas coupé (T4.39).

#### Scenario: Node muet
<!-- openspec-guard:test="relay contract > closes a node that misses two pings" -->
- **WHEN** un Node ne répond pas à 2 pings
- **THEN** le relais ferme sa connexion

#### Scenario: AC: trame lente reçue
<!-- openspec-guard:test="relay answers and liveness (T4.39) > keeps a node whose slow uplink is still carrying a frame, and cuts it once its bytes stop" -->
- **WHEN** un Node qui ne répond plus aux pings envoie encore, lentement, les octets d'une trame
- **THEN** le relais garde la connexion tant que des octets arrivent, puis la coupe après deux pings sans octet ni pong

### Requirement: Battement de cœur du client relais
Le client relais (`RelayClient`) SHALL envoyer un ping toutes les 15 s et MUST abandonner la connexion si rien n'est arrivé pendant un intervalle complet, même sans fermeture reçue. Tout octet reçu sur le socket compte (pong, ping, message, ou morceau d'une trame encore incomplète). Tant qu'un envoi attend sa réponse dans son délai d'acquittement, un intervalle muet MUST NOT abandonner la connexion : ce délai borne alors l'attente. La raison journalisée est `heartbeat`.

#### Scenario: AC: relais muet sans fermeture
<!-- openspec-guard:test="relay client liveness > reconnects within two heartbeat intervals when the relay stops answering without closing" -->
- **WHEN** le relais cesse de lire et de répondre sans fermer la connexion
- **THEN** le client abandonne la connexion en 30 s au plus, journalise `E_RELAY_TIMEOUT` (`heartbeat`) et se reconnecte

#### Scenario: AC: relais qui ferme à moitié
<!-- openspec-guard:test="relay client liveness > reconnects at once when the relay half-closes the connection without a close frame" -->
- **WHEN** le relais envoie la fin de connexion TCP sans trame de fermeture WebSocket et garde son côté ouvert
- **THEN** le client signale `disconnected` et se reconnecte

#### Scenario: AC: socket plus lu en CLOSE_WAIT
<!-- openspec-guard:test="relay client liveness > releases a socket it stopped reading, left in CLOSE_WAIT, and reconnects" -->
- **WHEN** le client ne lit plus son socket et que le relais ferme la connexion de son côté
- **THEN** le client détruit ce socket en 30 s au plus, sans attendre sa fermeture, et se reconnecte

#### Scenario: AC: grosse trame entrante lente
<!-- openspec-guard:test="relay client liveness > keeps a connection while a big inbound frame trickles in, and gives it up once the bytes stop" -->
- **WHEN** le relais, qui ne répond plus aux pings, envoie lentement une trame pendant plus de deux intervalles
- **THEN** le client garde la connexion tant que des octets arrivent, puis l'abandonne (`heartbeat`) dans les 30 s qui suivent le dernier octet

#### Scenario: AC: voie montante saturée
<!-- openspec-guard:test="relay client liveness > waits for a big envelope at the floor rate, through silent heartbeat intervals, before giving up its acknowledgement" -->
- **WHEN** une enveloppe de 200 000 octets attend sa réponse et que plus rien n'arrive du relais
- **THEN** le client garde la connexion au-delà de 30 s, puis l'abandonne avec la raison `ack` à l'échéance du délai proportionnel à sa taille

### Requirement: Délai d'acquittement du client relais
Chaque envoi du client relais MUST recevoir son acquittement ou son erreur dans un délai compté depuis l'appel : 15 s, plus le temps de transmettre à 32 kbit/s (4 000 octets par seconde) les octets envoyés sur cette connexion et encore sans réponse, les siens compris. Ce délai MUST doubler à chaque abandon déjà causé par la même enveloppe, jusqu'à quatre fois sa valeur de base. Sinon la connexion est abandonnée avec la raison `ack`.

#### Scenario: AC: envoi sans acquittement libéré
<!-- openspec-guard:test="relay client liveness > releases a send left without acknowledgement as unconfirmed after 15 s and reconnects" -->
- **WHEN** le relais répond aux pings mais n'acquitte pas une petite enveloppe
- **THEN** l'envoi reste en attente pendant 15 s, puis se résout en `unconfirmed` à l'échéance de son délai, `E_RELAY_TIMEOUT` (`ack`) est journalisé et le client se reconnecte

#### Scenario: AC: délai doublé pour la même enveloppe
<!-- openspec-guard:test="relay client liveness > doubles the acknowledgement delay for an envelope that already caused a give-up" -->
- **WHEN** la même enveloppe, déjà abandonnée une fois faute d'acquittement, est envoyée de nouveau à un relais qui n'acquitte pas
- **THEN** elle attend au-delà de 15 s, et son délai dépassé abandonne la connexion au double du premier

### Requirement: Abandon d'une connexion par le client relais
Abandonner une connexion MUST la détruire sans attendre sa fermeture, résoudre chaque envoi en attente par `unconfirmed` (sa trame a été confiée à la connexion et le relais a pu la recevoir), signaler `disconnected`, journaliser le code stable `E_RELAY_TIMEOUT` avec sa raison et planifier la reconnexion avec le délai exponentiel habituel. La fermeture volontaire du client, une fermeture de la connexion et le changement de relais MUST aussi résoudre les envois en attente par `unconfirmed`. Un envoi demandé sans connexion prête, ou dont l'écriture a échoué, MUST se résoudre par `offline` : il n'a pas quitté le Node.

#### Scenario: AC: fermeture du client
<!-- openspec-guard:test="relay client liveness > settles pending sends as unconfirmed on close" -->
- **WHEN** le client est fermé alors qu'un envoi attend son acquittement
- **THEN** cet envoi se résout aussitôt en `unconfirmed`

#### Scenario: AC: envoi sans connexion
<!-- openspec-guard:test="relay client liveness > settles a send made without a ready connection as offline" -->
- **WHEN** un envoi est demandé alors qu'aucune connexion n'est prête
- **THEN** il se résout aussitôt en `offline`

## ADDED Requirements

### Requirement: Réponses du relais dans l'ordre
Le relais MUST répondre à chaque trame `envelope` d'un Node authentifié par exactement une trame `ack` ou `error`, dans l'ordre de réception des trames sur cette connexion, ou fermer la connexion. Les enveloppes qu'il pousse vers ce Node ne sont pas des réponses.

#### Scenario: AC: une réponse par trame, dans l'ordre
<!-- openspec-guard:test="relay answers and liveness (T4.39) > answers every envelope frame once, in the order received, including an error without id" -->
- **WHEN** un Node envoie une enveloppe valide, une enveloppe hors schéma, puis une enveloppe valide
- **THEN** il reçoit dans cet ordre un `ack`, une `error` `E_SCHEMA` sans identifiant, puis un `ack`

### Requirement: Erreur du relais sans identifiant
Le client relais MUST attribuer une trame `error` sans identifiant à l'envoi le plus ancien encore sans réponse sur cette connexion, et résoudre cet envoi aussitôt avec ce code, tant que toutes les réponses précédentes de cette connexion sont arrivées dans l'ordre des envois. Si une réponse est arrivée hors de cet ordre, il MUST NOT l'attribuer : l'envoi est libéré par son délai.

#### Scenario: AC: erreur sans identifiant attribuée
<!-- openspec-guard:test="relay answers and liveness (T4.39) > resolves at once, with E_SCHEMA, a send the real relay answers without an id" -->
- **WHEN** le relais répond `E_SCHEMA` sans identifiant à une enveloppe hors schéma envoyée entre deux enveloppes valides
- **THEN** cet envoi se résout aussitôt en `E_SCHEMA`, les deux autres en `delivered` ou `queued`, sans attendre de délai ni abandonner la connexion

#### Scenario: AC: réponse hors ordre
<!-- openspec-guard:test="relay client liveness > does not attribute an error without id once the relay answered out of order" -->
- **WHEN** le relais acquitte la deuxième enveloppe avant la première, puis envoie une erreur sans identifiant
- **THEN** le client n'attribue pas cette erreur, et l'envoi restant est libéré par son délai

### Requirement: Renvoi borné d'une enveloppe
Après trois abandons `ack` causés par la même enveloppe, le client relais MUST NOT l'envoyer de nouveau : l'envoi se résout aussitôt en `E_RELAY_TIMEOUT`, journalisé avec la raison `ack_retries`. Le compteur par enveloppe MUST être borné en mémoire et oublié dès que l'enveloppe reçoit une réponse.

#### Scenario: AC: trois essais au plus
<!-- openspec-guard:test="relay client liveness > stops sending an envelope that caused three acknowledgement give-ups" -->
- **WHEN** la même enveloppe a causé trois abandons faute d'acquittement
- **THEN** le quatrième envoi se résout aussitôt en `E_RELAY_TIMEOUT` sans rien écrire au relais, avec `ack_retries` au journal
