# Proposal

## Why

T3.1f, trouvée à la revue de T3.1b. `RelayClient.send` n'attend que l'acquittement, une erreur portant l'identifiant ou la fermeture. Le client n'envoie aucun ping et n'arme aucun délai : une connexion muette ou à moitié ouverte n'est jamais détectée, un envoi peut rester en attente sans fin et bloquer le vidage de la file.

Preuve réelle en T4.6a : après le redémarrage du relais du VPS, le Node de l'app est resté une heure en `CLOSE_WAIT` sans se reconnecter (FIN reçu par le système, jamais lu par le processus). Les chemins local (ping 15 s, acquittement 5 s) et iroh (envoi borné à 40 s) ont déjà leurs délais ; le relais doit suivre.

## What Changes

- Le client relais envoie un ping toutes les 15 s. Toute trame reçue (pong, ping du relais, message) prouve que la connexion vit ; sans aucune trame pendant un intervalle complet, la connexion est abandonnée. Une connexion morte ou à moitié ouverte est donc détectée en 30 s au plus.
- Chaque envoi attend son acquittement 15 s au plus. Passé ce délai, la connexion est tenue pour morte et abandonnée.
- Une tentative de connexion doit aboutir à `ready` en 15 s ; sinon elle est abandonnée et le client réessaie avec le délai exponentiel existant (1 s à 30 s).
- Abandonner une connexion, c'est la détruire (`terminate`, qui appelle `socket.destroy()`) sans attendre l'événement `close` de `ws` : les envois en attente sont libérés avec l'issue `offline`, que le Node remet dans sa file d'envoi ; le statut passe à `disconnected` et la reconnexion est planifiée. La cause est journalisée avec le code stable `E_RELAY_TIMEOUT` et une raison (`ack`, `heartbeat`, `connect`).
- `close()` libère aussi les envois en attente (`offline`) au lieu de les laisser pendants.
- Le daemon passe son journal au client relais.

## Non-goals

- Pas de changement du serveur relais, de son ping (25 s, deux pings manqués, spec `relay`) ni du format des trames.
- Pas de changement de `switchUrl` (la PR #66 de T4.33 y touche).
- Pas de nouvel état de file ni de nouvelle issue d'envoi côté moteur : `offline` est l'issue existante qui renvoie l'enveloppe dans la file (T3.1c).
- Pas de traitement de la suspension du processus lui-même (machine en veille, processus figé) : un processus qui ne tourne plus ne peut rien détecter ; c'est au retour que les délais jouent.
- Pas de réglage par configuration utilisateur : les délais sont des options du constructeur, pour les tests.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `relay` : nouvelle exigence de vivacité côté client (battement de cœur, délai d'acquittement, délai de connexion, libération des envois).
- `node` : la reconnexion au relais couvre une connexion morte ou à moitié ouverte, et l'envoi resté sans acquittement repart à la reconnexion.

## Impact

`packages/relay/src/client.ts`, `packages/node/src/daemon.ts`, nouveaux tests dans `packages/relay/test` et `packages/node/test`. Aucune dépendance nouvelle, aucun changement de protocole. La passerelle (`packages/gateway`) profite des mêmes délais par défaut.
