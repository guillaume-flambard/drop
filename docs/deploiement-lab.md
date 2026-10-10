# Déploiement sur le VPS lab : ce qui reste à faire dans `lab-infra`

Tout ce que les tâches de l'étape 2 demandent à `lab-infra/stacks/drop`, rassemblé (D22, D69 à D75). Ce dépôt ne
touche pas à `lab-infra` : chaque point ci-dessous est à reporter là-bas, par PR, selon les conventions du lab. Les
règles Traefik sont écrites en syntaxe v3 ; les adapter aux labels et aux noms que la stack utilise déjà.

## Ce qui tourne déjà (D22)

- `drop-relay` : `wss://drop.memolabs.dev/v1` et `/health`, configuration `/config/relay.config.json`, recopiée par le
  rsync du déploiement à chaque fois.
- `drop-node` : le Node du lab, sortant uniquement, identité dans `/opt/drop/home`.
- L'image `127.0.0.1:5000/drop:latest`, reconstruite à chaque commit sur `main` : relais, Node, passerelle et site
  partagent la même image, avec des commandes différentes.

Le rsync écrase `relay.config.json` : tout état que le relais écrit doit vivre sur un volume à part.

## 1. Relais : admissions gardées et révocation (D69, D75)

Un volume d'état, par exemple `/opt/drop/relay-state` monté sur `/state` (uid 1000, mode 0700), et dans
`relay.config.json` :

```json
{
  "admittedPath": "/state/admitted.json",
  "revokedPath": "/state/revoked.json",
  "maxAdmissionsPerSponsorPerDay": 20,
  "maxAdmissionsPerDay": 100
}
```

Sans `admittedPath`, le relais oublie à chaque redéploiement les Nodes admis par invitation. Révoquer un Node, sans
redémarrage, depuis le serveur :

```sh
docker compose -f /opt/stacks/drop/compose.yml exec drop-relay \
  node packages/relay/src/cli.ts revoke <nodeId> [--with-invited] --config=/config/relay.config.json
```

## 2. Passerelle pour Claude et ChatGPT (T2.13, D31, D71)

Service `drop-gateway`, même image :

- commande : `docker/gateway-entrypoint.sh` ;
- volume : `/opt/drop/gateway` sur `/var/lib/drop-gateway` (uid 1000, 0700), qui garde son identité et l'état OAuth ;
- environnement : `GATEWAY_HOME=/var/lib/drop-gateway`, `GATEWAY_PUBLIC_URL=https://drop.memolabs.dev`,
  `GATEWAY_RELAY_URL=ws://drop-relay:7780/v1`, `GATEWAY_HOST=0.0.0.0`, `GATEWAY_PORT=7790` ;
- route Traefik vers le port 7790, prioritaire sur le site :
  `` Host(`drop.memolabs.dev`) && (PathPrefix(`/oauth`) || Path(`/mcp`) || PathPrefix(`/.well-known/oauth-`) || PathPrefix(`/gateway`)) `` ;
- sonde : `GET /gateway/health`.

Au premier démarrage, la passerelle écrit son `nodeId` dans ses journaux. Il faut alors :

1. l'ajouter à `allowedNodeIds` de `relay.config.json` (PR) ;
2. le donner aux Nodes comme passerelle de confiance : aujourd'hui `gateways` dans leur `config.json`, demain la valeur
   par défaut (T2.20), sinon l'app avertit à chaque liaison.

## 3. Site et mises à jour de l'app (T2.6, T2.4, D70, D72)

Service `drop-site`, même image :

- commande : `node scripts/site.ts serve` ;
- volume : `/opt/drop/releases` sur `/srv/releases`, en lecture seule ;
- environnement : `SITE_HOST=0.0.0.0`, `SITE_PORT=8080`, `SITE_PUBLIC_HOST=drop.memolabs.dev`,
  `SITE_RELEASES_DIR=/srv/releases` ;
- route Traefik vers le port 8080, de priorité la plus basse : `` Host(`drop.memolabs.dev`) ``, tout ce que ni le relais
  (`/v1`, `/health`) ni la passerelle ne prennent.

La mise en ligne du site reste soumise à l'accord de Guillaume (point d'arrêt de T2.6). Avant : choisir l'adresse de
contact (`site/site.json`) et rendre les exports Markdown lisibles hors du dépôt privé (D72).

Publier une version de l'app : copier dans `/opt/drop/releases` l'archive `drop-<version>-darwin-aarch64.app.tar.gz`
d'abord, `latest.json` ensuite (produits par `node scripts/build-mac.ts --updates`) ; `drop.dmg` et `drop.mcpb` vont
dans le même dossier quand le site passe en `open`.

## 4. Vérifier après déploiement

```sh
curl -s https://drop.memolabs.dev/health                                  # relais : {"ok":true,…}
curl -s https://drop.memolabs.dev/gateway/health                          # passerelle : {"ok":true}
curl -s https://drop.memolabs.dev/.well-known/oauth-authorization-server  # métadonnées OAuth de la passerelle
curl -sI https://drop.memolabs.dev/                                       # site : 200, Strict-Transport-Security
curl -sI https://drop.memolabs.dev/updates/latest.json                    # 404 tant qu'aucune version n'est publiée
```

Puis, depuis un Mac : `drop invite` chez un membre, `drop pair` chez un nouveau venu absent de l'allowlist (T2.1), et
une liaison Claude par le connecteur `https://drop.memolabs.dev/mcp` (T2.13).
