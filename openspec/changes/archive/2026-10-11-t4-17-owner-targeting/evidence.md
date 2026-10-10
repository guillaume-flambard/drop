# Preuves T4.17

| Critère | Preuve |
|---|---|
| Demande envoyée au propriétaire désigné | Test « owner targeting (T4.17) > sends a drop to the owner it names and refuses an id that two peers publish ». Deux pairs publient `mcp.answer.figma` : `/capabilities` donne leurs deux identifiants, une demande sans propriétaire reçoit 409 `E_AMBIGUOUS_CAPABILITY` avec les deux et rien ne part, chaque demande nommée part chez le bon pair, un propriétaire qui ne publie pas l'identifiant donne 404. Un pair qui liste deux fois la même carte n'en garde qu'une. |
| ask_team vise chaque propriétaire | Test « … > routes ask_team to each owner of a capability that two peers share ». Une demande chez chacun ; la même question par l'A2A entrant aussi. Avant le correctif : les deux demandes partaient chez le même pair. |
| Outil MCP | Test « … > lets the agent name the owner and refuses an ambiguous id before sending anything ». `list_capabilities` montre `owner_node_id` ; `request_drop` sans propriétaire est refusé en listant les deux ; avec, il part chez le bon ; un propriétaire inconnu est refusé ; `request_drops` vérifie tout avant d'envoyer. |

Vérification : lint, typecheck, 64 fichiers et 507 tests, `openspec validate --strict`, openspec-guard.

## Mutation

9 protections retirées une à une, 9 tuées : refus de l'ambiguïté (Node, outil), filtre par propriétaire (Node, outil), propriétaire transmis par `/ask`, par l'A2A et par l'outil, `owner_node_id` dans `/capabilities`, dédoublonnage du catalogue reçu. Sans test dédié : le rafraîchissement de `POST /drops` quand le propriétaire manque, et le suffixe des identifiants de compétence A2A.

## Revue

Revue adverse indépendante : un défaut moyen (cartes en double chez un pair, qui rendaient `/ask` en 500), cinq faibles ou d'information. Tous corrigés, sauf la compatibilité entre versions, documentée : le serveur MCP et le Node sont livrés ensemble.

En passant : le test de T4.2e qui annonce 1 500 adresses dépassait le délai de 5 s sous la charge de la suite complète ; il a maintenant un délai explicite de 30 s.

## /cso

Run `1791671236779-3ff1710792102080`, statut `partial` uniquement parce que l'outil ne lit pas les fichiers binaires. Couverture enregistrée, aucun constat : `ownerNodeId` vient d'un client local qui détient le jeton et ne choisit qu'une entrée du catalogue d'un pair authentifié.
