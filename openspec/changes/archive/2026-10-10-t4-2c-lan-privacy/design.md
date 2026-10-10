## Context

T4.2 annonce `_drop._tcp` avec `txt: { id, v: '1' }` et un nom `drop-<16 premiers caractères de l'id>` ; `LanService.connect` cherche l'adresse d'un pair par son identifiant (`discovery.lookup`). Un refus de la découverte (`onError`) met l'état à `denied` sans retour.

## Decisions

- **Jeton** : `t = base64url(HMAC-SHA256(clé, "drop-lan-tag|" + époque))[0..22]`, époque = `floor(maintenant / 15 min)`. Un pair est reconnu si `t` vaut le jeton de l'époque courante ou précédente calculé avec sa clé. Invitation : `i = HMAC-SHA256(jeton à usage unique, "drop-lan-invite|" + époque)`, au plus trois, seulement pour les invitations non expirées.
- **Nom** : `drop-` suivi de 8 octets aléatoires en hexadécimal, renouvelé à chaque époque ; l'annonce est republiée quand le jeton ou les invitations changent (vérifié chaque minute).
- **Découverte** : l'interface ne cherche plus par identifiant ; elle garde les annonces vues (256 au plus) et `find(correspond)` laisse le service dire laquelle correspond au pair visé. La poignée de main signée reste la seule preuve d'identité.
- **Clés** : clé propre en `DROP_HOME/lan-key` (`0600`), créée au premier démarrage ; clés des pairs dans `DROP_HOME/lan-keys.json` (`0600`), jamais dans `peers.json`. Le message `lan_key { key }` (32 octets en base64url) n'est accepté que d'un pair connu, pour lui-même.
- **Envoi** : à l'appairage (des deux côtés), aux pairs présentés par le roster d'équipe, et une fois au démarrage du daemon vers tous les pairs.
- **Reprise** : délais 30 s, 60 s, 120 s, puis 300 s ; chaque essai relance la découverte (et l'écoute si elle avait échoué) ; `lan_restored` au retour, `lan_denied` à chaque refus.

## Risks / Trade-offs

- Un pair qui a reçu la clé peut toujours reconnaître le nœud, même après une brouille : il n'existe pas encore de retrait d'un pair ; on changera la clé quand ce retrait existera.
- Les invitations en cours restent reconnaissables par quiconque a le code : c'est le but.
- Adresses et port restent visibles sur le réseau local, comme pour tout service mDNS.
