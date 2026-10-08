# Classer un blocage

Cette grille sert à l'étape 0. Elle répond à une seule question par événement : **une réponse bornée, venue du
propriétaire de la ressource, aurait-elle été la bonne façon de débloquer l'agent ?** Si oui, l'événement est un
blocage `YES_*` et compte dans le seuil go/no-go (D24). Sinon, il ne compte pas.

`blocked-observer classify <id>` pose les questions ci-dessous dans l'ordre, et déduit le code. On n'a pas à retenir
les huit codes : on répond par oui ou non.

## Les questions, dans l'ordre

La première réponse qui tranche donne le code. L'ordre rend les codes exclusifs : un événement n'en reçoit qu'un.

1. **L'agent a-t-il vraiment été arrêté ou détourné par ça ?** Non : `NOT_A_BLOCK`.
2. **Pour débloquer, fallait-il quelqu'un d'autre que toi** (collègue, autre équipe, client) ? Non :
   `NO_HUMAN_REQUIRED`.
3. **Cette personne te donnerait-elle un accès durable sans hésiter, et est-ce normal que tu l'aies ?** Oui :
   `NO_ACCESS_IS_FINE`.
4. **T'enverrait-elle la donnée ou le fichier brut tel quel, sans y réfléchir ?** Oui : `NO_SHARE_IS_FINE`.
5. **Sinon, une réponse bornée valait mieux. Pourquoi ?** La première raison qui s'applique, dans cet ordre :
   1. la donnée est sensible : `YES_SENSITIVE_DATA` ;
   2. il fallait une action que seul le propriétaire a le droit de faire : `YES_PRIVILEGED_ACTION` ;
   3. la réponse n'existe que chez lui : `YES_LOCAL_CONTEXT` ;
   4. un accès aurait suffi, mais pour cette fois seulement : `YES_TEMPORARY`.

Ensuite : **minutes perdues**, attente et contournement compris, à 5 minutes près. Une estimation honnête vaut mieux
qu'un chiffre précis inventé.

## Les huit codes

Chaque code a une définition, ce qui y entre, ce qui n'y entre pas, et un exemple.

### `NOT_A_BLOCK`

- **Définition** : l'agent n'a pas été arrêté. Le motif détecté est un mot dans un texte, ou une erreur attendue.
- **Y entre** : un fichier, une doc ou une page web qui contient « 401 » ou « forbidden » ; un test qui vérifie qu'une
  route refuse ; un 401 que l'agent provoque exprès pour tester l'auth.
- **N'y entre pas** : un vrai refus que l'agent a contourné tout seul (c'est `NO_HUMAN_REQUIRED`).
- **Exemple** : Codex lit `AGENTS.md`, qui mentionne « HTTP 403 ».

### `NO_HUMAN_REQUIRED`

- **Définition** : un vrai blocage, mais tu pouvais le lever toi-même, ou l'agent l'a levé seul.
- **Y entre** : ta propre clé expirée, ton propre serveur, une connexion à refaire, une limite de forfait que tu paies,
  un fichier local sans le bon droit.
- **N'y entre pas** : une ressource qu'un collègue gère, même si tu as fini par la débloquer en lui écrivant.
- **Exemple** : la clé LiteLLM de ton VPS est refusée ; c'est ta config.

### `NO_ACCESS_IS_FINE`

- **Définition** : il fallait quelqu'un d'autre, et lui demander l'accès durable était la bonne solution.
- **Y entre** : être ajouté au dépôt de son équipe, à un projet, à un canal, quand ce rôle te revient de toute façon.
- **N'y entre pas** : un accès qu'on te donnerait seulement pour cette fois (`YES_TEMPORARY`) ou à contrecœur.
- **Exemple** : tu rejoins l'équipe et il te manque les droits de lecture sur son dépôt.

### `NO_SHARE_IS_FINE`

- **Définition** : il fallait quelqu'un d'autre, et il t'aurait envoyé la chose brute sans y penser.
- **Y entre** : un document interne non sensible, un export de config, un schéma, un fichier que tout le monde a.
- **N'y entre pas** : un fichier qu'il voudrait relire ou découper avant de l'envoyer (`YES_*`).
- **Exemple** : la doc d'API interne qu'une autre équipe publie sur son wiki.

### `YES_SENSITIVE_DATA`

- **Définition** : la donnée existe, mais le propriétaire ne la donnerait pas brute : il dirait « je regarde et je te
  dis ».
- **Y entre** : logs de prod, données clients, chiffres financiers, RH, secrets, tout ce qui tombe sous le principe de
  minimisation des données.
- **N'y entre pas** : une donnée qu'il enverrait telle quelle (`NO_SHARE_IS_FINE`).
- **Exemple** : « Quelles erreurs remonte le service checkout depuis une heure ? » posée à l'équipe infra.

### `YES_PRIVILEGED_ACTION`

- **Définition** : il fallait exécuter quelque chose que seul le propriétaire a le droit de faire.
- **Y entre** : une requête sur la base de prod, un redémarrage, un déploiement, une commande avec ses droits.
- **N'y entre pas** : une simple lecture de données sensibles (`YES_SENSITIVE_DATA`).
- **Exemple** : « Lance cette requête en lecture sur la prod et dis-moi combien de lignes elle renvoie. »

### `YES_LOCAL_CONTEXT`

- **Définition** : la réponse n'existe que chez le propriétaire : sur sa machine, dans sa branche, dans sa tête.
- **Y entre** : du code non poussé, une config locale, une décision non écrite, un état qu'il est le seul à connaître.
- **N'y entre pas** : quelque chose de publié qu'on pourrait lire avec un accès (`NO_ACCESS_IS_FINE`).
- **Exemple** : « Est-ce que l'implémentation de Julie gère déjà le mode sombre ? », sur sa branche locale.

### `YES_TEMPORARY`

- **Définition** : un accès aurait techniquement suffi, mais pour une seule fois ; un accès durable serait de trop.
- **Y entre** : le cas où l'on donnerait un accès juste-à-temps qu'on révoque ensuite.
- **N'y entre pas** : un accès que tu devrais avoir de toute façon (`NO_ACCESS_IS_FINE`).
- **Exemple** : vérifier une fois un réglage dans la console d'un fournisseur que gère une autre équipe.

## Comment classer

- **Le jour même, ou pendant l'entretien avec le testeur.** La mémoire d'un incident s'efface vite. Classer des
  événements vieux de plusieurs semaines donne des « je ne sais pas » (constaté le 8 octobre 2026). L'entretien suit
  la technique des incidents critiques : faire raconter cet événement précis, du début à la fin, plutôt qu'une
  impression générale.
- **Commencer par les événements `report_blocked`**, que l'agent a déclarés lui-même : ce sont les plus probables. Les
  événements des hooks et des journaux Codex servent surtout de point de départ pour la conversation.
- **Vérifier que la grille est claire.** Sur les 20 premiers événements d'un testeur, classer chacun de son côté, puis
  comparer. Si vous êtes d'accord sur moins de 8 sur 10, réécrire la définition qui a fait diverger, puis recommencer
  sur 20 nouveaux événements.

## Ce qui est filtré avant de classer (D25)

Les motifs comme « 401 » ou « permission denied » apparaissent aussi quand l'agent lit simplement un texte qui les
contient. `blocked-observer` ignore donc :

- les sorties d'une commande qui n'a fait qu'afficher du contenu local (`cat`, `sed -n`, `rg`, `git show`…), sauf si
  elle a échoué ;
- les sorties des tests et des builds de l'agent (`npm test`, `pytest`, `vitest`…) ;
- les résultats de recherche web ;
- côté Claude Code, les résultats réussis de `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch` et `ToolSearch`.

Mesuré sur 30 jours de journaux Codex réels : de 202 événements à 62. Un événement déjà classé n'est jamais retiré.

## Sources

- Codebook avec définition, inclusion, exclusion et exemple par code : MacQueen et al., « Codebook Development for
  Team-Based Qualitative Analysis », _Cultural Anthropology Methods_ 10(2), 1998.
- Entretien sur un incident précis et récent : Flanagan, « The Critical Incident Technique », _Psychological
  Bulletin_, 1954 ; [synthèse NN/g](https://www.nngroup.com/articles/critical-incident-technique/).
- Développeurs bloqués par un collègue seul détenteur d'une information : Ko, DeLine et Venolia, « Information Needs in
  Collocated Software Development Teams », ICSE 2007
  ([PDF](https://faculty.washington.edu/ajko/papers/Ko2007InformationNeeds.pdf)).
- L'attente comme gaspillage en développement logiciel : Sedano, Ralph et Péraire, « Software Development Waste »,
  ICSE 2017 ([résumé](https://neverworkintheory.org/2021/08/29/software-development-waste.html)).
- Taxonomie validée par accord entre annotateurs : Cemri et al., « Why Do Multi-Agent LLM Systems Fail? », NeurIPS 2025
  ([arXiv](https://arxiv.org/abs/2503.13657)).
- Accord entre codeurs en génie logiciel : [Applying Inter-rater Reliability and Agreement in Grounded Theory Studies
  in Software Engineering](https://arxiv.org/pdf/2107.11449).
- Minimisation des données : [ICO, principe (c)](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/).
