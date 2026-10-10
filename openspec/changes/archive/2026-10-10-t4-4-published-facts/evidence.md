# Preuves T4.4

| Critère | Preuve |
|---|---|
| Limites d'un fait | Test « published facts (T4.4) > accepts a fact within its limits and refuses an overlong, too long-lived, high or control-character one » : énoncé, sujet, mots-clés, source, lien http ou javascript, lien avec identifiants, plus d'un an, `high`, contrôle, U+202E, U+2028, espace de largeur nulle, mots-clés en double ou avec virgule, pairs en double, révision 0. |
| Signature d'un fait | Test « … > signs a fact and refuses it once a field changes or another key signed it ». |
| Chemin d'un fait | Test « … > allows proposed to approved for a published fact, never proposed to running ». |
| Publication et stockage | Test « … > publishes, edits and retires a signed fact, refuses a secret, and keeps facts privately on disk » : révisions signées, secret en `E_SCHEMA`/`E_SECRET_DETECTED`, public inconnu refusé, retrait gardé, `facts.json` en 0600. |
| Catalogue selon le public | Test « … > lists a fact only in the catalog of its audience » : sujet et mots-clés sans l'énoncé, invisible hors public. |
| Fait servi sans décision | Test « … > serves a fact without a decision, with a signed receipt marked fact » : aucune carte d'approbation, compteur à 1, reçus valides `answeredBy: 'fact'`. |
| Fait indisponible | Test « … > refuses a retired, expired, out-of-audience or outdated fact without saying which ». |
| Concurrence et débit | Test « … > keeps a retire made while a fact is being served, and limits fact requests per peer » : envoi retenu pendant un retrait et une publication, retrait et modification simultanés, onzième demande en `E_RATE`. |
| Stockage illisible, pas de clé | Test « … > serves no fact from an unreadable store, keeps the catalog, and mints no capped key for a fact ». |
| Fait reçu invalide | Test « … > rejects at the requester a fact whose signature or validity does not hold » : fait altéré, expiré, autre exécuteur, autre carte, autre empreinte, et capacité ordinaire qui se fait passer pour un fait. |
| Question servie par un fait | Test « … > answers ask_team with a fact whose keyword appears in the question, before any capability ». |
| Termes de routage ignorés | Test « … > ignores routing terms too short or in another script, and offline facts ». |
| Routes locales | Test « … > manages facts through the panel routes ». |
| Panneau | Test « menu bar panel (T4.4) > lists what I publish with add, edit and retire, and greys out an expired fact » (lecture du script servi). |
| MCP | Test « published facts (T4.4) > presents a fact with its owner and end of validity », y compris le refus de présenter comme fait le résultat d'une capacité ordinaire. |

Recette réelle le 10 octobre 2026 avant et après les correctifs de revue, deux `drop serve` sur ce Mac sans relais (session locale T4.2) :
- fait publié par `/ui/facts`, visible chez le demandeur en 2 s ;
- `ask_team` le choisit (« fait publié sur déploiement ») ;
- énoncé reçu, `receipted`, aucune carte d'approbation chez le propriétaire, compteur à 1 ;
- retrait, puis la même question ne trouve plus de fait ;
- reçu `answeredBy: fact`, `facts.json` en 600.

Contrôle par mutation : 22 protections retirées une à une ; chaque fois au moins un test échoue.

## Revue

Revue adverse et sécurité (sous-agent indépendant) : trois critiques confirmées par sonde, toutes corrigées.
1. Une demande en cours de service pouvait défaire un retrait, une révision ou une publication concurrente.
2. Le résultat de n'importe quelle capacité pouvait être présenté à l'agent comme un fait publié.
3. Un mot-clé vide une fois normalisé (emoji, autre écriture) ou trop court captait presque toutes les questions de `ask_team`.

Corrigés aussi :
- compteur bloquant la livraison ;
- inondation possible des envois du propriétaire ;
- clé plafonnée créée pour un fait ;
- propriétaire hors ligne bloquant `ask_team` ;
- `facts.json` illisible cassant tout le catalogue et « Mes outils » ;
- lien avec identifiants ;
- caractères invisibles ;
- doublons ;
- durée réinitialisée à la modification ;
- menu déroulant fermé par le rafraîchissement ;
- libellé « Toute l'équipe » trompeur.

Restent, acceptés (D65) :
- réutilisation par un pair de l'identifiant d'un fait d'autrui sur sa propre carte, toujours attribuée à ce pair ;
- un fait servi ne se rappelle pas ;
- table des transitions purement documentaire (`proposed → approved` permis pour tout Drop dans la table, utilisé seulement par les faits) ;
- test du panneau par lecture du script servi.

`/cso` gstack ciblé en mode diff (run `1791647043362-9e89449840a0b28b`) :
- statut partiel, car les binaires du dépôt ne sont pas lus ;
- un constat faible, la réutilisation d'identifiant ;
- aucune faille élevée.

## Vérification

- `pnpm -r lint` et `pnpm -r typecheck` ;
- `pnpm -r test` : 407 tests ;
- `openspec validate --all --strict` ;
- openspec-guard avec sélecteurs.
