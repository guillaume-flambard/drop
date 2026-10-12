## Why

La revue de T4.23 (12 octobre 2026, D95) a laissé cinq durcissements du lien unique, regroupés en T4.33. Aucun n'est une faille exploitable aujourd'hui, mais chacun élargit en silence ce qu'une invitation, c'est-à-dire un texte venu d'un tiers, peut changer sur le poste :

- le relais littéral adopté entre dans `network.origins`, les destinations du modèle et des serveurs MCP (sans portée pratique tant que l'accès réseau du modèle n'accepte que `http:` et `https:`, mais c'est un tiers qui choisit une destination) ;
- `switchRelay` retire de `network.origins` l'origine de l'ancien relais, même quand le propriétaire l'y avait listée lui-même ;
- un échec de la réécriture de `config.json` (verrou occupé, fichier changé entre-temps) est rendu comme `E_INVITE_RELAY`, « relais non autorisé », qui ment sur la cause ;
- `RelayClient.switchUrl` garde l'autorité de certification `ca` du relais d'origine (T4.10) pour un relais d'un autre hôte : Node remplace alors toute la liste des autorités par celle-là ;
- un poste réglé à la main sur un relais interne passerait au relais de l'invitation dès lors qu'il n'a ni pair ni équipe ;
- la signature de l'invitation porte sur le JSON canonique nu, sans domaine propre, quand la politique d'organisation signe déjà sous `drop-policy-v1|`.

## What Changes

- **Relais adopté hors des destinations** : `switchRelay` ne touche plus à `network.origins` : il n'y ajoute pas le relais adopté et n'en retire aucune origine. `config.json` porte `relayAdopted: true`, qui dispense ce relais seul de la règle « un relais littéral est une origine listée ».
- **Adoption depuis le relais par défaut seulement** : un poste n'adopte le relais d'une invitation que s'il est encore sur le relais de bouclage par défaut `ws://127.0.0.1:7780/v1` (celui de `drop init` et de l'app, désormais une constante partagée `DEFAULT_RELAY_URL`). Un relais réglé à la main est gardé (`kept`).
- **Vraie cause** : `E_LOCKED` et `E_CONFLICT` entrent dans `ERROR_CODES` ; le verrou et la comparaison de `config.json` lèvent des `DropError` ; le moteur et l'API les rendent tels quels (400, message propre), l'invitation reste inutilisée.
- **Autorité `ca`** : `switchUrl` vers un autre nom d'hôte abandonne l'autorité supplémentaire ; elle reste pour le même hôte.
- **Domaine de signature** : `sig` signe `drop-invite-v1|` suivi du JSON canonique. Une invitation signée au format de T4.23 est refusée (`E_INVITE_SIG`) ; elles vivaient 24 h et aucune release n'existe.

## Capabilities

### Modified Capabilities

- `protocol` : domaine de signature des invitations ; `E_LOCKED` et `E_CONFLICT` dans les codes stables.
- `node` : profil privé (relais adopté hors des destinations), refus de « Rejoindre » à vraie cause, relais adopté seulement depuis le relais par défaut, origines conservées.
- `relay` : changement de relais du client sans l'autorité `ca` d'un autre hôte.

## Non-goals

- Plugin `single-instance`, panneau React et son bouton « Inviter » (T4.31).
- Brancher une autorité `ca` de politique dans le daemon : il n'en passe aucune aujourd'hui ; seul le client du relais est durci.
- Un code stable pour les autres échecs d'écriture (disque plein, droits) : ils restent `E_INVITE_RELAY`, voir le design.

## Impact

`packages/protocol` (invite, errors), `packages/node` (private-config, home, daemon, engine, api, cli), `packages/relay` (client), tests de ces paquets et `test/desktop-join-link.test.ts`, `docs/GUIDE.md` ou `docs/ONBOARDING.md` si le comportement y est décrit.
