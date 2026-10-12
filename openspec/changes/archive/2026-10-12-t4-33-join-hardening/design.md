## Context

T4.23 a livré le lien unique : un Node sans pair ni équipe passe, au clic sur « Rejoindre », au relais nommé par l'invitation (`switchRelay` réécrit `config.json`, `RelayClient.switchUrl` change la connexion). La revue de fusion (D95) a reporté en T4.33 cinq durcissements. Le relais et l'invitation sont choisis par la personne qui invite, donc par un tiers : la règle suivie ici est que ce choix ne déplace rien d'autre que la connexion au relais.

Sources lues :

- Node.js 24 (version installée : v24.21.0), `tls.createSecureContext`, option `ca` (https://nodejs.org/docs/latest-v24.x/api/tls.html, lue le 12 octobre 2026) : « If specified, the default list would be completely replaced (instead of being concatenated) by the certificates in the `ca` option ». `ws` transmet cette option à la connexion TLS. Garder `ca` pour un autre hôte ferait donc de l'autorité de l'organisation la seule autorité de ce relais-là : un relais public (certificat d'une autorité connue) échouerait, et l'autorité privée, qui peut signer n'importe quel nom, deviendrait juge d'un hôte qu'elle ne sert pas.
- Code existant : `packages/node/src/private-config.ts` (`switchRelay`, `locked`, `replace`), `packages/node/src/daemon.ts` (`relayPlan`, `adoptRelay`), `packages/node/src/engine.ts` (`join`, `adopt`), `packages/protocol/src/policy.ts` (domaine `drop-policy-v1|`), `apps/desktop/src-tauri/src/main.rs` (`DEFAULT_RELAY`).

## Goals / Non-Goals

**Goals :** une invitation ne change que le relais du poste, et seulement d'un poste resté sur le relais par défaut ; un échec dit sa cause ; une signature d'invitation ne peut passer pour aucune autre signature drop.

**Non-Goals :** le panneau React et `single-instance` (T4.31) ; brancher une autorité `ca` de politique dans le daemon ; un code stable pour chaque échec d'écriture disque.

## Decisions

1. **Garder le relais adopté hors de `network.origins` (plutôt que refuser un relais de bouclage venant d'une invitation).** La ligne T4.33 laisse le choix. Refuser le bouclage ne traiterait pas un relais à adresse privée (`ws://10.0.0.5/v1`), qui entrerait toujours dans les destinations, et casserait le banc à deux Nodes sur un seul poste. Garder hors des destinations traite tous les cas : D95 l'applique déjà à un relais DNS. `switchRelay` ne touche donc plus du tout à `network` : il n'ajoute pas le relais adopté et ne retire aucune origine, ce qui règle aussi « ne pas retirer une origine que le propriétaire avait listée » (le fichier ne dit pas qui a listé l'origine de l'ancien relais ; la garder ne donne rien de plus qu'avant l'invitation).
2. **Marque `relayAdopted: true` dans `config.json`.** Le schéma du profil privé exige qu'un relais littéral soit une origine listée (T3.1). Le relais adopté ne l'est pas, par la décision 1 : la marque l'en dispense, lui seul, et reste vraie après redémarrage. Le propriétaire qui édite `config.json` à la main peut la retirer ; ce n'est pas une frontière contre lui.
3. **Adopter seulement depuis le relais par défaut.** `DEFAULT_RELAY_URL = 'ws://127.0.0.1:7780/v1'` est exporté par `packages/node` (`home.ts`) et utilisé par `drop init` ; la coque Tauri garde sa constante `DEFAULT_RELAY`, et un test vérifie que les deux sont égales. `relayPlan` rend `kept` dès que le relais courant n'est pas celui-là, avant toute autre vérification : un poste réglé à la main (`drop init --relay`, `DROP_RELAY_URL`, édition) garde son relais, l'appairage passant par tous ses chemins comme pour un poste déjà relié. Une personne qui a choisi `ws://127.0.0.1:7780/v1` à la main n'est pas distinguée du défaut ; c'est accepté.
4. **Vraie cause.** `E_LOCKED` et `E_CONFLICT` entrent dans `ERROR_CODES`. `locked` lève `DropError('E_LOCKED', …)` et `replace` `DropError('E_CONFLICT', …)`, messages inchangés (la CLI et les tests existants les lisent). `adoptRelay` dans le daemon et `adopt` dans le moteur laissent passer ces deux codes ; le journal porte le vrai code ; l'API les rend en 400 avec un message propre ; l'invitation reste inutilisée, comme pour tout refus d'adoption. Les autres échecs (droits, disque) restent `E_INVITE_RELAY` : aucun code stable n'existe pour eux et en créer un sort de la ligne.
5. **`ca` liée au nom d'hôte.** `switchUrl` compare `new URL(...).hostname` de l'ancien et du nouveau relais : même hôte (autre port, autre chemin), l'autorité reste ; autre hôte, elle tombe et le client revient aux autorités par défaut.
6. **Domaine `drop-invite-v1|`.** La signature couvre `drop-invite-v1|` + JSON canonique des autres champs, comme `drop-policy-v1|` pour la politique. Une invitation de T4.23 (sans domaine) est refusée en `E_INVITE_SIG` : elles expiraient en 24 h et aucune release n'a été publiée, il n'y a donc personne à ménager (même raisonnement que D95 pour les invitations non signées).

## Risks / Trade-offs

- [Un poste réglé à la main ne suit plus le lien vers le relais de l'équipe] → c'est voulu : il garde le relais que son propriétaire a choisi ; il peut changer de relais lui-même. La carte affiche alors `kept`, sans phrase sur un changement de relais.
- [Le test de bout en bout démarre l'invitée sur `ws://127.0.0.1:7780/v1`] → si un relais tourne sur ce port de la machine de test, le client y tente une authentification refusée avant de changer de relais ; sans effet sur le relais ni sur le test.
- [Verrou resté après un arrêt brutal] → `E_LOCKED` le dit désormais ; la marche à suivre (retirer `.private-migration.lock` après avoir vérifié le PID) reste celle de la migration privée.
