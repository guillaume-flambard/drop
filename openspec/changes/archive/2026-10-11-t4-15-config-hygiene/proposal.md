# Proposal

## Why

L'audit T4.0 a relevé des écarts de configuration avant l'essai : le schéma lisait par défaut un profil `legacy` alors que `drop init` crée un profil privé, `peers.json` et `team.json` restaient lisibles par les autres comptes du poste, `E_QUEUE_FULL` manquait à la liste des codes stables, un commentaire du protocole affirmait encore que le propriétaire paie toujours (D21, dépassé par D27), et le profil privé ne garantissait `payer: owner` que par la valeur écrite par `drop init`.

## What Changes

- Le schéma de configuration lit un fichier sans `profile` comme privé ; il doit alors passer les contrôles du profil privé. Un fichier `legacy` doit le dire. `drop migrate-private` lit encore un fichier antérieur aux profils comme `legacy`.
- En profil privé, `payer` vaut `owner` s'il est omis et `requester` est refusé par le schéma (D40).
- `peers.json` et `team.json` sont écrits en `0600`, en resserrant un fichier existant avant d'y écrire, et le daemon les resserre au démarrage.
- `E_QUEUE_FULL` rejoint `ERROR_CODES`.
- Le commentaire D21 de `messages.ts` décrit D21, D27 et D40.
- Liste des agents : déjà alignée par T4.19 (`AGENTS` dérive de `REQUESTER_AGENTS`) ; un test le garde.
- `relay.config.json` : déjà en `0600`, fichier existant compris, depuis T4.19 (`writePrivate` du relais) ; rien à changer.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `node` : fichiers des pairs et de l'équipe privés ; profil par défaut et payeur du profil privé.
- `protocol` : `E_QUEUE_FULL` parmi les codes stables.

## Impact

`packages/node/src/home.ts`, `private-config.ts`, `cli.ts`, `daemon.ts`, `packages/protocol/src/errors.ts`, `messages.ts`, leurs tests, `docs/PRIVATE_PROFILE.md`. Rupture assumée : un `config.json` sans `profile` et sans réglages privés valides est refusé au démarrage (`E_DENIED invalid private profile`) au lieu d'être lu comme `legacy` ; l'ajout de `"profile": "legacy"` ou `drop migrate-private` le corrige.
