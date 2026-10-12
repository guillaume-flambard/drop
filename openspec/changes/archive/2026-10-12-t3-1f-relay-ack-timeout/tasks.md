# Tasks

## 1. Reproduction

- [x] 1.1 Reproduire contre un faux relais : relais muet sans fermeture, fermeture à moitié, envoi sans acquittement, poignée de main jamais servie, socket plus lu en `CLOSE_WAIT`, `close()` ; noter la cause racine dans `design.md`.
- [x] 1.2 Écrire les tests du client (minuteurs simulés, délais par défaut) et les voir échouer.
- [x] 1.3 Écrire le test du Node (vrai relais derrière un proxy figé, appairage repris de la file) et le voir échouer.

## 2. Client relais

- [x] 2.1 Battement de cœur par socket (15 s), délai d'acquittement (15 s), délai de connexion (15 s), abandon sans attendre `close`, journal `E_RELAY_TIMEOUT`.
- [x] 2.2 `close()` libère les envois en attente et arrête les minuteurs.
- [x] 2.3 Le daemon passe son journal au client relais.
- [x] 2.4 Après revue : délai qui continue de croître après un abandon, délai d'acquittement compté depuis l'écriture, trames d'un socket abandonné ignorées (sauf enveloppes), reconnexion planifiée avant le statut.

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` ; tests sensibles au temps relancés plusieurs fois.
- [x] 3.2 `openspec validate t3-1f-relay-ack-timeout --strict`, puis openspec-guard avec sélecteurs ; baseline mise à jour seulement si son diff ne contient que des retraits.
- [x] 3.3 `/review` (gstack) sur le diff.
- [x] 3.4 `/cso` (gstack) : la change touche `relay` et `node`.
- [x] 3.5 Archiver la change dans la même PR.
