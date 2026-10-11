# Exploitation du lab : relais, site et mises à jour

Ce que drop fait tourner sur le VPS lab, sous `drop.memolabs.dev`, et ce qui reste à reporter dans `lab-infra` (D22, D69 à D75). Ce dépôt ne touche pas à `lab-infra` : chaque changement passe là-bas par PR, selon les conventions du lab. Les règles Traefik sont en syntaxe v3.

Ce document décrit la configuration fusionnée dans `lab-infra` au 11 octobre 2026. Il ne décrit pas l'état observé sur le serveur : vérifier avec les commandes de la dernière section.

## Ce qui tourne

- **Stack `drop`** : `drop-relay` (`wss://drop.memolabs.dev/v1` et `/health`, configuration `/config/relay.config.json`) et `drop-node`, le Node du lab, sortant uniquement, identité dans `/opt/drop/home`. Les deux utilisent l'image `127.0.0.1:5000/drop:latest`, reconstruite à chaque commit sur `main`, avec des commandes différentes. **À reporter dans `lab-infra`** : depuis le passage aux runners hébergés par GitHub, le runner self-hosted ne construit plus cette image. `build.yml` publie `ghcr.io/guillaume-flambard/drop:<sha complet>`, `:main` et `:latest` à chaque commit sur `main` (`latest` ne vient jamais d'un tag ni d'une pull request) ; la stack doit utiliser `ghcr.io/guillaume-flambard/drop:latest`, que l'agent autodeploy tire comme pour les autres apps publiques du lab. Un paquet GHCR de compte personnel naît privé (il hérite des accès du dépôt, pas de sa visibilité) : le passer en public dans les réglages du paquet, ou donner au VPS un jeton `read:packages`.
- **Stack `drop-site`** : la vitrine, publiée le 8 octobre 2026 (T2.6b, `lab-infra` #103, commit `a92933a`). C'est un nginx en lecture seule qui sert un export statique des pages, rangé dans `stacks/drop-site/html/` avec sa révision et ses empreintes dans `SOURCE.json`. L'export en ligne est celui du commit `54654b1` du 8 octobre : **les pages corrigées depuis ne sont pas en ligne** tant qu'un nouvel export n'est pas publié.

Le serveur du site n'a accès ni au dépôt drop, ni aux clés, ni aux données des Nodes. Il tourne sans privilèges, sans port hôte. Ses règles laissent `/v1*` et `/health` au relais. Arrêter ou mettre à jour `drop-site` ne redémarre pas `drop`.

Le rsync du déploiement écrase `relay.config.json` : tout état que le relais écrit doit vivre sur un volume à part.

## Relais : admissions et révocation (D69, D75)

La configuration du lab garde déjà les admissions (`admittedPath`, `lab-infra` #102). Elle n'a pas encore de `revokedPath`. À ajouter dans `relay.config.json`, sur le volume d'état :

```json
{
  "revokedPath": "/var/lib/drop-relay/revoked.json",
  "maxAdmissionsPerSponsorPerDay": 20,
  "maxAdmissionsPerDay": 100
}
```

Avec `revokedPath`, révoquer un Node ne demande aucun redémarrage : le relais en marche applique la révocation en quelques secondes (T2.19). `--with-invited` révoque aussi les Nodes qu'il a fait admettre.

```sh
docker compose -f /opt/stacks/drop/compose.yml exec drop-relay \
  node packages/relay/src/cli.ts revoke <nodeId> [--with-invited] --config=/config/relay.config.json
```

## Passerelle grand public : option cloud différée

Le service `drop-gateway` (connecteur `https://drop.memolabs.dev/mcp` pour Claude et ChatGPT, T2.13, D31) a une configuration dans `lab-infra` (#104). **Ce n'est pas un parcours produit** : T2.13 n'est pas livrée, le profil privé refuse la liaison (`drop://link`), et une politique d'entreprise peut interdire toute passerelle. C'est une option cloud à réévaluer après la preuve privée (T3.5). Les détails restent dans la change T2.13 et dans D31 et D71.

## Publier une nouvelle version du site

Modèle en place : export statique servi par nginx.

1. Dans un worktree propre de drop : `pnpm install --frozen-lockfile`, `pnpm -r test`, puis `pnpm site:build`. Le script produit dans `dist/site/` la liste de fichiers déclarée dans `scripts/site.ts` (`sourceFiles`, 22 fichiers au 11 octobre 2026).
2. Dans un worktree `lab-infra` distinct : remplacer tout `stacks/drop-site/html/`, mettre à jour `SOURCE.json` (commit source et empreintes), ouvrir une PR limitée à cette stack. Le contrôle HTTP est dans `stacks/drop-site/check.py`.
3. Après revue, depuis `lab-infra` : `make check`, puis `make deploy-stack app=drop-site`. Le rôle prend le verrou autodeploy. Vérifier le HTTPS, les empreintes, les refus et que les conteneurs du relais n'ont pas redémarré.

Le contenu passe par Ansible, jamais par un tag d'image `latest`. La sonde de l'inventaire n'est pas une surveillance HTTPS périodique ; le conteneur a son propre healthcheck.

**Revenir en arrière** : rétablir l'export précédent par un revert dans `lab-infra`, puis redéployer uniquement `drop-site`. Pour retirer la vitrine, arrêter seulement cette stack sous le verrou autodeploy et retirer son entrée d'inventaire par PR.

## Modèle prévu : le site servi par `node scripts/site.ts serve`

Pas encore en place. Il remplace l'export nginx quand il faudra servir aussi les fichiers de mise à jour de l'app (D70, D72). Service `drop-site`, même image que le relais :

- commande : `node scripts/site.ts serve` (les pages sont rendues en mémoire depuis les sources, rien n'est écrit) ;
- volume : `/opt/drop/releases` sur `/srv/releases`, en lecture seule ;
- environnement : `SITE_HOST=0.0.0.0`, `SITE_PORT=8080`, `SITE_PUBLIC_HOST=drop.memolabs.dev`, `SITE_RELEASES_DIR=/srv/releases` ;
- route Traefik vers le port 8080, de priorité la plus basse : `` Host(`drop.memolabs.dev`) ``, sauf `/v1` et `/health`.

Ce serveur ne sert du dossier de versions que `updates/latest.json`, `updates/drop-<version>-darwin-<aarch64 ou x86_64>.app.tar.gz`, `downloads/drop.dmg` et `downloads/drop.mcpb`. Publier une version de l'app : copier l'archive d'abord, `latest.json` ensuite (produits par `node scripts/build-mac.ts --updates`, voir [MAC_RELEASE](MAC_RELEASE.md)). `drop.dmg` et `drop.mcpb` vont dans le même dossier quand `site/site.json` passe à `"installs": "open"`.

## Vérifier après déploiement

```sh
curl -s https://drop.memolabs.dev/health                # relais : {"ok":true,…}
curl -sI https://drop.memolabs.dev/                     # site : 200
curl -sI https://drop.memolabs.dev/updates/latest.json  # 404 tant qu'aucune version n'est publiée
```

Puis, depuis un Mac : `drop invite` chez un membre et `drop pair` chez un nouveau venu absent de l'allowlist (T2.1).

Les preuves de la première publication sont dans [la change T2.6b archivée](../openspec/changes/archive/2026-10-08-t2-6b-site-publication/).
