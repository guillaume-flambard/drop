## Decisions

- **Identifiant du propriétaire.** L'`executorNodeId` de la carte, que `verifyCard` oblige à être l'expéditeur du catalogue : un pair ne peut pas se faire passer pour un autre.
- **Ambiguïté refusée.** Sans `ownerNodeId`, un identifiant publié par plusieurs pairs donne 409 `E_AMBIGUOUS_CAPABILITY` avec `{ owner_node_id, owner }` pour chacun ; rien ne part. Un seul pair : comportement inchangé. Un `ownerNodeId` qui ne publie pas cet identifiant : 404 comme une capacité inconnue.
- **Routage.** Chaque route d'`ask_team` et de l'A2A entrant porte `ownerNodeId`, tiré de l'entrée du catalogue qu'elle a choisie : deux personnes qui partagent Figma reçoivent chacune leur demande.
- **Erreur locale, pas protocolaire.** `E_AMBIGUOUS_CAPABILITY` est une réponse de l'API locale ; la liste fermée des codes `drop_error` ne change pas.

## Revue adverse

- Un pair qui listait deux fois la même carte rendait son propre identifiant ambigu, et `/ask` répondait 500 en perdant les demandes déjà parties. Le catalogue reçu ne garde plus qu'une carte par identifiant et par expéditeur ; une route encore ambiguë n'arrête plus les autres dans `/ask` ni dans l'A2A entrant.
- `POST /drops` rafraîchit aussi les catalogues quand le propriétaire nommé manque, ou quand aucun n'est nommé et que les catalogues ne sont pas frais : jamais de repli sur un catalogue incomplet.
- Les descriptions des outils, la liste des capacités et `docs/GUIDE.md` parlent de `owner_node_id` ; une demande groupée vers un mauvais propriétaire garde la raison exacte.
- Les compétences de la carte A2A ont des identifiants uniques : un partage publié par deux collègues est suffixé par l'identifiant de son propriétaire.
- Compatibilité : le serveur MCP et le Node sont livrés ensemble ; un MCP plus récent face à un Node plus ancien perdrait `ownerNodeId`, ce qui n'arrive pas dans une installation drop.
