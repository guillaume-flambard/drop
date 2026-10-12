# Vérification T3.1f

## Source canonique et graphe

Intention et hors périmètre : `proposal.md`. Cause racine, choix et risques : `design.md`. Exigences et critères : les deltas `specs/relay` (cinq exigences du client relais) et `specs/node` (reconnexion). Graphe fini : `tasks.md` et `state.json`. Aucun TODO marqué fait sans la preuve citée ici.

| TODO | Priorité | Exigence | Statut | Preuve |
| --- | --- | --- | --- | --- |
| P0-1 reproduire et expliquer le `CLOSE_WAIT` | P0 | toutes | DONE | expériences ci-dessous ; `design.md`, « Cause racine » |
| P0-2 battement de cœur | P0 | Battement de cœur du client relais | DONE | `client-liveness.test.ts` : relais muet, fermeture à moitié, socket plus lu en `CLOSE_WAIT` |
| P0-3 délai d'acquittement | P0 | Délai d'acquittement du client relais | DONE | `client-liveness.test.ts` : envoi sans acquittement libéré |
| P0-4 délai de connexion | P0 | Délai de connexion du client relais | DONE | `client-liveness.test.ts` : poignée de main jamais servie |
| P0-5 abandon et reprise par la file | P0 | Abandon ; node « Reconnexion exponentielle » | DONE | `client-liveness.test.ts` : fermeture du client ; `relay-liveness.test.ts` : appairage repris après une connexion figée |
| P1-6 délai qui continue de croître après un abandon | P1 | Délai de reconnexion après un abandon | DONE | `client-liveness.test.ts` : test rouge sur `ecd9eaa`, vert après correction |
| P1-7 suite complète, guard, revue, CSO | P1 | toutes | DONE | sections suivantes |

## Expériences de cause racine (ws 8.22.0, Node 24.21.0, macOS)

Tests jetables, retirés ensuite, contre un faux relais et un proxy TLS :

- FIN reçu sur une connexion établie, en clair, en TLS avec `close_notify`, en TLS sans `close_notify` (FIN TCP seul) : `disconnected` puis reconnexion, aucun `CLOSE_WAIT` restant.
- FIN pendant la poignée de main TLS ou pendant l'upgrade HTTP : erreur, `close`, nouvelle tentative.
- Relais muet après `ready` : le client reste `connected` indéfiniment (avant correctif).
- Proxy qui accepte TCP et TLS mais ne répond jamais à l'upgrade : le client attend indéfiniment, sans `close` (avant correctif).
- Socket Node suspendu avec des octets non lus au moment du FIN : `lsof` montre `CLOSE_WAIT` côté client et `FIN_WAIT_2` côté serveur, sans `end` ni `close`. Sans octets non lus, Node émet `end` même en pause et le socket se ferme.

## Tests écrits avant le correctif

Contre `client.ts` de `origin/main` : 5 des 6 tests du client échouent (le test de fermeture à moitié passe déjà, il garde le comportement de `ws`) ; le test du Node échoue (appairage jamais abouti en 5 s). Le test du délai de reconnexion a échoué contre `ecd9eaa` (troisième connexion ouverte au bout de 1 s), puis passé après correction.

## Vérification finale

- `pnpm -r lint` : vert. `pnpm -r typecheck` : vert. `pnpm -r test` : 84 fichiers passés, 1 ignoré ; 635 tests passés, 1 ignoré.
- Tests sensibles au temps : `client-liveness.test.ts` relancé 10 fois puis 5 fois après les corrections de revue, et 3 fois pendant que toute la suite `node` tournait en parallèle ; `relay-liveness.test.ts` relancé 5 fois. Tous verts. Les tests du client tournent en moins de 400 ms grâce aux minuteurs simulés de vitest (`shouldAdvanceTime`).
- `openspec validate t3-1f-relay-ack-timeout --strict` : valide avant archivage. `openspec validate --specs --strict` : 18 specs valides après archivage.
- openspec-guard 0.3.0 avec sélecteurs : 610 critères, 446 liés par sélecteur (438 avant la change), 0 nouvel échec, 141 échecs historiques gelés. `--update-baseline` : aucun changement de la baseline.

## Revue

Revue menée sur le diff selon la liste de contrôle de gstack `/review` (passes critique et informative), puis une revue adversariale indépendante par un second agent en lecture seule. Ce n'est pas une invocation journalisée du skill gstack `/review` : son format interactif (questions, jetons de journal) ne convient pas à un sous-agent sans humain. Constats de la revue adversariale, aucun P0 ni P1 :

- P2 : après un abandon, `ready` ramenait le délai au minimum ; un relais qui accepte sans acquitter faisait recomposer chaque Node toutes les 16 s avec vidage de file et annonces. **Corrigé** (délai qui continue de croître, test rouge puis vert).
- P2 : le délai d'acquittement partait de l'appel à `send`, une grosse enveloppe sur une voie montante lente pouvait être prise pour un relais mort. **Corrigé** : le délai part du rappel d'écriture de `ws`. La voie descendante reste une limite (voir plus bas).
- P3 : trames d'un socket abandonné encore traitées (un vieux `ready`). **Corrigé** : seules ses enveloppes sont gardées.
- P3 : réentrance dans `lost()`. **Corrigé** : reconnexion planifiée avant le statut.
- P3 : une demande `drop_request` dont l'acquittement manque est abandonnée côté demandeur alors que l'exécuteur a pu la recevoir. Comportement existant à la fermeture, non modifié ; noté en limite.
- P3 : `close()` ferme encore proprement (minuteur de 30 s de `ws`) ; sans effet sur l'état du client, laissé tel quel.

## CSO

`/cso --code --diff --base origin/main --offline`, run `1791800603731-057a544626807e9a` : `finished`, `completeness: partial`. Aucun constat étayé dans le périmètre évalué. Domaines évalués : modèle d'application, surface d'attaque, OWASP 2025, STRIDE, classification des données ; LLM/MCP sans objet. Partiel parce que l'audit est statique (pas de profil d'exécution ni de scanner hors ligne) et que des fichiers binaires du dépôt (icônes, captures) ne sont pas lus. Point STRIDE principal : un relais qui retient ses acquittements bloquait le Node sans fin ; c'est désormais borné, et un renvoi garde l'identifiant de l'enveloppe, que l'anti-rejeu du destinataire refuse en double.

## Limites

- Voie descendante lente : une trame entrante de 256 Kio qui met plus de 15 à 30 s à arriver ne produit aucune trame entre-temps et la connexion est abandonnée ; le relais a déjà retiré de sa file les enveloppes envoyées à l'authentification (comportement du relais, `purge` puis `dropQueue`).
- Le relais renvoie certaines erreurs sans identifiant (enveloppe hors schéma) : l'envoi correspondant n'est pas libéré par la réponse mais par le délai, puis revient en file jusqu'à son expiration. Les enveloppes scellées par le moteur ne devraient pas échouer au schéma. Corriger demanderait de changer le contrat du relais (hors périmètre).
- Le cas précis de T4.6a n'est pas rejoué sur le VPS : la cause exacte de la suspension de lecture ne peut être établie après coup (app lancée depuis un DMG supprimé). Le correctif ne dépend pas de cette cause.
