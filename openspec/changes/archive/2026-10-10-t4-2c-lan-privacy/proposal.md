## Why

Suites de la revue de T4.2 (D63) : l'annonce mDNS porte l'identifiant fixe du nœud, ce qui permet de suivre une personne d'un réseau à l'autre ; un seul échec passager du multicast laisse le mode local en `denied` pour toujours.

Choix de Guillaume le 10 octobre 2026 (« oui aux 4 ») : clé de découverte par nœud transmise chiffrée aux pairs, jeton HMAC tournant toutes les 15 minutes ; jeton tiré du code d'invitation tant qu'elle court ; nouvel essai à délai croissant après un refus ; pas de canal chiffré propre à la session pour l'instant ; ancien format abandonné. Décision D67.

## What Changes

- **Annonce** : nom de service aléatoire et jeton `t` = HMAC(clé de découverte, époque de 15 min), plus au plus trois jetons `i` tirés des invitations en cours ; plus aucun identifiant de nœud dans l'annonce.
- **Clé de découverte** : 32 octets aléatoires par nœud, gardés sous `DROP_HOME` en `0600` ; message `lan_key` chiffré envoyé à chaque pair à l'appairage, aux pairs présentés par l'équipe et à chaque démarrage ; clés des pairs gardées à part, en `0600`.
- **Reconnaissance** : un pair est retrouvé par son jeton de l'époque courante ou précédente ; l'inviteur, par le jeton de l'invitation que l'invité détient.
- **Reprise** : après un refus, nouvel essai à 30 s, 1 min, 2 min puis toutes les 5 min ; retour à `on` dès que ça marche, journalisé.

## Capabilities

### Modified Capabilities

- `node` : annonce tournante, clé de découverte, reprise.
- `protocol` : message `lan_key`.

## Non-goals

- Canal chiffré propre à la session locale (D67 : à rouvrir après l'essai T4.6 si besoin).
- Révocation d'une clé de découverte par pair : aucune désinscription n'existe encore.
- Compatibilité avec l'ancienne annonce à identifiant fixe.

## Impact

`packages/protocol` (message), `packages/node` (lan, lan-mdns, moteur, stockage, daemon).
