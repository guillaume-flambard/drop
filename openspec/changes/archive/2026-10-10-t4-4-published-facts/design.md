## Context

Le catalogue circule par `catalog_request` / `catalog` (cartes signées par l'exécuteur), le même pour tous les pairs. `onDropRequest` vérifie fraîcheur, anti-rejeu (`claimDrop`), capacité, puis envoie une carte d'approbation. `ask_team` (`route.ts`) choisit sans modèle parmi les capacités qui prennent une `question`. T4.3 a introduit la livraison sous un schéma fixe et `answeredBy`.

## Decisions

- **Fait** : `{ factId (UUIDv7), revision, owner, topic (120), keywords (≤ 8, 40 car.), statement (1 000), source { label (200), url? https }, publishedAt, validTo (≤ publishedAt + 365 j), audience { kind: 'team' } | { kind: 'peers', nodeIds (1 à 50) }, sensitivity: 'low', status: 'active' | 'retired' }`, signé par le propriétaire sur `drop-fact-v1|` + JSON canonique. Pas de caractère de contrôle ; secrets refusés à la publication (`E_SECRET_DETECTED`).
- **Public** : `team` = tous les pairs appairés ; `peers` = la liste choisie. Vérifié à l'envoi du catalogue et à chaque demande.
- **Carte** : `fact.f<factId en hex>`, version `1.<revision>.0`, titre = sujet, `keywords`, `approval: 'auto_low'`, entrée vide, sortie `FACT_OUTPUT_SCHEMA`. Le catalogue d'un pair ne contient que les faits actifs, non expirés, dont il fait partie du public.
- **Service** : même ordre que pour une capacité jusqu'à l'anti-rejeu ; puis `proposed → approved → delivered → receipted` sans carte d'approbation : la publication vaut accord. Sortie `{ kind: 'fact', fact, sig }` sous l'empreinte de `FACT_OUTPUT_SCHEMA`. Reçu `answeredBy: 'fact'`, `decision: 'allow_once'`, `reviewed: true`, approbateur = propriétaire. Compteur de service persistant.
- **Refus** : fait inconnu, retiré, expiré, hors public ou d'une ancienne révision : `drop_error` `E_SCHEMA` « Fait indisponible. », sans dire lequel des cas.
- **Demandeur** : le moteur vérifie la signature du fait par l'exécuteur, que l'identifiant correspond à la carte et que `validTo` n'est pas passé ; sinon `E_OUTPUT_INVALID`. Le MCP affiche l'origine d'après l'empreinte.
- **`ask_team`** : avant le routage actuel, un fait dont un mot-clé (ou le sujet) figure dans la question est demandé, trois au plus ; sinon routage habituel.
- **Stockage** : `facts.json` sous `DROP_HOME`, mode `0600`, écrit par fichier temporaire et renommage.

## Risks / Trade-offs

- Le catalogue révèle les sujets et mots-clés au public d'un fait (accepté par D51).
- Un fait servi ne se rappelle pas ; le retrait n'agit que pour la suite.
- Les mots-clés sont un routage grossier : un fait peut être servi à une question voisine. Le contenu reste celui que le propriétaire a choisi de publier.

## Après revue adverse

- Retrait, révision et compteur passent par une lecture-écriture sans attente intermédiaire ; une révision ne remplace la précédente que si elle est toujours celle lue. Un fait servi est revérifié après l'anti-rejeu, et le compteur s'écrit après la livraison, sans la bloquer.
- 10 faits par pair et par minute (`E_RATE`). Pas de `drop_status` pour un fait.
- Le demandeur refuse l'empreinte d'un fait sur une carte qui n'en est pas un ; le MCP ne présente un fait que pour une carte de fait.
- Routage : termes d'au moins trois lettres ou chiffres une fois normalisés, faits dont le propriétaire est en ligne.
- Validation : lien sans identifiants, mots-clés distincts sans virgule, nœuds distincts, caractères invisibles, de ligne et de direction refusés (aussi pour les noms de fichiers de T4.3).
- Un `facts.json` illisible retire les faits du catalogue et du service, pas les capacités ; le panneau l'affiche sans masquer le reste de « Mes outils ».
- Aucune clé plafonnée n'est créée pour demander un fait.
