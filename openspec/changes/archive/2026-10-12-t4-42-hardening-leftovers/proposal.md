# T4.42 : restes du durcissement de T4.26

## Why

T4.26 (D99) a laissé trois restes, relevés le 12 octobre 2026 :

1. **La lecture des configurations par l'onboarding ouvre sans `O_NONBLOCK`.** `readConfig` (`packages/node/src/onboarding.ts`,
   T4.22) ouvre avec `O_NOFOLLOW` seulement : un tube nommé posé à la place d'une configuration de client bloque
   l'aperçu de l'onboarding, et donc le daemon, jusqu'à ce qu'un écrivain se présente. Mesuré avant correction : 3,0 s
   d'attente pour un écrivain qui arrive au bout de 3 s, sans fin s'il n'arrive jamais. Le lecteur partagé de T4.26
   (`readConfigText`, capacités) fait déjà ce qu'il faut, mais suit les liens et ne servait pas à l'onboarding.
2. **Les écritures du banc de simulation suivent un lien.** `openOwnerOnly` (T4.26) ouvre en `'w'` ou `'a'` : un lien
   symbolique ou un second lien physique posé dans un `--work-dir` partagé sous le nom `report.json` ou `events.jsonl`
   fait tronquer, réécrire et passer en 0600 le fichier visé. Reproduit avant correction : la cible d'un lien
   symbolique est réécrite (« overwritten », mode 600), celle d'un lien physique reçoit l'ajout. Un dossier de nœud
   remplacé par un lien envoie aussi `drop init` et les journaux plantés dans le dossier visé.
3. **Le banc démarre lentement sous charge.** Avant sa phase de charge, il lance un `init` par nœud puis un `publish`
   par propriétaire, l'un après l'autre ; T4.25 a mesuré que ces démarrages à froid font l'essentiel de l'attente
   (0,25 s chacun au repos, jusqu'à 7 s sur un processeur saturé).

## What Changes

- **Onboarding** : `readConfig` délègue à `readConfigText` avec une nouvelle option `followLinks: false`, qui ajoute
  `O_NOFOLLOW` (et, sous Windows, le contrôle `lstat` après ouverture) aux protections du lecteur partagé : une seule
  ouverture avec `O_NONBLOCK`, contrôle par le descripteur, lecture bornée même si le fichier grossit. Les codes
  d'erreur restent ceux de T4.22 (`E_CONFIG_SYMLINK`, `E_CONFIG_TYPE`, `E_CONFIG_TOO_LARGE`).
- **Fichiers du banc** : `openOwnerOnly` ouvre avec `O_NOFOLLOW`, `O_NONBLOCK` (un tube nommé planté ne bloque plus le banc ni ses signaux) et sans `O_TRUNC`, puis refuse avec `E_SIM_FILE` ce
  qui n'est pas un fichier ordinaire de cet utilisateur à un seul lien, ou dont le nom ne désigne plus le fichier
  ouvert ; il ne resserre et ne vide le fichier qu'après ces contrôles.
- **Dossiers du banc** : nouvelle fonction `ownerOnlyDir`, appliquée au dossier de travail, au `HOME` du relais, puis à chaque dossier de
  nœud et son `user-home`, avant tout processus : un vrai dossier de l'utilisateur, fermé aux autres (0700) ; un lien
  ou le dossier d'un autre est refusé avec `E_SIM_WORK_DIR`. `campaign.ts` n'appelle plus `mkdirSync`.
- **Démarrage parallèle** : `init` et `publish` passent par `inParallel`, au plus un processus par cœur ; après un
  échec rien de nouveau ne part et les processus en cours sont attendus. Ces processus courts rejoignent la liste
  arrêtée sur SIGINT ou SIGTERM.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `node` : l'onboarding lit les configurations par le lecteur partagé, sans suivre un lien et sans bloquer sur un tube
  nommé. Le code vit dans `packages/node` et `packages/capabilities` (lecteur partagé).
- `simulation` : écritures sans suivre de lien, dossiers fermés aux autres, démarrage parallèle borné.

## Impact

Code : `packages/capabilities/src/clients.ts` (option `followLinks`), `packages/capabilities/src/index.ts`,
`packages/node/src/onboarding.ts`, `packages/simulation/src/owner-files.ts`, `campaign.ts`, nouveau `parallel.ts`.
Tests : `capabilities/test/linear-parsing.test.ts`, `node/test/clients-auto.test.ts`,
`simulation/test/owner-files.test.ts`, `campaign.test.ts`, nouveau `parallel.test.ts`. Aucune dépendance, aucun
format de message ni de stockage ne change. Le comportement par défaut de `readConfigText` ne change pas.

## Non-goals

- Les écritures de l'onboarding (renommage atomique de T4.22) et les écritures du Node lancé par le banc
  (`writePrivate`) : hors de cette ligne.
- Alléger le démarrage du CLI de `drop` lui-même (graphe de modules chargé à chaque `init`).
- Paralléliser les attentes « nœud servi » : les processus `serve` tournent déjà tous en même temps, les attendre en
  parallèle ne raccourcit rien.
