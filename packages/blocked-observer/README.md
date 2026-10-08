# blocked-observer

Mesure, sur tes vraies sessions de Claude Code et de Codex, combien de fois ton agent est bloqué par une ressource qui
appartient à quelqu'un d'autre : un accès, une donnée, une permission, un contexte. Rien ne quitte ta machine. Pas de
réseau, pas de compte, pas de daemon.

## Installer en 5 minutes

Prérequis : Node 22.18 ou plus, et ce dépôt cloné avec `pnpm install`.

```bash
node packages/blocked-observer/src/cli.ts install
```

La commande **affiche** ce qu'il faut ajouter, sans rien modifier. Tu copies chaque bloc :

1. **Claude Code, l'outil `report_blocked`** : la commande `claude mcp add blocked-observer …` qu'elle affiche.
2. **Claude Code, le hook** : le bloc JSON, à fusionner dans `~/.claude/settings.json`. Il écoute `PostToolUse`
   (outil réussi) et `PostToolUseFailure` (outil en échec : c'est là qu'arrivent la plupart des 401 et 403).
3. **Codex, l'outil `report_blocked`** : le bloc `[mcp_servers.blocked-observer]`, dans `~/.codex/config.toml`.
4. **Codex, les événements** : Codex n'a pas de hook. Lance de temps en temps
   `node packages/blocked-observer/src/cli.ts import-codex --since 7d`, qui lit tes logs de session locaux
   (`~/.codex/sessions`).
5. **Dans le `AGENTS.md` ou `CLAUDE.md` des repos observés**, la phrase affichée par `print-instructions`.

## Ce qui est collecté

Dans `~/.blocked-observer/` (mode 0700), modifiable par `BLOCKED_OBSERVER_HOME` :

- `events.jsonl`, un événement par ligne :
  - **quand l'agent appelle `report_blocked`** : ce qui manque (accès, donnée, outil, contexte, permission), la
    ressource, à qui elle appartient selon lui, ce qu'il essayait de faire, et comment il a contourné. C'est le texte
    écrit par l'agent.
  - **quand un résultat d'outil ressemble à un blocage** (401, 403, « permission denied », outil MCP introuvable…) :
    l'heure, le nom de l'outil, l'identifiant de session, le **nom** du motif reconnu et une empreinte SHA-256
    tronquée de la ressource visée (URL, chemin ou commande).
- `activity.json` : les jours et identifiants de session où un agent a travaillé, pour compter les « jours actifs ».
- `errors.log` : les erreurs du hook, qui ne fait jamais échouer Claude Code.

## Ce qui n'est jamais collecté

- Le contenu des résultats d'outils : ni la sortie, ni l'erreur, ni un extrait.
- La ressource elle-même pour les événements automatiques : seulement son empreinte.
- Rien n'est envoyé nulle part. Seul `export` écrit un fichier, après ta relecture.

## Utiliser

```bash
node packages/blocked-observer/src/cli.ts list --since 7d        # les événements
node packages/blocked-observer/src/cli.ts classify <id>          # après l'entretien : type de blocage, minutes perdues
node packages/blocked-observer/src/cli.ts report --since 30d     # synthèse par jour actif
```

## Exporter

```bash
node packages/blocked-observer/src/cli.ts export --out blocages.json
```

L'export montre chaque événement un par un. Tu peux le retirer, et pour chaque champ texte (ressource, propriétaire,
action, note) le garder, le remplacer par son empreinte ou le supprimer. Seul ce que tu as gardé est écrit.
