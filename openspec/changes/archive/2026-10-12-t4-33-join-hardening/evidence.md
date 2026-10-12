# Preuves T4.33

Exécutées le 12 octobre 2026 sur la branche `t4-33-join-hardening`, macOS (Apple Silicon), Node 24.21.0.

| Vérification | Résultat |
| --- | --- |
| `pnpm -r lint && pnpm -r typecheck && pnpm -r test` | vert : 82 fichiers de test, 634 tests (1 ignoré, déjà ignoré sur `main`) |
| `openspec validate t4-33-join-hardening --strict`, puis `openspec validate --all --strict` après archivage | valide ; 20 éléments valides |
| `openspec-guard@0.3.0 check --require-selector --baseline … --fail-on fail` | vert : 444 critères liés (438 sur `main`, + 6) ; `--update-baseline` ne change pas la baseline |

Les tests nouveaux ont d'abord échoué sur le code de `main` (`E_LOCKED` absent de `ERROR_CODES`, signature nue acceptée, `adopt` au lieu de `kept`, autorité `ca` gardée : `expected true to be false`), puis sont passés.

## Critères et tests

| Critère | Test |
| --- | --- |
| Relais réglé à la main gardé | `join hardening (T4.33) > adopts a relay only from the default loopback relay: a relay set by hand is kept` |
| Origines du propriétaire conservées, relais adopté hors des destinations | `join hardening (T4.33) > switching relay keeps every listed origin and never lists the adopted relay` |
| Nouveau poste sur le relais de l'équipe, destinations inchangées (vrai relais, deux daemons) | `one-link join (T4.23) > a fresh private node adopts the relay of the link, is admitted and joins the team after Rejoindre` |
| Relais gardé ou refusé depuis le relais par défaut | `one-link join (T4.23) > keeps the relay of a node that already joined someone, and refuses a relay it may not adopt (E_INVITE_RELAY)` |
| Vraie cause `E_LOCKED` (API) et `E_CONFLICT` (moteur), invitation réutilisable | `join hardening (T4.33) > answers E_LOCKED or E_CONFLICT, not E_INVITE_RELAY, when config.json cannot be rewritten, and keeps the invite usable` |
| Domaine `drop-invite-v1\|` | `invite hardening (T4.33) > signs under the drop-invite-v1\| domain: a bare or foreign-domain signature does not verify (E_INVITE_SIG)` |
| `E_LOCKED` et `E_CONFLICT` dans `ERROR_CODES` | `invite hardening (T4.33) > lists E_LOCKED and E_CONFLICT among the stable error codes` |
| Autorité `ca` gardée pour le même hôte seulement (deux relais TLS réels) | `relay client switch (T4.33) > keeps the extra certificate authority for the same host only, never for a relay on another host` |
| Relais par défaut de la coque égal à celui du Node | `default relay (T4.33) > starts the app on the node default loopback relay, the only one an invite may move a node from` |

## Non prouvé ici

- `E_CONFLICT` passe par l'API dans le même chemin que `E_LOCKED` (même table de messages) ; il n'est déclenché qu'au niveau du moteur, la course entre lecture et renommage de `config.json` n'étant pas reproductible de l'extérieur sans simulacre du système de fichiers.
- Parcours sur de vrais postes : au banc maison (T4.6c), comme pour T4.23.
