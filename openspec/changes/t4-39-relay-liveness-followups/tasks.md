# Tasks

## 1. Tests d'abord

- [ ] 1.1 Client relais (faux relais, minuteurs simulés) : `unconfirmed` à l'abandon et à la fermeture, `offline` sans connexion, réponse hors ordre, délai proportionnel aux octets, délai doublé, renvoi borné, grosse trame entrante lente ; les voir échouer.
- [ ] 1.2 Vrai relais : réponses dans l'ordre, erreur sans identifiant résolue aussitôt, octets reçus comptés comme réponse au ping ; les voir échouer.
- [ ] 1.3 Moteur et API locale : demande initiale `unconfirmed` gardée, renvoyée, confirmée ; les voir échouer.
- [ ] 1.4 requester-mcp : `status: 'unconfirmed'`, `delivery` dans `get_drop_result` et les sorties groupées ; les voir échouer.

## 2. Relais

- [ ] 2.1 `client.ts` : issue `unconfirmed`, liste ordonnée des trames en vol, attribution d'une erreur sans identifiant, délai depuis l'appel proportionnel aux octets en vol et doublé par enveloppe, renvoi borné (`E_RELAY_TIMEOUT`, `ack_retries`), octets reçus comptés, battement qui attend un envoi dans son délai.
- [ ] 2.2 `server.ts` : octets reçus d'un Node authentifié comptés comme réponse au ping.

## 3. Node et requester-mcp

- [ ] 3.1 `engine.ts` : `unconfirmed` toujours remis en file ; demande initiale gardée avec `delivery`, effacé par un renvoi acquitté ou un message de l'exécuteur ; journal `send_unconfirmed`.
- [ ] 3.2 `api.ts` : `delivery` dans les réponses de `POST /drops` et `/ask`.
- [ ] 3.3 requester-mcp : schémas et sorties des cinq outils.

## 4. Vérification

- [ ] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` ; tests sensibles au temps relancés plusieurs fois.
- [ ] 4.2 `openspec validate t4-39-relay-liveness-followups --strict`, puis openspec-guard avec sélecteurs ; baseline mise à jour seulement si son diff ne contient que des retraits.
- [ ] 4.3 Revue (`review`) sur le diff.
- [ ] 4.4 `cso` : la change touche `relay`, `node` et `requester-mcp`.
- [ ] 4.5 Archiver la change dans la même PR.
