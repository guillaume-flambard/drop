# T4.26 : tri des alertes de sécurité GitHub

## Why

L'audit des réglages du dépôt du 12 octobre 2026 a relevé 39 alertes ouvertes dans l'onglet Security de
`guillaume-flambard/drop` : 29 CodeQL et 10 Scorecard (les 2 alertes Dependabot sont déjà rejetées, voir la ligne
T4.26). La règle de la tâche : chaque alerte est corrigée avec un test, ou proposée au rejet avec sa raison écrite ;
une vraie faille se corrige à la racine, jamais en faisant taire l'outil.

Liste vivante relevée le 12 octobre 2026 par `gh api "repos/guillaume-flambard/drop/code-scanning/alerts?state=open"`.

## What Changes

Corrigées, chacune avec un test de régression :

- **ReDoS polynomial (alertes 2 à 10)** : les expressions régulières qui lisaient la réponse du modèle
  (`tool-loop.ts`), les configurations Codex et goose (`agents.ts`, `clients.ts`) et les commandes shell observées
  (`noise.ts`) prenaient un temps quadratique sur une entrée hostile : jusqu'à 85 s mesurées pour 100 000 caractères.
  Elles sont remplacées par des lectures en une passe, aux mêmes résultats (vérifiés sur l'ancien code avant la
  correction). Une configuration piégée ne peut plus bloquer le daemon, ni une réponse de modèle le runner.
- **Course entre contrôle et lecture (alertes 24, 25, 27)** : `readConfigText` (capacités), l'import des logs Codex
  (`blocked-observer`) et l'envoi d'un fichier de release (`scripts/site.ts`) ouvrent d'abord, puis contrôlent type,
  taille et date par le descripteur ouvert. `O_NONBLOCK` empêche un tube nommé de bloquer l'ouverture ; la lecture
  reste bornée si le fichier grossit entre-temps.
- **Fichiers temporaires (alertes 16 à 23)** : les fichiers du banc de simulation passent par trois fonctions qui les
  créent en 0600 et resserrent un fichier laissé plus large par une campagne précédente (`--work-dir`).
- **Écriture d'un chemin venu d'une donnée (en marge de l'alerte 53)** : `DropHome.publish` refuse un identifiant qui
  n'est pas un identifiant de capacité. `drop share --id ../../x` écrivait hors de `DROP_HOME/capabilities`.
- **Images non épinglées (Scorecard 37, 38, 39)** : les images de base des deux images de preuve sont épinglées par
  empreinte, et Dependabot les surveille comme les autres Dockerfile.

Proposées au rejet, avec leur raison dans la PR : injection de commande dans `official-command.ts` (46, 48 : seule voie
documentée par Node pour lancer un raccourci `.cmd`, déjà bornée par un refus des caractères dangereux et testée),
flux fichier vers HTTP (28 à 33 : jeton local envoyé à l'API locale, par conception), flux HTTP vers fichier (53 :
données validées par zod, écrites en 0600 sous des noms fixes), `pip install` non haché de l'image d'évaluation Hermes
(40), et les contrôles Scorecard qui décrivent le dépôt plutôt que le code (35, 41 à 45).

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `node` : publication nommée par un identifiant de capacité ; configurations des clients lues sans blocage ; raccourci
  Windows sans interprétation des métacaractères.
- `capability-mcp-answer` : réponse finale du modèle lue en temps linéaire.
- `blocked-observer` : filtre de bruit en temps linéaire, import Codex par un seul descripteur.
- `simulation` : fichiers de campagne réservés au propriétaire.
- `site` : fichier de release vérifié par le descripteur envoyé.
- `monorepo-tooling` : images de conteneur épinglées par empreinte.

`requester-mcp` n'est pas modifié : son alerte (32) est proposée au rejet.

## Impact

Code : `packages/capabilities` (`agents.ts`, `clients.ts`, `tool-loop.ts`), `packages/blocked-observer` (`noise.ts`,
`codex.ts`), `packages/node/src/home.ts`, `packages/simulation` (`campaign.ts`, nouveau `owner-files.ts`),
`scripts/site.ts`, les deux Dockerfile de preuve, `.github/dependabot.yml`. Aucune dépendance ajoutée. Aucun format
de message, de stockage ou d'API ne change.

## Non-goals

- Rejeter les alertes dans GitHub : Guillaume le fait après relecture de la PR.
- Réécrire le lancement des raccourcis Windows sans `cmd.exe` (lire la cible du raccourci npm) : changement de
  comportement de T4.22 sans machine Windows pour le vérifier.
- Hacher les dépendances Python de l'image d'évaluation Hermes.
- Changer la protection de branche ou la revue obligatoire (choix d'un mainteneur seul).
