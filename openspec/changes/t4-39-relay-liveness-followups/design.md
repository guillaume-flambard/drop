# Design

## Contexte

T3.1f (D100) a donné au client relais un battement de cœur (15 s), un délai d'acquittement (15 s depuis le rappel d'écriture de `ws`) et un délai de connexion (15 s). Tout envoi libéré se résout en `offline`, que la file d'envoi du moteur réessaie. Trois limites sont restées ouvertes (`proof/verification.md` de T3.1f) ; T4.39 les traite dans cet ordre.

Sources lues : `ws` 8.22.0 (version du lockfile), `doc/ws.md` au tag `8.22.0` (événements `upgrade` et `open`, rappel de `send` « invoked when data is written out », `bufferedAmount` « queued [...] but not yet transmitted to the network ») et le code de `lib/websocket.js` (`setSocket` attache ses propres écouteurs `data` avant d'émettre `open`) ; documentation Node.js 24 (`message.socket` de `http.IncomingMessage`, événement `data` de `net.Socket`). Node installé : 24.21.0.

## 1. Envoi sans réponse : `unconfirmed`

### Ce qui est su, et seulement cela

Le client relais sait deux choses d'un envoi qui n'a pas de réponse :

- aucune connexion n'était prête : la trame n'a jamais quitté le Node, issue `offline` (inchangée) ;
- la trame a été confiée à une connexion (`socket.send`) qui a disparu avant la réponse : le relais a pu la recevoir et la router, ou non. Issue nouvelle `unconfirmed`.

Le rappel d'écriture de `ws` ne tranche pas : il arrive quand Node a remis les octets au système, pas quand le relais les a lus, et un abandon peut survenir entre l'écriture complète et l'appel du rappel. Seul un rappel en erreur prouve que la trame n'est pas partie en entier ; un envoi dans ce cas se résout en `offline`. Tout autre envoi libéré se résout en `unconfirmed`.

### Pourquoi une issue nouvelle, malgré D100

D100 avait écarté une issue nouvelle parce qu'elle obligeait à toucher chaque appelant sans rien gagner. Le gain est maintenant établi : une demande initiale est envoyée hors file (`queueOffline: false`) et le moteur traite `offline` comme une non-livraison sûre (spec node, « Refus explicite du relais côté demandeur »). Confondre les deux cas présente un refus au demandeur alors que l'exécuteur a pu recevoir la demande. Les appelants restent peu nombreux : `NodeEngine.send`, `NodeEngine.drainOutbox`, `NodeEngine.requestDrop` et la passerelle (`bridge.ts`, qui traite tout ce qui n'est pas `delivered` ou `queued` comme un échec, inchangé).

### Moteur

- `unconfirmed` repart toujours dans la file d'envoi, que l'appel ait demandé `queueOffline` ou non. Le renvoi porte la même enveloppe, donc le même identifiant : si la première copie est arrivée, l'anti-rejeu du destinataire (`openEnvelope`, `ReplayCache`) écarte la seconde sans effet ; sinon la seconde la remplace.
- `requestDrop` sur `unconfirmed` : la demande reste dans `outbound`, à l'état `proposed`, avec `delivery: 'unconfirmed'` ; la clé plafonnée est gardée (l'exécuteur en a besoin s'il a reçu la demande) ; l'enveloppe en file porte l'identifiant de la demande (`confirms`). Le moteur journalise `send_unconfirmed` avec l'identifiant de la demande et le pair, sans contenu.
- `delivery` disparaît quand un renvoi de cette enveloppe reçoit `delivered` ou `queued` (preuve équivalente à celle d'une demande initiale ordinaire), ou quand un message de l'exécuteur sur cette demande arrive (`drop_status`, `drop_result`, `drop_error` : `onRequesterUpdate`).
- Une demande initiale `offline` garde son comportement : retirée, clé révoquée, 429.

### API locale et requester-mcp

`POST /drops` ajoute `delivery: 'unconfirmed'` à sa réponse 201 quand c'est le cas ; `/ask` l'ajoute à l'entrée concernée de `asked` ; `GET /drops/:id` le rend déjà, puisqu'il sert l'objet `OutboundDrop`. `requester-mcp` valide le champ (`z.literal('unconfirmed').optional()`) et le traduit :

- `request_drop` : `{ drop_id, status: 'unconfirmed', message: "Demande envoyée à {owner}, mais le relais n'a pas confirmé sa réception. drop la renvoie : ne la relance pas, suis-la avec get_drop_result." }`, sans `isError` : rien n'est refusé ;
- `get_drop_result` en attente : `delivery: 'unconfirmed'` ajouté à `{ status: 'pending', state }` ;
- `get_drop_results`, `request_drops`, `ask_team` : la mention « réception non confirmée » à côté de la demande concernée.

## 2. Erreur du relais sans identifiant

### L'ordre des réponses

Le relais traite les trames d'une connexion dans l'ordre où `ws` les livre, et `route` est synchrone après l'authentification : chaque trame `envelope` reçoit exactement une trame `ack` ou `error` sur la même connexion, ou la connexion est fermée (`from` usurpé, quota `E_RATE`). Les trames `envelope` que le relais pousse vers ce Node ne sont pas des réponses. Le client n'envoie une trame `envelope` qu'après `ready`. Les réponses d'une connexion arrivent donc dans l'ordre des envois. Cette propriété n'était écrite nulle part ; elle devient une exigence du relais, testée contre le vrai serveur.

### Attribution

Le client tient, par connexion, la liste ordonnée des trames envoyées et encore sans réponse (identifiant et taille). À chaque réponse :

- avec identifiant : l'entrée de tête doit porter cet identifiant ; elle est retirée. Si ce n'est pas la tête (ou si l'identifiant est inconnu), l'ordre n'est plus établi pour cette connexion : l'entrée correspondante est retirée si elle existe, et plus aucune erreur sans identifiant n'est attribuée sur cette connexion ;
- sans identifiant (seules les trames `error` le peuvent) : si l'ordre tient et que la liste n'est pas vide, la tête est retirée et l'envoi qui porte son identifiant se résout aussitôt avec ce code (`E_SCHEMA` ou `E_RATE`). Sinon rien n'est attribué et le délai libère l'envoi, comme avant.

Une réponse attribuée par erreur ne peut venir que d'un relais qui viole l'ordre sans que le client le voie ; le relais peut déjà mentir sur un acquittement, l'attribution n'ajoute pas de pouvoir. `E_RATE` sans identifiant est suivi de la fermeture `1013`, qui libère les autres envois.

## 3. Liaison lente

### Le plancher de débit

Le délai d'acquittement part de l'appel à `send`, et non plus du rappel d'écriture : le rappel arrive dès que le système a pris les octets, alors que la trame met encore longtemps à passer (`bufferedAmount` ne voit pas le tampon du système). Le délai vaut :

`(15 s + octets en vol / 4 000 octets par seconde) × 2^n`

- **octets en vol** : la somme des tailles des trames envoyées sur cette connexion et encore sans réponse, celle-ci comprise ; le relais lit les trames dans l'ordre, la dernière attend donc toutes les précédentes ;
- **4 000 octets par seconde** : 32 kbit/s, un lien mobile dégradé (classe GPRS). Une enveloppe de 256 Kio y passe en 66 s : délai de 81 s, au lieu de 15 s qui échouaient sous 140 kbit/s. Une petite trame garde un délai proche de 15 s ;
- **n** : le nombre d'abandons `ack` déjà causés par cette enveloppe (même identifiant), au plus 2 : le délai double à chaque renvoi, jusqu'à quatre fois la base. Un lien plus lent que le plancher laisse donc passer l'enveloppe à la deuxième ou troisième tentative.

### Renvoi borné

Après trois abandons `ack` causés par la même enveloppe, le client ne l'envoie plus : `send` se résout aussitôt en `E_RELAY_TIMEOUT` et le journal l'indique (`reason: 'ack_retries'`). Le moteur traite cette issue comme un refus définitif (ni file ni nouvel essai), comme `E_SCHEMA`. Au plus trois envois d'une même enveloppe sur le chemin du relais, au lieu d'un renvoi toutes les 15 s environ jusqu'à son expiration (15 min). `E_RELAY_TIMEOUT` reste un code de transport hors `ERROR_CODES` (D100) : il ne voyage pas sur le réseau. Le compteur par identifiant est borné à 256 entrées (la plus ancienne sort) et une entrée disparaît dès que l'identifiant reçoit une réponse.

### Battement de cœur

- **Tout octet reçu prouve la connexion vivante.** À l'ouverture, le client écoute l'événement `data` du socket réseau (`response.socket` de l'événement `upgrade` de `ws`, attaché dans `open`, après les écouteurs de `ws`). Une grosse trame entrante qui arrive lentement n'abandonne plus la connexion. Un socket que `ws` ne lit plus (`pause`, cas `CLOSE_WAIT` de T4.6a) n'émet pas `data` : il reste détecté.
- **Un intervalle muet n'abandonne pas une connexion qui attend un envoi dans son délai.** Sur une voie montante saturée, le ping du client attend derrière la grosse trame et le relais ne pinge que toutes les 25 s. Tant qu'un envoi attend sa réponse, son délai d'acquittement (proportionnel aux octets en vol) borne l'attente ; sans envoi en attente, la règle de T3.1f s'applique.

### Côté relais

Le relais coupe un Node après deux pings sans pong (50 à 75 s). Le pong d'un Node dont la voie montante porte une grosse trame attend derrière elle : à 32 kbit/s, une trame de 256 Kio prend 66 s et le Node serait coupé avant de la finir. Le relais compte désormais tout octet reçu d'un Node authentifié comme une réponse (`request.socket`, événement `data`). Un Node qui envoie des octets sans fin pour rester connecté le pouvait déjà en répondant aux pings ; la taille des trames reste bornée par `maxPayload`.

## Risques

- Un relais qui accepte les trames sans jamais répondre fait abandonner une enveloppe après trois essais au lieu de la réessayer jusqu'à son expiration. Accepté : c'est la borne demandée, et une coupure ordinaire (fermeture, redémarrage du relais) ne compte pas.
- Une connexion morte avec une grosse trame en vol est détectée par le délai de cette trame (jusqu'à 81 s, 324 s au troisième essai) au lieu de 15 à 30 s.
- Une demande dont la réception n'est jamais confirmée reste `proposed` et garde sa clé plafonnée ; c'était déjà le cas d'une demande `queued` jamais retirée par l'exécuteur.

## Vérification

Tests du client contre un faux relais (minuteurs simulés de vitest) : issue `unconfirmed` à l'abandon et à la fermeture, `offline` sans connexion, erreur sans identifiant attribuée et non attribuée hors ordre, délai proportionnel aux octets, délai doublé et renvoi borné, grosse trame entrante lente, voie montante saturée. Tests du vrai relais : ordre des réponses, erreur sans identifiant résolue aussitôt, octets reçus comptés comme réponse au ping. Tests du moteur, de l'API locale et de requester-mcp pour `unconfirmed` de bout en bout.
