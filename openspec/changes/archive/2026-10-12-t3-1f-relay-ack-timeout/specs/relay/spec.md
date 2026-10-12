## ADDED Requirements

### Requirement: Battement de cœur du client relais
Le client relais (`RelayClient`) SHALL envoyer un ping toutes les 15 s et MUST abandonner la connexion si aucune trame (pong, ping, message) n'est arrivée pendant un intervalle complet, même sans fermeture reçue. La raison journalisée est `heartbeat`.

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

### Requirement: Délai d'acquittement du client relais
Chaque envoi du client relais MUST recevoir son acquittement ou son erreur en 15 s au plus, comptées depuis que sa trame a quitté le processus ; sinon la connexion est abandonnée avec la raison `ack`.

#### Scenario: AC: envoi sans acquittement libéré
<!-- openspec-guard:test="relay client liveness > releases a send left without acknowledgement as offline after 15 s and reconnects" -->
- **WHEN** le relais répond aux pings mais n'acquitte pas une enveloppe
- **THEN** l'envoi reste en attente avant 15 s, puis se résout en `offline`, `E_RELAY_TIMEOUT` (`ack`) est journalisé et le client se reconnecte

### Requirement: Délai de connexion du client relais
Chaque tentative de connexion du client relais MUST atteindre `ready` en 15 s au plus, poignées de main TCP, TLS, HTTP et défi comprises ; sinon elle est abandonnée avec la raison `connect`.

#### Scenario: AC: tentative de connexion sans réponse
<!-- openspec-guard:test="relay client liveness > gives up a connection attempt whose handshake is never answered and tries again" -->
- **WHEN** le relais accepte la connexion TCP mais ne répond jamais à l'upgrade
- **THEN** le client abandonne la tentative au bout de 15 s, journalise `E_RELAY_TIMEOUT` (`connect`) et en ouvre une nouvelle

### Requirement: Abandon d'une connexion par le client relais
Abandonner une connexion MUST la détruire sans attendre sa fermeture, résoudre chaque envoi en attente par `offline`, signaler `disconnected`, journaliser le code stable `E_RELAY_TIMEOUT` avec sa raison et planifier la reconnexion avec le délai exponentiel habituel. La fermeture volontaire du client MUST aussi résoudre les envois en attente par `offline`.

#### Scenario: AC: fermeture du client
<!-- openspec-guard:test="relay client liveness > settles pending sends as offline on close" -->
- **WHEN** le client est fermé alors qu'un envoi attend son acquittement
- **THEN** cet envoi se résout aussitôt en `offline`

### Requirement: Délai de reconnexion après un abandon
Après un abandon, `ready` MUST NOT ramener le délai entre tentatives au minimum : il n'y revient qu'après une réponse du relais à un envoi, ou un intervalle de battement vivant sans envoi en attente.

#### Scenario: AC: délai qui continue de croître après un abandon
<!-- openspec-guard:test="relay client liveness > keeps backing off after giving up, instead of redialing every second a relay that never acknowledges" -->
- **WHEN** le client abandonne deux connexions de suite à un relais qui accepte les trames sans jamais les acquitter
- **THEN** la deuxième reconnexion attend le double de la première au lieu de repartir du délai minimal
