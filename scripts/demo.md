# Script de démo, Mac + VPS (T1.14)

Rejoue le scénario de la spec 08 avec le relais public. Résultat et captures du 8 octobre 2026 : `docs/demo/README.md`.
Pour une démo 100 % locale, sans VPS : `scripts/demo-local.sh`.

## Avant

- Le relais tourne : `curl https://drop.memolabs.dev/health` répond `{"ok":true,…}`.
- Sur le VPS, le Node du lab publie `production.error_summary` sur les logs du reverse proxy, avec ton Node Mac comme
  approbateur (D22).
- Sur le Mac, deux Nodes autorisés sur le relais (configuration versionnée du relais déployé, ou invitation, T2.1) et
  appairés :
  - Guillaume : `~/.drop`, port 7781 ;
  - Julie : `~/.drop-julie`, port 7782, qui publie `repo.answer` sur `docs/demo/julie-repo` :
    `DROP_HOME=~/.drop-julie node packages/node/src/cli.ts publish repo.answer --approver <nodeId de Julie> --config <fichier>`
    avec `{ "repoPath": "<chemin absolu>/docs/demo/julie-repo" }`.

## Lancer les daemons

```bash
node packages/node/src/cli.ts serve
```

```bash
OPENROUTER_API_KEY="$(security find-generic-password -a "$USER" -s 'OpenRouter API Key' -w)" DROP_HOME=~/.drop-julie node packages/node/src/cli.ts serve
```

Seul le daemon de Julie a une clé de modèle : c'est elle qui paie ses réponses.

## L'agent

Avec Claude Code : `claude mcp add drop -e DROP_AGENT=claude_code -- node <repo>/packages/requester-mcp/src/index.ts`,
ou `--mcp-config docs/demo/mcp-guillaume.json` (remplacer `/path/to/drop` par le chemin du dépôt ; sans `DROP_HOME`,
le Node de Guillaume est `~/.drop`). Avec Codex : le bloc `[mcp_servers.drop]` de `packages/requester-mcp/README.md`.

## Déroulé

1. Demander à l'agent : « La prod de traefik va bien ? ». Il appelle `list_capabilities`, propose le résumé des erreurs
   de production ; tu acceptes, il appelle `request_drop`.
2. La notification arrive sur le Mac. Ouvrir l'UI de consentement de Guillaume (le lien est affiché par `drop serve`
   dans un terminal), lire la carte, cliquer « Autoriser une fois ».
3. Le VPS exécute ; l'agent reçoit l'état et les erreurs principales, et continue.
4. Demander : « Est-ce que l'implémentation de Julie gère déjà le mode sombre ? ». La carte s'affiche chez Julie
   (UI sur le port 7782) : « Autoriser une fois », puis relecture de la réponse, puis « Envoyer ». L'agent reçoit une
   réponse avec des noms de fichiers, sans code.
5. `node packages/node/src/cli.ts receipts`, puis la même commande avec `DROP_HOME=~/.drop-julie` et, sur le VPS,
   la même commande dans le conteneur du Node du lab : chaque demande a son reçu des deux côtés.
6. Le test des 30 secondes : montrer les étapes 1 à 3 à quelqu'un sans prononcer « MCP ». S'il comprend ce qui s'est
   passé et pourquoi personne n'a donné d'accès, c'est gagné.
