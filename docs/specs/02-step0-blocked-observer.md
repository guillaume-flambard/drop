# 02 — Étape 0 : blocked-observer

## Objectif

Mesurer, sur des sessions réelles de Claude Code et Codex, **combien de fois un agent est bloqué par une ressource
détenue par quelqu'un d'autre**, et préparer des entretiens sur ces événements réels. Rien d'autre.

Package : `packages/blocked-observer`, binaire `blocked-observer`. Zéro réseau. Zéro dépendance aux autres packages.

## Deux sources, rapprochées ensuite

| Source | Ce qu'elle dit | Mécanisme |
| --- | --- | --- |
| A — rapport sémantique | Pourquoi l'agent pense être bloqué | Outil MCP `report_blocked` appelé par l'agent |
| B — événements objectifs | Ce qui s'est réellement passé | Hook Claude Code sur les résultats d'outils ; parsing des logs de session Codex |

## A. Serveur MCP

Transport stdio. Un seul outil :

```ts
report_blocked({
  missing: 'access' | 'data' | 'tool' | 'context' | 'permission' | 'other',
  resource: string,            // max 120 caractères, ex. "Datadog checkout service logs"
  owner_hint?: string,         // max 60, ex. "équipe infra", "Julie"
  attempted_action: string,    // max 200
  workaround?: 'asked_human' | 'skipped' | 'guessed' | 'stopped' | 'other',
})
```

Description de l'outil (à reprendre mot pour mot, c'est elle qui guide l'agent) :
« Appelle cet outil quand tu ne peux pas continuer ta tâche parce qu'il te manque une ressource, une donnée, un outil,
un contexte ou une permission qui appartient à une autre personne ou équipe. Ne l'appelle pas pour une erreur de code,
un bug ou une information que tu peux trouver toi-même. »

Retour : `{ recorded: true, id }`. L'outil ne doit jamais bloquer ni ralentir l'agent (écriture asynchrone, < 50 ms).

Snippet à ajouter dans `CLAUDE.md` / `AGENTS.md` des repos observés (fourni par `blocked-observer print-instructions`) :
« Si tu ne peux pas avancer parce qu'une ressource, une donnée, une permission ou un contexte appartient à quelqu'un
d'autre, appelle `report_blocked` avant de continuer ou de t'arrêter. »

## B. Événements objectifs

**Claude Code** : `blocked-observer hook` est une commande de hook `PostToolUse` (à confirmer dans la doc Claude Code
au moment de l'implémentation, nom de l'événement et format exact de l'entrée JSON sur stdin). Elle lit l'entrée,
cherche dans la sortie de l'outil les motifs ci-dessous, et n'enregistre **que** : horodatage, nom de l'outil,
identifiant de session, motif détecté, et un hash SHA-256 tronqué de la ressource visée si elle est identifiable.
Elle ne copie **jamais** le contenu de la sortie de l'outil. Elle sort toujours en code 0 en moins de 100 ms.

Motifs v1 (regex insensibles à la casse, liste dans un fichier dédié, testée) :
`\b401\b|\b403\b|permission denied|access denied|forbidden|unauthori[sz]ed|authentication required|
not authorized|EACCES|no such tool|tool .* not (found|available)|MCP server .* (not|failed)|requires? (login|sign[- ]in)`

**Codex** : `blocked-observer import-codex [--since 7d]` parse les logs de session locaux de Codex (emplacement et
format à vérifier dans la doc Codex au moment de l'implémentation ; si non trouvable, la tâche s'arrête et le
documente dans `docs/DECISIONS.md`). Mêmes motifs, mêmes champs.

## Stockage

`~/.blocked-observer/events.jsonl`, une ligne par événement :

```ts
{ id, ts, source: 'report' | 'hook_claude' | 'codex_log', agent: 'claude_code' | 'codex' | 'other',
  session?: string, tool?: string, pattern?: string, missing?: string, resource?: string,
  resource_hash?: string, owner_hint?: string, attempted_action?: string, workaround?: string,
  classification?: Classification, pain_minutes?: number, note?: string }
```

Rapprochement : un événement A et un événement B de la même session à moins de 5 minutes d'écart sont liés
(`linked_id`).

## Classification (remplie par l'humain, pendant ou après l'entretien)

```ts
type Classification =
  | 'NO_ACCESS_IS_FINE' | 'NO_SHARE_IS_FINE' | 'NO_HUMAN_REQUIRED'
  | 'YES_LOCAL_CONTEXT' | 'YES_SENSITIVE_DATA' | 'YES_PRIVILEGED_ACTION' | 'YES_TEMPORARY'
  | 'NOT_A_BLOCK';
```

## CLI

| Commande | Effet |
| --- | --- |
| `blocked-observer mcp` | Lance le serveur MCP (stdio) |
| `blocked-observer hook` | Entrée du hook Claude Code |
| `blocked-observer import-codex` | Importe les événements Codex |
| `blocked-observer install` | Affiche (sans les appliquer) les commandes `claude mcp add`, le bloc de config hook et la config Codex |
| `blocked-observer list [--since 7d]` | Tableau des événements |
| `blocked-observer classify <id>` | Questions interactives : classification, minutes perdues, note |
| `blocked-observer report` | Synthèse : événements/jour actif, répartition par classification, minutes perdues, taux de blocages « YES » par dev-jour actif |
| `blocked-observer export --out file.json` | Export **après relecture** : affiche chaque événement, l'utilisateur peut retirer ou anonymiser les champs texte avant écriture |

« Jour actif » = jour avec au moins un événement hook ou une session Codex détectée.

## Confidentialité

- Rien ne quitte la machine hors `export`, qui est explicite et relu.
- `resource`, `owner_hint`, `attempted_action` sont du texte écrit par l'agent : l'export propose de les remplacer par
  leur hash.

## Critères d'acceptation

- Dans Claude Code, l'agent peut appeler `report_blocked` et l'événement apparaît dans `list`.
- Un faux résultat d'outil contenant `403 Forbidden` passé au hook crée un événement sans aucun extrait de la sortie.
- `report` donne des chiffres justes sur un fichier d'événements de fixture (test).
- `export` ne contient aucun champ que l'utilisateur a retiré (test).
- Le hook ne fait jamais échouer Claude Code : entrée JSON invalide → code 0, rien écrit, erreur dans `~/.blocked-observer/errors.log`.

## Seuil go/no-go

À écrire par l'humain dans `docs/DECISIONS.md` **avant** de lancer la mesure. Le kit ne le fixe pas.
