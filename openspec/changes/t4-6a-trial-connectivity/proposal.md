# Proposal

## Why

T4.6a doit préparer le relais de l'essai avant le banc maison (T4.6c) et l'essai lui-même (D84). L'inspection du 11
octobre 2026 montre que ce relais n'est pas prêt, et que deux des trois défauts sont impossibles à voir depuis l'extérieur :

- Le conteneur en marche sous `drop.memolabs.dev` tourne le commit `d1f6336`, qui **n'a aucun ancêtre commun** avec
  `main` (`76cfb89`) : 247 commits de `main` ne sont pas déployés, 161 commits déployés ne sont pas sur `main`. La cause
  est que `stacks/drop/compose.yml` de lab-infra déclare `ghcr.io/guillaume-flambard/drop:latest`, alors que la copie
  déployée tire `127.0.0.1:5000/drop:latest`, le registre local nourri par le chemin des dépôts privés. La CI de `main`
  ne peut donc jamais mettre à jour le relais de l'essai.
- `GET /health` ne répond que `{"ok":true,"nodes":1}` : sans identité de build, « il tourne la dernière version » est
  invérifiable de l'extérieur, et le déploiement de la bonne image ne peut pas être prouvé.
- `relay.config.json` déployé porte `admittedPath` et trois nodes d'amorçage, mais **pas** `revokedPath`. La révocation
  sans redémarrage (T2.19, D75) est donc impossible sur le relais de l'essai.

## What Changes

- **`relay`** : `GET /health` porte en plus du compte de connexions une identité de build, fournie par la construction de
  l'image, pour rendre un déploiement vérifiable sans accès au serveur.
- **`deploy-mac-vps`** : retrait des deux exigences qui nomment `deploy/vps/drop-relay.service`,
  `deploy/vps/drop-node.service` et `deploy/vps/Caddyfile.example` — fichiers jamais présents dans l'historique git, et
  explicitement remplacés par D22 (« au lieu du Caddy et des unités systemd de la spec 08 »). Ajout des exigences du
  relais de l'essai : identité de build lisible et `revokedPath` sur le volume persistant.
- **`docs/deploiement-lab.md`** : la procédure « Vérifier l'état » devient capable de dire quelle version tourne.
- **lab-infra, dépôt voisin, PR distincte** : `stacks/drop/compose.yml` repasse sur `ghcr.io/guillaume-flambard/drop:latest`
  comme le déclare déjà le dépôt, et `stacks/drop/relay.config.json` gagne
  `"revokedPath": "/var/lib/drop-relay/revoked.json"`, même volume persistant que `admittedPath` (D69).

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `relay` : la sonde de santé porte l'identité de build, ce qui rend un déploiement vérifiable.
- `deploy-mac-vps` : retrait des exigences Caddy/systemd remplacées par D22 ; ajout de la préparation du relais de
  l'essai (identité de build lisible, `revokedPath` persistant).

## Non-goals

- **Admettre le Mac de Guillaume** : reste opérationnel, par invitation signée (T2.1) qui écrit dans `admittedPath` et
  survit aux redéploiements (D69). Jamais par `drop-relay allow` sur le serveur, que le prochain déploiement
  écraserait (D22).
- **Prouver l'échange entre deux réseaux différents** : fait au banc maison (T4.6c) et à l'acceptation manuelle, pas ici.
- Le protocole de l'essai (T4.6b), le lien unique pour rejoindre (T4.23), le banc maison (T4.6c), la passerelle grand
  public T2.13 (deferred, D34), et toute correction du contenu de l'image elle-même.
- Le reste de `deploy-mac-vps` : les démos de l'étape 1, le Node du VPS, le port 443 et le chart Helm restent en l'état.

## Impact

`packages/relay/src/server.ts` (sonde), `packages/relay/test/relay.test.ts`, `Dockerfile` (identité de build passée à la
construction), `openspec/specs/relay/spec.md`, `openspec/specs/deploy-mac-vps/spec.md`, `docs/deploiement-lab.md`,
`docs/DECISIONS.md` (D91), `docs/TASKS.md` (T4.6a passe à `doing`). Hors dépôt : `lab-infra`, `stacks/drop/compose.yml`
et `stacks/drop/relay.config.json`, par une PR distincte.
