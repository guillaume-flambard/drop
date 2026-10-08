# 00 — Vision et périmètre

## Le produit en une phrase

Quand l'agent d'une personne est bloqué parce qu'une ressource appartient à quelqu'un d'autre, il envoie une
**demande typée** à une **capacité** publiée par ce propriétaire ; le propriétaire **autorise une fois** ; la capacité
s'exécute **chez lui**, avec ses accès ; seul un **résultat typé et filtré** revient. Aucun accès ne change de main.

UX de référence : AirDrop. `Guillaume needs → Julie can help → Ask → Allow once → Result.`

## Principes

1. **Get the answer, not the access.** Ne jamais partager un accès quand partager une réponse suffit.
2. **La capacité est un contrat typé, pas une conversation.** Entrée, sortie, outils autorisés, sensibilité, règle
   d'approbation : tout est déclaré à l'avance.
3. **La sécurité est aussi dans la sémantique.** On conçoit les capacités pour que la question dangereuse ne puisse
   pas être posée (`customer.segment` plutôt que `is_arr_above(x)`). Les seuils appartiennent au propriétaire.
4. **Le LLM travaille à l'intérieur d'un cadre déterministe.** Il ne choisit ni ses outils ni ce qui sort.
5. **Relais d'abord, LAN en optimisation.** Le produit marche à 2 000 km. Bonjour n'est qu'un raccourci, plus tard.
6. **Consentement lisible en 3 secondes.** Un verbe, un objet, ce qui sort. Jamais un scope OAuth ni un nom d'outil MCP.

## Ordre du projet : mesurer, puis construire

- **Étape 0 — `blocked-observer`.** Mesurer combien de fois des agents réels sont bloqués par une ressource détenue
  par quelqu'un d'autre, et si une réponse bornée aurait suffi. Aucun réseau, aucun daemon.
- **Étape 1 — prototype Mac + VPS.** Relais sur le VPS, deux capacités : `production.error_summary` (le VPS est
  propriétaire, preuve de divulgation minimale) et `repo.answer` (localité, la démo « magique »).
- **Étape 2 — pilote** (hors de ce kit de specs) : seulement si l'étape 0 franchit le seuil go/no-go.

## Hors périmètre (ne pas construire)

- Task Drop (travail long et ouvert délégué à un autre agent).
- Conversation libre agent-à-agent, orchestration multi-agents, handoff de contexte.
- Application de barre de menu native, découverte Bonjour/mDNS, console d'organisation, SSO.
- Tout argument ou fonctionnalité de « réduction de licences ».
- Login par abonnement Claude ou ChatGPT dans le runner : clé API uniquement.

## Vocabulaire

| Terme | Sens |
| --- | --- |
| Owner | Propriétaire d'une capacité. Type générique : `human`, `team`, `machine`, `service`. La v1 n'affiche que des noms de personnes. |
| Node | Un processus `drop` qui a une identité (paire de clés) : le poste de Guillaume, le VPS. |
| Capability | Contrat publié : id, version, schémas d'entrée et de sortie, outils autorisés, sensibilité, règle d'approbation, budget. |
| Drop | Une demande unique d'exécution d'une capacité. |
| Grant | Décision de l'approbateur : `allow_once`, `deny`, `not_now`. |
| Approver | Le Node humain qui valide une demande (peut différer du Node qui exécute, ex. VPS exécute, Mac approuve). |
| Receipt | Trace signée d'un Drop : hash entrée/sortie, outils appelés, décision, horodatages. |
