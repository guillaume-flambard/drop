# Design

## Context

Voir `proposal.md` pour le pourquoi. Le point qui gouverne le design : le relais de l'essai est une pile Docker déployée
depuis `lab-infra` (dépôt voisin), et le dépôt `drop` ne fournit que l'image et le contrat. Trois décisions d'exploitation
vivent donc hors de ce dépôt, et ce dépôt ne peut que les rendre observables.

État observé le 11 octobre 2026 : conteneur `drop-drop-relay-1`, image `127.0.0.1:5000/drop@sha256:d09a9bb5…` résolue au
commit `d1f6336`, `/opt/drop/relay/` vide, `relay.config.json` sans `revokedPath`, `/health` = `{"ok":true,"nodes":1}`.

## Goals / Non-Goals

**Goals :**

- Rendre la question « quelle version tourne ? » answerable en une requête, depuis n'importe où.
- Rendre le déploiement de la bonne image vérifiable plutôt que présumé.
- Rendre `revokedPath` applicable au relais de l'essai, sur un volume qui survit aux redéploiements.

**Non-Goals :**

- Admettre le Mac de Guillaume ou prouver l'échange entre deux réseaux : opérationnel, après cette change.
- Changer le comportement du protocole, du relais ou de la file d'attente.
- Reprendre le déploiement du relais dans ce dépôt : il reste dans lab-infra (D22).

## Decisions

**1. L'identité de build est le commit, pas la version du paquet.**
`packages/relay/package.json` porte `0.1.0` et ne bougera pas à chaque commit : une version de paquet ne peut pas
distinguer deux builds. La construction de l'image inscrit donc le SHA du commit dans l'environnement du conteneur ;
la sonde le recopie. Choix écarté : exposer la version semver (ne répond pas à la question), ou ajouter un endpoint
dédié (exigerait une route Traefik nouvelle dans un autre dépôt, alors que `/health` est déjà public et déjà sondé,
D22).

**2. L'absence est une valeur explicite, pas une erreur.**
Un build local sans SHA doit continuer à répondre : la sonde sert la supervision, et une sonde qui tombe masque une
panne du relais. La valeur d'absence est littérale, pour qu'un comparateur ne la prenne jamais pour un commit. La
sonde ne dit jamais « à jour » : elle donne un fait, la comparaison appartient à l'opérateur.

**3. Le repointage vers GHCR vit dans lab-infra, pas ici.**
`stacks/drop/compose.yml` de lab-infra déclare déjà `ghcr.io/guillaume-flambard/drop:latest` ; c'est la copie déployée
qui diverge. Réécrire la bonne valeur dans le dépôt IaC, puis laisser le déploiement l'appliquer, restaure l'intention
plutôt que d'inventer une nouvelle voie. Change distincte, PR distincte : lab-infra refuse les commits sur `main` et
pousse en production automatiquement.

**4. `revokedPath` rejoint `admittedPath` sur le volume persistant.**
La spec du relais exige que les deux chemins vivent sur le même volume ; la pile expose déjà `/opt/drop/relay` monté en
`/var/lib/drop-relay`, et `paths.yml` le passe en 0700 pour le propriétaire du conteneur. Écarté : une base de données
ou un stockage hors volume, qui contredirait D69 et perdrait l'état au redéploiement.

**5. Les exigences Caddy/systemd sont retirées, pas corrigées.**
`git log -- deploy/vps` est vide : ces fichiers n'ont jamais existé. D22 les a remplacés. Les « corriger » en créant
des unités systemd inviterait un agent futur à construire l'inverse de l'infrastructure réelle. La suppression est
documentée dans la delta pour que le motif reste lisible.

**6. L'admission du Mac se fait par invitation, jamais par `allow`.**
D22 l'interdit parce que le déploiement suivant écraserait la configuration versionnée ; l'invitation écrit dans
`admittedPath`, sur le volume persistant. Cette change prépare le terrain (config + vérifiabilité) sans l'exécuter.

## Risks / Trade-offs

- **Changement de lignée en production.** Repointer sur GHCR remplace un build de la lignée v2 par un build de `main`.
  Le comportement public du relais peut changer. Atténué : le déploiement tire, redémarre, sonde, et restaure si la
  réponse n'arrive pas ; le retour en arrière est un `git revert` dans lab-infra.
- **Divulgation de version sur une sonde non authentifiée.** Un inconnu peut lire le commit. C'est un renseignement
  mineur, déjà de moindre portée que le compte de connexions que la sonde expose, et il ne contient aucun secret. Accepté,
  noté ici parce que la sonde est publique.
- **Bascule visible dans l'image.** Si la lignée v2 portait une fonctionnalité que `main` n'a pas, le relais la perd au
  redéploiement. C'est la conséquence voulue du choix d'exploitation ; elle sera visible au banc maison (T4.6c).
- **Identité fausse si le build ne l'inscrit pas.** Un SHA absent vaut « inconnu » : la vérification échoue à prouver,
  jamais à tromper. La tâche de vérification le traite comme un échec, pas comme un succès silencieux.
