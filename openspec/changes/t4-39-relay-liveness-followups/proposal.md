# Proposal

## Why

T4.39 reprend trois limites laissées ouvertes par T3.1f (D100), notées à la revue du 12 octobre 2026 :

1. Une demande `drop_request` dont la trame est partie vers le relais mais n'a reçu ni acquittement ni erreur se résout en `offline`. Le moteur la traite comme une non-livraison : il retire la demande, révoque la clé plafonnée et l'API locale répond 429 « Trop de demandes actives ». L'agent demandeur lit un refus alors que l'exécuteur a pu recevoir la demande et la présenter au propriétaire ; s'il répond, le résultat arrive pour une demande effacée.
2. Le relais répond `E_SCHEMA` sans identifiant quand une enveloppe échoue au schéma. Le client ne sait pas à quel envoi l'attribuer : l'envoi attend son délai de 15 s, la connexion entière est abandonnée, et l'enveloppe revient en file jusqu'à son expiration.
3. Sur une liaison lente (vers 140 kbit/s et moins), une enveloppe de 256 Kio ne passe pas en 15 s : son délai abandonne la connexion, la file la renvoie, et la boucle dure jusqu'à l'expiration de l'enveloppe. Pendant ce temps, aucune trame n'arrive au client (son ping attend derrière la grosse trame) et le relais ne reçoit pas de pong : le battement de cœur du client et le ping du relais coupent aussi la connexion. Une grosse trame entrante lente produit le même effet côté client.

## What Changes

- **Issue `unconfirmed`.** Le client relais distingue un envoi qui n'a jamais quitté le Node (`offline` : pas de connexion prête) d'un envoi confié à une connexion qui a disparu avant la réponse (`unconfirmed` : le relais a pu le recevoir). Abandon, fermeture, changement de relais et renvoi du même identifiant libèrent désormais en `unconfirmed`.
- **Moteur.** `unconfirmed` repart toujours dans la file d'envoi, même pour une demande initiale : le renvoi est sûr, l'enveloppe garde son identifiant et l'anti-rejeu du destinataire écarte un doublon. Une demande initiale `unconfirmed` reste active, à l'état `proposed`, avec `delivery: 'unconfirmed'` ; sa clé plafonnée est gardée, l'API répond 201. `delivery` disparaît dès qu'un renvoi est acquitté par le relais ou qu'un message de l'exécuteur sur cette demande arrive.
- **requester-mcp.** `request_drop` rend `status: 'unconfirmed'` et un message qui dit ce qui est su ; `get_drop_result`, `get_drop_results`, `request_drops` et `ask_team` signalent la réception non confirmée tant qu'elle l'est.
- **Erreur sans identifiant.** Le relais répond à chaque trame `envelope` par exactement une réponse, dans l'ordre de réception (déjà vrai, désormais exigé et testé). Le client attribue une erreur sans identifiant à l'envoi le plus ancien encore sans réponse sur cette connexion, tant que toutes les réponses précédentes sont arrivées dans l'ordre ; sinon il laisse le délai la libérer.
- **Liaison lente.**
  - Le délai d'acquittement part de l'appel et vaut 15 s plus le temps de transmettre à 32 kbit/s les octets encore sans réponse sur la connexion, ceux de l'envoi compris.
  - Il double à chaque abandon déjà causé par la même enveloppe (au plus quatre fois la base) ; après quatre abandons, le délai dépassé libère l'envoi en `unconfirmed` sans plus abandonner la connexion.
  - Côté client, tout octet reçu prouve la connexion vivante, et un intervalle muet n'abandonne pas la connexion tant qu'un envoi attend dans son délai : ce délai borne l'attente.
  - Côté relais, tout octet reçu d'un Node compte comme une réponse au ping.

## Non-goals

- Pas de changement du format des trames ni des codes d'erreur du relais : l'erreur sans identifiant reste sans identifiant.
- Pas de traitement des chemins directs (réseau local, iroh) : un chemin direct qui a écrit l'enveloppe sans preuve de réception rend toujours `unreachable` ; noté en limite.
- Pas de changement de la passerelle (`packages/gateway`) : `unconfirmed` y suit le chemin d'un envoi non acquitté, comme `offline` avant.
- Pas d'expiration côté demandeur d'une demande dont la réception n'est jamais confirmée ; noté en limite.
- Pas de mesure du débit réel : le plancher de 32 kbit/s est une hypothèse documentée, les délais restent des options du constructeur.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `relay` : issue `unconfirmed`, délai d'acquittement proportionnel aux octets en vol et doublé par enveloppe, renvoi borné, battement de cœur qui compte les octets reçus et attend un envoi en cours, réponses dans l'ordre et attribution d'une erreur sans identifiant, ping du relais qui compte les octets reçus.
- `node` : demande initiale à la réception non confirmée gardée active et renvoyée.
- `requester-mcp` : statut `unconfirmed` dans les sorties.

## Impact

`packages/relay/src/client.ts`, `packages/relay/src/server.ts`, `packages/node/src/engine.ts`, `packages/node/src/api.ts`, `packages/requester-mcp/src/{client,tools}.ts`, tests dans les trois packages. Aucune dépendance nouvelle, aucun changement de protocole sur le réseau.
