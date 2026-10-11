# T0.7 : kit de mesure D24

## Why

T0.7 est la première ligne `todo` de l'index dont les dépendances sont `done`, et D83 en fait la priorité
immédiate : mesurer le besoin avant de construire. La mesure exige 3 à 5 développeurs qui n'installent que
blocked-observer, 10 jours actifs chacun, dont les blocages sont classés en entretien (D24). Aujourd'hui seul
Guillaume l'exécute : 111 événements sur 26 jours actifs, 107 non classés, aucun blocage YES. Rien n'existe pour
recruter ces 3 à 5 personnes : ni fiche d'entretien, ni consignes d'export, et le guide d'installation n'a jamais été
suivi par un extérieur, donc personne ne sait s'il tient.

## What Changes

- **Guide d'installation relu et corrigé** (`packages/blocked-observer/README.md`) : chaque commande du guide est
  exécutée telle qu'écrite avant d'être recommandée à un tiers. Revue faite le 12/10 sur `46c0018` : `install`,
  `print-instructions`, `report`, `export` et le serveur MCP (`initialize` puis `tools/list` puis `tools/call`)
  répondent correctement, avec un `BLOCKED_OBSERVER_HOME` isolé pour ne pas toucher aux données de Guillaume.
- **Le guide dit explicitement qu'on clone, qu'on n'installe pas** : Node refuse les fichiers TypeScript sous
  `node_modules` (doc officielle Node 22.x, section « Type stripping in dependencies »), donc toute route de type
  `npm install` casse le binaire. C'est le piège qu'un extérieur rencontrera en premier.
- **Prérequis vérifié contre l'autorité** : « Node 22.18 ou plus » est confirmé par la doc Node 22.x (« v22.18.0,
  Type stripping is enabled by default »). La CI ne valide que Node 24, donc cette valeur n'était jusqu'ici jamais
  éprouvée.
- **Fiche d'entretien** (`docs/kit-d24-entretien.md`) : consentement, contexte, déroulé de l'entretien, lecture des
  événements avec le codebook `docs/CLASSIFICATION.md`, relevé des minutes perdues.
- **Consignes d'export** (même document) : quand exporter, la commande, ce qui quitte la machine et ce qui ne la
  quitte pas.
- **Note de recrutement** : à qui parler, ce qu'on promet, durée réelle (10 jours actifs).

## Capabilities

Documentation seule : aucun comportement du système ne change, donc `skip_specs: true`. La capacité concernée reste
`blocked-observer`, dont les exigences (commandes, schémas d'entrée, seuil D24) sont déjà écrites et couvertes ;
cette change ne les modifie pas.

## Non-goals

- **Pas le protocole de l'essai** (T4.6b) : celui-ci remplace `docs/essais/README.md` et porte l'essai en binômes,
  pas la mesure.
- **Pas le recrutement** : Guillaume recrute et conduit les entretiens. Cette change prépare le kit qu'il donnera.
- **Pas la distribution du binaire** : le paquet reste `private: true`, hors npm. Si le frottement du clone suivi de
  `pnpm install` s'avère trop fort pour recruter, cela devient une ligne `todo` séparée dans `docs/TASKS.md`, pas un
  élargissement de cette tâche.
- **Pas l'app, le relais ni le raccordement** (T3.4, T4.6a, T4.22) : blocked-observer n'en a besoin pour rien.

## Impact

- `packages/blocked-observer/README.md` : guide relu, avertissement `node_modules` ajouté.
- `docs/kit-d24-entretien.md` : nouveau (fiche d'entretien et consignes d'export).
- `docs/DECISIONS.md` : réponse notée pour le prérequis Node vérifié et pour le choix de la route par clone.
- Aucun code, aucun schéma, aucune dépendance, aucun contrat. Les tests existants sont inchangés.
