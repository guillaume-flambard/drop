## Why

T4.37, lot D de `docs/research/2026-10-12-openwhispr.md`. Pendant l'essai entre collègues (D83), quand drop casse chez un testeur, Guillaume a besoin de ses journaux. Aujourd'hui l'app vide `daemon.log` à chaque démarrage (`File::create` dans `main.rs`) : le journal d'un plantage disparaît à la relance automatique. Rien n'affiche la version, rien ne dit où est le journal, et l'espace ne montre pas le code d'erreur qu'il reçoit (`WorkspaceApiError.code` n'est jamais rempli, le Node envoie le code dans `error`). Envoyer le dossier `~/.drop` entier exposerait la clé privée.

## What Changes

- **Journal gardé** : le Node écrit lui-même `DROP_HOME/logs/daemon.log` quand l'app le lance avec `DROP_LOG=file`. Il ne vide jamais le fichier : il ajoute un en-tête à chaque démarrage. Rotation à 2 Mio ou 7 jours vers `daemon.log.1` à `.3`, suppression des anciens fichiers après 14 jours. Dossier `0700`, fichiers `0600`.
- **En-tête système** : versions de l'app et du moteur, système et sa version, architecture, version de Node, pid, profil. Ni nom de machine ni nom d'utilisateur.
- **Expurgation dans l'écriture même** : chaque ligne passe par l'expurgation avant d'être écrite : valeurs connues (jeton local, variables d'environnement au nom de secret), valeurs des clés au nom de secret, paramètres d'URL sensibles, `Bearer`, puis tout jeton que le scanner de secrets reconnaît, remplacé par une empreinte courte. Une ligne qui déclenche encore le scanner est remplacée en entier. Toute écriture sur la sortie d'erreur du daemon et toute erreur non rattrapée passent par là.
- **Coque** : l'app ne vide plus le journal, passe sa version au Node, recueille dans le même fichier, après sa propre expurgation, ce que le moteur écrit hors de son journal (une erreur de l'exécutable avant le JavaScript), et range ses propres erreurs dans `logs/app.log`, plafonné à 1 Mio.
- **Diagnostic expurgé** : `GET /ui/admin/diagnostic` rend un texte à relire : versions, système, états, nombre de pairs, fins des deux journaux, réexpurgées, le dossier personnel remplacé par `~`, chaque ligne suspecte retirée et comptée. Le texte entier passe le scanner, sinon `E_SECRET_DETECTED`. `POST /ui/admin/logs/open` ouvre le dossier des journaux, jamais `~/.drop`.
- **Mon espace, page « Diagnostic »** : version, chemin du dossier des journaux avec « Ouvrir le dossier » et « Copier le chemin », « Préparer le diagnostic » qui affiche le texte entier, puis seulement « Copier le diagnostic ». drop n'envoie rien.
- **Codes d'erreur dans l'espace** : une phrase, puis « Détails techniques » repliables (code, statut HTTP, route) et « Copier les détails ».
- **Page de démarrage** : en cas d'échec, le chemin du journal, « Ouvrir le dossier des journaux » et « Copier le chemin ».

## Capabilities

### Modified Capabilities

- `node` : journal du daemon gardé, tourné, avec en-tête, expurgé à l'écriture ; diagnostic expurgé et ouverture du dossier des journaux.
- `owner-app` : journal jamais vidé par l'app, chemin du journal au démarrage, page « Diagnostic », codes d'erreur dans l'espace.

## Non-goals

- Panneau de la barre de menus : T4.30 et T4.31 y travaillent en parallèle ; aucune entrée « Diagnostic » n'y est ajoutée (l'espace s'ouvre depuis le menu de l'icône).
- Icône à états, mise à jour lisible, supervision des processus : T4.36.
- Erreurs typées partout, petits hooks, kit de composants (lot D4 à D8) : hors de cette ligne.
- Envoi automatique du diagnostic, télémétrie : jamais. Le propriétaire copie et envoie lui-même.
- Journal du relais : il a déjà le sien (`packages/relay`).

## Impact

`packages/node` (nouveaux `logs.ts`, `diagnostic.ts`, `version.ts`, API, daemon, CLI), `packages/desktop-ui` (`api.ts`, `App.tsx`, page `diagnostic`, bandeau d'erreur), `packages/node/src/workspace-assets.generated.ts` recompilé, `apps/desktop/src-tauri/src/main.rs`, `apps/desktop/web/index.html`, `apps/desktop/src-tauri/capabilities/default.json` (description), `docs/essais/README.md`, `docs/product/UX_UI.md`.
