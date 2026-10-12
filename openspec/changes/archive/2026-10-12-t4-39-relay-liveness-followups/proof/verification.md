# Vérification T4.39

## Source canonique et graphe

Intention et hors périmètre : `proposal.md`. Choix, sources lues et risques : `design.md`. Exigences et critères : deltas `specs/relay`, `specs/node`, `specs/requester-mcp`. Graphe : `tasks.md` et `state.json`.

| TODO | Priorité | Statut | Preuve |
| --- | --- | --- | --- |
| P0-1 issue `unconfirmed` de bout en bout | P0 | DONE | `client-liveness.test.ts` (abandon, fermeture, sans connexion), `unconfirmed.test.ts` (moteur, API), `tools.test.ts` et `client.test.ts` (requester-mcp) |
| P0-2 erreur sans identifiant | P0 | DONE | `answers.test.ts` (ordre du vrai relais, `E_SCHEMA` résolu aussitôt), `client-liveness.test.ts` (hors ordre non attribué) |
| P0-3 liaison lente | P0 | DONE | `client-liveness.test.ts` (plancher, délai doublé, lien mort non compté, trois essais, trame entrante lente), `answers.test.ts` (octets comptés par le relais) |
| P1-4 constats de revue | P1 | DONE | `unconfirmed.test.ts` (expiration, abandon), `client-liveness.test.ts` (lien mort) |
| P1-5 vérification, garde, revue, CSO, archivage | P1 | DONE | sections suivantes |

## Tests écrits avant le correctif

Contre `origin/main` : 8 des 13 tests du client relais échouent (les cinq qui passent gardent un comportement existant), 2 des 3 tests du vrai relais (l'ordre des réponses tenait déjà), les 3 tests du moteur et de l'API, les 3 tests de requester-mcp. Les deux tests du moteur ajoutés après la revue échouent quand `endUnconfirmed` est neutralisé ; le test du lien mort échoue quand tout abandon est compté.

## Vérification finale

- `pnpm -r lint`, `pnpm -r typecheck` : verts.
- `pnpm -r test` après fusion d'`origin/main` : 95 fichiers, 699 tests, tous verts. Un passage précédent sous une charge de 20 à 40 a vu trois tests sans rapport dépasser leur délai (`linear-parsing`, `detect`, `private-replay`, puis `monorepo-tooling`) ; relancés seuls, ils passent.
- Tests sensibles au temps (`client-liveness`, `answers`, `unconfirmed`, `relay-liveness`) : 8 passages avant les corrections de revue, 3 après, tous verts.
- `openspec validate t4-39-relay-liveness-followups --strict` : valide avant archivage. Après archivage, les exigences trop longues ont été scindées (avertissement « > 500 caractères » en mode strict) dans les specs et dans ce delta ; `openspec validate --specs --strict` : 18 specs valides.
- openspec-guard 0.3.0 : 657 critères, 494 liés par sélecteur, 0 nouvel échec ; `--update-baseline` ne change pas la baseline.

## Revue

Liste de contrôle de gstack `review` (passes critique et informative, complétude des valeurs `unconfirmed` et `E_RELAY_TIMEOUT` chez tous les consommateurs, dont `packages/gateway`), puis revue adversariale indépendante par un second agent en lecture seule. Ce n'est pas une invocation journalisée complète du skill : son format interactif ne convient pas à un sous-agent sans humain. Aucun P0 ni P1. Constats :

- P2 : une demande dont l'enveloppe renvoyée expire, est refusée, abandonnée ou évincée restait `proposed` pour toujours, avec sa clé et sa place. **Corrigé** (`endUnconfirmed`, deux tests).
- P2 : un abandon comptait contre l'enveloppe dont le délai expirait en premier, même sur un lien mort ; une petite enveloppe innocente pouvait finir en `E_RELAY_TIMEOUT`. **Corrigé** : seul un lien qui a reçu des octets pendant l'attente compte ; `switchUrl` oublie les comptes.
- P3 : une écriture en échec comptait encore comme octets en vol et comme abandon. **Corrigé.**
- P3 : tout envoi en attente suspendait la détection d'un lien mort. **Corrigé** : seule une voie montante occupée (plus d'un intervalle au plancher) l'exempte.
- P3 : la passerelle traite `unconfirmed` comme un échec. Laissé en limite (hors des capacités de la ligne).
- P3 : un exécuteur redémarré entre la première copie et le renvoi répond `E_DENIED` (doublon). Laissé en limite : après un redémarrage, l'exécuteur a perdu la demande de toute façon.
- Commentaire de `switchUrl` périmé : corrigé.

## CSO

`gstack-cso start --code --diff --base origin/main --offline`, run `1791814281385-e296aeb3a892951a` : `finished`, `completeness: partial`, aucun constat étayé. Domaines évalués : modèle d'application, surface d'attaque, LLM/MCP, OWASP 2025 (partiel), STRIDE (partiel), classification des données. Partiel : audit statique, sans profil d'exécution ni scanner hors ligne.

## Limites

- Chemins directs : le réseau local et iroh rendent `unreachable` après avoir écrit l'enveloppe sans preuve de réception ; si le relais rend ensuite `offline`, le demandeur voit encore un refus. À traiter dans une ligne à part.
- Passerelle : `unconfirmed` y donne « Le relais n'a pas pu joindre ton Mac » et la réponse éventuelle est perdue.
- Panneau de bureau : une demande non confirmée s'affiche « envoyée » (`proposed`), sans la nuance.
- Une demande qui finit `failed` ou `expired` faute de confirmation a pu être reçue ; un vrai résultat l'emporte encore, mais la clé plafonnée a été révoquée.
- Le plancher de 32 kbit/s est une hypothèse ; sous ce débit, l'enveloppe passe au deuxième ou troisième essai ou finit en `E_RELAY_TIMEOUT`.
