# Journal des décisions

Format : `D<n> — date — décision — raison`. Les agents ajoutent ici toute décision non écrite dans les specs.

## Décisions de cadrage (8 octobre 2026)

- **D1** — Le produit n'est ni le P2P, ni MCP, ni la découverte : c'est le contrat de capacité + consentement + résultat
  filtré. Principe : « Get the answer, not the access ».
- **D2** — Mesurer avant de construire : l'étape 0 (`blocked-observer`) précède tout pilote.
- **D3** — Cible de départ : équipes produit qui codent avec des agents. Le métier entre plus tard par des capacités.
- **D4** — Capability Drop seulement. Pas de Task Drop dans l'étape 1.
- **D5** — Premières capacités : `production.error_summary` (divulgation minimale, déterministe) et `repo.answer`
  (localité, haute sensibilité, démo). Figma et CRM écartés pour l'instant.
- **D6** — Le runner utilise une clé API, jamais un login d'abonnement Claude ou ChatGPT (CGU des fournisseurs).
- **D7** — Relais d'abord ; découverte LAN reportée. Le relais ne voit que des enveloppes chiffrées.
- **D8** — Le propriétaire d'une capacité est générique (`human`, `team`, `machine`, `service`) dans le modèle ;
  l'UI v1 n'affiche que des noms.
- **D9** — Nom « AgentDrop » abandonné (pris par plusieurs projets agentiques). Nom de code interne : `drop`.
- **D10** — Argument « réduction de licences » banni du produit et du discours.
- **D11** — Sécurité par la sémantique : les capacités sont conçues pour empêcher les questions dangereuses ; les seuils
  appartiennent au propriétaire (ex. `customer.segment` plutôt que `is_arr_above`).

## À décider par l'humain

- **Seuil go/no-go de l'étape 0** : à écrire ici avant de lancer la mesure (blocages « YES » par dev-jour actif,
  minutes perdues par blocage).
- **Nom de produit** : à vérifier (nom + domaine) avant le pilote.
