# Design

## Contexte

`RelayClient` (`packages/relay/src/client.ts`) ouvre un WebSocket sortant, signe le défi, attend `ready`, puis envoie les enveloppes et garde dans `pending` la fonction qui résout chaque envoi. Seuls l'acquittement, une erreur portant l'identifiant ou l'événement `close` de `ws` résolvent un envoi. Le client n'émet aucun ping et n'arme aucun délai. Le relais, lui, pinge chaque Node toutes les 25 s et coupe après deux pings sans réponse (spec `relay`, « Ping de maintien ») : il se protège, le client non.

## Cause racine du `CLOSE_WAIT` de T4.6a

Reproduit avec `ws` 8.22.0 (version du lockfile) sous Node 24 :

- Une fin de connexion (FIN) du relais ou d'un proxy est bien traitée par `ws` dans chaque phase essayée : connexion établie, en clair ou en TLS, avec ou sans `close_notify`, pendant la poignée de main TLS ou pendant l'upgrade HTTP. `ws` ferme son côté (`socketOnEnd` appelle `socket.end()`), émet `close`, et le client se reconnecte. Aucun `CLOSE_WAIT` ne reste.
- Deux cas laissent le client bloqué pour toujours, sans `close` ni reconnexion : un relais ou un proxy qui cesse de répondre sans fermer (aucun FIN n'arrive, et le client, muet, n'envoie rien qui révélerait la panne), et une tentative de connexion dont la poignée de main n'est jamais servie (`handshakeTimeout` n'est pas posé).
- Un `CLOSE_WAIT` qui dure signifie que le processus n'a pas lu le FIN arrivé sur ce socket. Le test le reproduit en suspendant la lecture du socket côté client (`WebSocket#pause`) avant que le relais ferme : sans délai côté client, rien ne libère jamais ce socket ni ne relance la connexion.

La cause racine tient donc dans l'absence de toute vivacité côté client : ni ping, ni délai d'acquittement, ni délai de connexion. Quelle que soit la raison pour laquelle le socket cesse de porter des trames (pair disparu sans FIN, proxy figé, socket plus lu), le client attend sans fin. Pour l'incident précis, on ne peut pas trancher après coup pourquoi ce socket n'était plus lu : l'app tournait depuis un DMG dont le fichier avait été supprimé (montage en `Input/output error`), ce qui peut avoir figé une partie du processus. Le correctif ne dépend pas de cette cause : il ne s'appuie ni sur la lecture du FIN ni sur l'événement `close` de `ws`.

## Décisions

- **Battement de cœur.** Un intervalle par socket, armé à l'ouverture (`open`) : si aucune trame n'est arrivée depuis le tick précédent, la connexion est abandonnée ; sinon le drapeau de vie repasse à faux et le client envoie un ping. Toute trame entrante remet le drapeau à vrai : `pong`, `ping` du relais, `message`. Même schéma que le réseau local (`lan.ts`, `PING_MS` 15 s) et que l'exemple « How to detect and close broken connections? » du README de `ws` 8.22.0. Intervalle par défaut 15 s : détection entre 15 et 30 s, sous la coupure du relais lui-même (50 à 75 s).
- **Délai d'acquittement.** 15 s par envoi, entre les 5 s du réseau local (un saut sur le réseau de la maison) et les 40 s d'iroh (bout en bout par un pair). Le relais acquitte dès le routage ; 15 s laissent passer une enveloppe de 512 Kio sur un lien lent. Un délai dépassé abandonne toute la connexion, comme le réseau local coupe une session sans preuve de réception : ce socket ne peut plus être cru pour les envois suivants.
- **Délai de connexion.** 15 s de l'ouverture jusqu'à `ready`, ce qui couvre TCP, TLS, upgrade HTTP et défi. Le relais coupe lui-même une authentification au bout de 10 s ; 15 s laissent la marge réseau.
- **Abandon.** `abandon(socket, raison)` détache d'abord le socket (`this.socket = undefined`), puis libère les envois (`offline`), émet `disconnected`, planifie la reconnexion avec le délai exponentiel existant, journalise `E_RELAY_TIMEOUT`, et enfin appelle `terminate()`. L'événement `close` qui suit éventuellement est ignoré, comme aujourd'hui pour un socket remplacé. On n'attend pas `close` : `ws` ne l'émet qu'après que son récepteur a fini, et un socket qui n'est plus lu ne le fait jamais.
- **Issue d'un envoi libéré : `offline`.** C'est l'issue existante d'un envoi en attente quand la connexion tombe, et la seule que le moteur remet dans sa file (`send` et `drainOutbox`). Une issue nouvelle obligerait à toucher chaque appelant du moteur sans rien gagner. Un renvoi d'une enveloppe que le relais avait en fait reçue reste sûr : l'enveloppe garde son identifiant et le destinataire refuse un doublon (anti-rejeu).
- **Code journalisé : `E_RELAY_TIMEOUT`.** `ERROR_CODES` (`packages/protocol/src/errors.ts`) liste les codes du protocole, ceux qui voyagent dans un message ou une trame ; aucun ne désigne un délai de transport (`E_EXPIRED` désigne une demande expirée). Les chemins voisins journalisent leurs codes de transport hors de cette liste (`E_LAN_ACK`, `E_IROH_TIMEOUT`). `E_RELAY_TIMEOUT` suit cette règle : code stable de journal, jamais envoyé sur le réseau, donc hors `ERROR_CODES`.
- **`close()`** libère les envois en attente et arrête tous les minuteurs du client.
- `switchUrl` n'est pas modifiée ; elle détruit déjà l'ancien socket et le nouveau reçoit les mêmes minuteurs par `open()`.

## Risques

- Faux positif sur un lien très lent : un envoi de 512 Kio à moins de 300 kbit/s dépasserait 15 s. Atténué : la conséquence est un renvoi, pas une perte, et les délais restent des options.
- Trafic supplémentaire : un ping de quelques octets toutes les 15 s par Node, négligeable ; les pings ne sont pas des messages et ne comptent pas dans le quota du relais.
- Un renvoi après un acquittement perdu crée un doublon que le destinataire refuse ; un `drop_request` envoyé hors file (`queueOffline: false`) est abandonné côté demandeur comme lors d'une coupure ordinaire, alors que l'exécuteur a pu le recevoir. Comportement inchangé par rapport à une fermeture, noté comme limite.

## Vérification

Tests du client contre un faux relais (minuteurs simulés de vitest, délais par défaut) : relais muet sans fermeture, fermeture à moitié, envoi sans acquittement, poignée de main jamais servie, socket plus lu en `CLOSE_WAIT`, `close()`. Test du Node avec un vrai relais derrière un proxy figé : la demande d'appairage, restée sans acquittement, repart de la file à la reconnexion et l'appairage aboutit. Puis lint, typecheck, suite complète, openspec-guard, `/review` et `/cso`.
