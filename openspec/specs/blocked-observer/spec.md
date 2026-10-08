# blocked-observer Specification

## Purpose
Étape 0 : mesurer, sur des sessions réelles de Claude Code et Codex, combien de fois un agent est bloqué par une
ressource détenue par quelqu'un d'autre, et préparer des entretiens sur ces événements réels. Rien d'autre.

## Requirements

### Requirement: Package isolé sans réseau
Le package `packages/blocked-observer` MUST fournir le binaire `blocked-observer`. Il MUST fonctionner sans aucun
accès réseau (zéro réseau) et MUST NOT dépendre d'aucun autre package du monorepo.

#### Scenario: Aucune dépendance interne
- **WHEN** on lit les dépendances et les imports de `packages/blocked-observer`
- **THEN** aucun autre package du workspace n'y figure

#### Scenario: Aucun appel réseau
- **WHEN** n'importe quelle commande `blocked-observer` s'exécute
- **THEN** aucune connexion réseau n'est ouverte

### Requirement: Deux sources rapprochées
Le système SHALL collecter deux sources, rapprochées ensuite : A, le rapport sémantique (pourquoi l'agent pense être
bloqué), via l'outil MCP `report_blocked` appelé par l'agent ; B, les événements objectifs (ce qui s'est réellement
passé), via un hook Claude Code sur les résultats d'outils et le parsing des logs de session Codex.

#### Scenario: Origine des événements
- **WHEN** un événement est enregistré
- **THEN** son champ `source` vaut `report` s'il vient de `report_blocked`, `hook_claude` s'il vient du hook Claude Code, `codex_log` s'il vient des logs Codex

### Requirement: Serveur MCP à outil unique
`blocked-observer mcp` SHALL lancer un serveur MCP en transport stdio qui expose un seul outil : `report_blocked`.

#### Scenario: Liste des outils
- **WHEN** un client MCP liste les outils du serveur lancé par `blocked-observer mcp`
- **THEN** la liste contient uniquement `report_blocked`

### Requirement: Schéma d'entrée de report_blocked
L'entrée de `report_blocked` MUST respecter : `missing` requis, parmi `'access' | 'data' | 'tool' | 'context' |
'permission' | 'other'` ; `resource` string requise, max 120 caractères (ex. "Datadog checkout service logs") ;
`owner_hint` string optionnelle, max 60 (ex. "équipe infra", "Julie") ; `attempted_action` string requise, max 200 ;
`workaround` optionnel, parmi `'asked_human' | 'skipped' | 'guessed' | 'stopped' | 'other'`.

#### Scenario: Entrée valide
- **WHEN** l'agent appelle `report_blocked` avec `missing: 'access'`, une `resource` de 120 caractères et un `attempted_action` de 200 caractères
- **THEN** l'appel est accepté

#### Scenario: Limite de longueur dépassée
- **WHEN** l'agent appelle `report_blocked` avec une `resource` de 121 caractères, un `owner_hint` de 61 caractères ou un `attempted_action` de 201 caractères
- **THEN** l'entrée est refusée par la validation

#### Scenario: Valeur d'énumération inconnue
- **WHEN** `missing` ou `workaround` contient une valeur hors de sa liste
- **THEN** l'entrée est refusée par la validation

### Requirement: Description de report_blocked mot pour mot
La description de l'outil `report_blocked` MUST être exactement : « Appelle cet outil quand tu ne peux pas continuer
ta tâche parce qu'il te manque une ressource, une donnée, un outil, un contexte ou une permission qui appartient à une
autre personne ou équipe. Ne l'appelle pas pour une erreur de code, un bug ou une information que tu peux trouver
toi-même. »

#### Scenario: Description exposée
- **WHEN** un client MCP liste les outils
- **THEN** la description de `report_blocked` est égale, caractère pour caractère, au texte ci-dessus

### Requirement: Retour de report_blocked
`report_blocked` SHALL retourner `{ recorded: true, id }`, où `id` est l'identifiant de l'événement enregistré.

#### Scenario: Accusé d'enregistrement
- **WHEN** l'agent appelle `report_blocked` avec une entrée valide
- **THEN** il reçoit `{ recorded: true, id }`
- **AND** un événement de `source: 'report'` portant cet `id` est ajouté à `~/.blocked-observer/events.jsonl`

### Requirement: report_blocked ne ralentit jamais l'agent
L'outil `report_blocked` MUST NOT bloquer ni ralentir l'agent : l'écriture de l'événement MUST être asynchrone et
l'appel MUST répondre en moins de 50 ms.

#### Scenario: Temps de réponse
- **WHEN** l'agent appelle `report_blocked` avec une entrée valide
- **THEN** la réponse arrive en moins de 50 ms, sans attendre la fin de l'écriture sur disque

### Requirement: Snippet d'instructions pour les repos observés
`blocked-observer print-instructions` SHALL afficher, pour `CLAUDE.md` / `AGENTS.md` des repos observés, exactement :
« Si tu ne peux pas avancer parce qu'une ressource, une donnée, une permission ou un contexte appartient à quelqu'un
d'autre, appelle `report_blocked` avant de continuer ou de t'arrêter. »

#### Scenario: Texte du snippet
- **WHEN** on lance `blocked-observer print-instructions`
- **THEN** la sortie contient ce texte, caractère pour caractère

### Requirement: Événement et entrée du hook Claude Code
<!-- à vérifier -->
`blocked-observer hook` SHALL être une commande de hook `PostToolUse` de Claude Code. Le nom de l'événement et le
format exact de l'entrée JSON sur stdin MUST être confirmés dans la doc Claude Code au moment de l'implémentation.

#### Scenario: Vérification de la doc avant implémentation
<!-- openspec-guard:non-testable reason="Lecture de la doc officielle, consignée dans docs/DECISIONS.md" -->
- **WHEN** la tâche implémente le hook
- **THEN** l'agent lit d'abord la doc officielle actuelle des hooks Claude Code (nom de l'événement, format JSON sur stdin)
- **AND** consigne ce qu'il a trouvé dans `docs/DECISIONS.md`

### Requirement: Champs enregistrés par le hook
Le hook SHALL lire l'entrée, chercher dans la sortie de l'outil les motifs de détection, et n'enregistrer **que** :
horodatage, nom de l'outil, identifiant de session, motif détecté, et un hash SHA-256 tronqué de la ressource visée si
elle est identifiable. Il MUST NOT copier le contenu de la sortie de l'outil.

#### Scenario: AC: 403 Forbidden sans extrait de la sortie
- **WHEN** un faux résultat d'outil contenant `403 Forbidden` est passé au hook
- **THEN** un événement est créé avec `source: 'hook_claude'`
- **AND** l'événement ne contient aucun extrait de la sortie de l'outil, seulement horodatage, outil, session, motif et éventuel `resource_hash`

#### Scenario: Aucun motif
- **WHEN** la sortie de l'outil ne correspond à aucun motif
- **THEN** aucun événement n'est enregistré

### Requirement: Le hook ne fait jamais échouer Claude Code
`blocked-observer hook` MUST toujours sortir en code 0, en moins de 100 ms. Sur entrée JSON invalide, il MUST
n'écrire aucun événement et MUST consigner l'erreur dans `~/.blocked-observer/errors.log`.

#### Scenario: AC: entrée JSON invalide
- **WHEN** le hook reçoit une entrée JSON invalide sur stdin
- **THEN** il sort en code 0
- **AND** rien n'est écrit dans `~/.blocked-observer/events.jsonl`
- **AND** l'erreur est écrite dans `~/.blocked-observer/errors.log`

#### Scenario: Temps de sortie
- **WHEN** le hook reçoit une entrée valide
- **THEN** il sort en code 0 en moins de 100 ms

### Requirement: Motifs de détection
Les motifs MUST être des regex nommées, listées dans `packages/blocked-observer/src/patterns.ts` et testées. Ils
reprennent l'intention des motifs v1 de la spec d'origine, resserrés en v2 après mesure (D23) : un 401 ou un 403
n'est reconnu que dans un contexte HTTP, « forbidden » et « unauthorized » seulement comme réponse, et chaque motif
tient sur une ligne. Le hook et l'import Codex MUST utiliser ces mêmes motifs. Seul le nom du motif est stocké.

#### Scenario: Vrais blocages reconnus
- **WHEN** une sortie contient `HTTP/1.1 401 Unauthorized`, `gh: HTTP 403`, `Permission Denied` ou `Requires sign-in`
- **THEN** le motif correspondant est détecté

#### Scenario: Bruit ignoré
- **WHEN** une sortie contient seulement un numéro de ligne 401, une table de tests `[401, 403]` ou un identifiant
  comme `BranchForbiddenError`
- **THEN** aucun motif n'est détecté

### Requirement: Import des logs Codex
`blocked-observer import-codex [--since 7d]` SHALL parser les logs de session locaux de Codex et enregistrer les
événements avec les mêmes motifs et les mêmes champs que le hook, avec `source: 'codex_log'` et `agent: 'codex'`.

#### Scenario: Import d'un blocage Codex
- **WHEN** un log de session Codex de moins de 7 jours contient une sortie avec `permission denied` et qu'on lance `blocked-observer import-codex --since 7d`
- **THEN** un événement `codex_log` est créé avec les seuls champs horodatage, outil, session, motif et éventuel `resource_hash`

### Requirement: Emplacement et format des logs Codex
<!-- à vérifier -->
L'emplacement et le format des logs de session locaux de Codex MUST être vérifiés dans la doc Codex au moment de
l'implémentation. S'ils sont introuvables, la tâche MUST s'arrêter et le documenter dans `docs/DECISIONS.md`.

#### Scenario: Vérification de la doc avant implémentation
<!-- openspec-guard:non-testable reason="Lecture de la doc officielle, consignée dans docs/DECISIONS.md" -->
- **WHEN** la tâche implémente `import-codex`
- **THEN** l'agent lit d'abord la doc officielle actuelle de Codex sur l'emplacement et le format des logs de session
- **AND** consigne ce qu'il a trouvé dans `docs/DECISIONS.md`

#### Scenario: Logs introuvables
<!-- openspec-guard:non-testable reason="Règle de conduite de la tâche T0.3 : arrêt et note dans docs/DECISIONS.md" -->
- **WHEN** l'emplacement ou le format des logs Codex ne peut pas être établi
- **THEN** la tâche s'arrête et le documente dans `docs/DECISIONS.md`

### Requirement: Fichier d'événements
Les événements MUST être stockés dans `~/.blocked-observer/events.jsonl`, à raison d'une ligne JSON par événement.

#### Scenario: Une ligne par événement
- **WHEN** deux événements sont enregistrés
- **THEN** `~/.blocked-observer/events.jsonl` gagne deux lignes, chacune un objet JSON valide

### Requirement: Schéma d'un événement
Chaque événement MUST suivre : `{ id, ts, source: 'report' | 'hook_claude' | 'codex_log', agent: 'claude_code' |
'codex' | 'other', session?: string, tool?: string, pattern?: string, missing?: string, resource?: string,
resource_hash?: string, owner_hint?: string, attempted_action?: string, workaround?: string, classification?:
Classification, pain_minutes?: number, note?: string }`.

#### Scenario: Champs requis
- **WHEN** on lit un événement de `events.jsonl`
- **THEN** il contient `id`, `ts`, `source` et `agent` avec des valeurs des listes ci-dessus

### Requirement: Rapprochement des événements A et B
Un événement A (`source: 'report'`) et un événement B (`hook_claude` ou `codex_log`) de la même session à moins de
5 minutes d'écart SHALL être liés par `linked_id`.

#### Scenario: Événements liés
- **WHEN** un `report` et un `hook_claude` de la même session sont espacés de 4 minutes
- **THEN** ils sont liés par `linked_id`

#### Scenario: Événements non liés
- **WHEN** les deux événements sont espacés de plus de 5 minutes ou viennent de sessions différentes
- **THEN** ils ne sont pas liés

### Requirement: Classification humaine
La classification SHALL être remplie par l'humain, pendant ou après l'entretien, avec un type `Classification` parmi
exactement : `'NO_ACCESS_IS_FINE' | 'NO_SHARE_IS_FINE' | 'NO_HUMAN_REQUIRED' | 'YES_LOCAL_CONTEXT' |
'YES_SENSITIVE_DATA' | 'YES_PRIVILEGED_ACTION' | 'YES_TEMPORARY' | 'NOT_A_BLOCK'`.

#### Scenario: Valeur hors liste
- **WHEN** l'humain saisit une classification hors de ces huit valeurs
- **THEN** elle est refusée

### Requirement: Commandes d'entrée de la CLI
La CLI MUST exposer : `blocked-observer mcp` (lance le serveur MCP stdio), `blocked-observer hook` (entrée du hook
Claude Code), `blocked-observer import-codex` (importe les événements Codex), ainsi que `install`, `list`,
`classify`, `report`, `export` et `print-instructions`.

#### Scenario: Sous-commandes disponibles
- **WHEN** on lance chacune des sous-commandes listées
- **THEN** elle est reconnue par le binaire `blocked-observer`

### Requirement: Commande install sans effet
`blocked-observer install` SHALL afficher, sans les appliquer, les commandes `claude mcp add`, le bloc de config du
hook et la config Codex.

#### Scenario: Affichage seul
- **WHEN** on lance `blocked-observer install`
- **THEN** la sortie contient les commandes `claude mcp add`, le bloc de config hook et la config Codex
- **AND** aucune configuration de Claude Code ou de Codex n'est modifiée

### Requirement: Commande list
`blocked-observer list [--since 7d]` SHALL afficher un tableau des événements, filtrable par ancienneté avec `--since`.

#### Scenario: AC: report_blocked visible dans list
- **WHEN** dans Claude Code l'agent appelle `report_blocked` puis l'utilisateur lance `blocked-observer list`
- **THEN** l'événement apparaît dans le tableau

#### Scenario: Filtre since
- **WHEN** on lance `blocked-observer list --since 7d`
- **THEN** seuls les événements des 7 derniers jours sont affichés

### Requirement: Commande classify
`blocked-observer classify <id>` SHALL poser des questions interactives sur l'événement `<id>` : classification,
minutes perdues et note, enregistrées dans `classification`, `pain_minutes` et `note`.

#### Scenario: Classification d'un événement
- **WHEN** on lance `blocked-observer classify <id>` et qu'on répond `YES_LOCAL_CONTEXT`, `15` et une note
- **THEN** l'événement `<id>` porte `classification: 'YES_LOCAL_CONTEXT'`, `pain_minutes: 15` et la note

### Requirement: Commande report
`blocked-observer report` SHALL afficher une synthèse : événements par jour actif, répartition par classification,
minutes perdues, et taux de blocages « YES » par dev-jour actif. Un « jour actif » MUST être un jour avec au moins un
événement hook ou une session Codex détectée.

#### Scenario: AC: chiffres justes sur fixture
- **WHEN** le test lance `report` sur un fichier d'événements de fixture
- **THEN** les événements par jour actif, la répartition par classification, les minutes perdues et le taux de blocages « YES » par dev-jour actif sont égaux aux valeurs attendues

#### Scenario: Jour sans événement hook ni session Codex
- **WHEN** un jour ne contient que des événements `report`
- **THEN** ce jour n'est pas compté comme jour actif

### Requirement: Commande export après relecture
`blocked-observer export --out file.json` SHALL afficher chaque événement avant écriture ; l'utilisateur MUST pouvoir
retirer ou anonymiser les champs texte, et le fichier écrit MUST NOT contenir un champ retiré.

#### Scenario: AC: champ retiré absent de l'export
- **WHEN** l'utilisateur retire un champ d'un événement pendant la relecture de `export`
- **THEN** le fichier `--out` ne contient pas ce champ (test)

### Requirement: Rien ne quitte la machine hors export
Les données MUST NOT quitter la machine en dehors de `export`, qui est explicite et relu.

#### Scenario: Seul export écrit hors du stockage local
- **WHEN** on utilise `mcp`, `hook`, `import-codex`, `list`, `classify` ou `report`
- **THEN** aucune donnée n'est envoyée hors de la machine

### Requirement: Hash des champs écrits par l'agent à l'export
`resource`, `owner_hint` et `attempted_action` sont du texte écrit par l'agent : `export` SHALL proposer de les
remplacer par leur hash.

#### Scenario: Anonymisation proposée
- **WHEN** l'export relit un événement contenant `resource`, `owner_hint` ou `attempted_action`
- **THEN** il propose de remplacer chacun de ces champs par son hash
- **AND** si l'utilisateur accepte, le fichier écrit contient le hash à la place du texte

### Requirement: Seuil go/no-go écrit par l'humain
Le seuil go/no-go MUST être écrit par l'humain dans `docs/DECISIONS.md` **avant** de lancer la mesure. Le kit MUST NOT
le fixer.

#### Scenario: Seuil écrit avant la mesure
<!-- openspec-guard:non-testable reason="Décision humaine écrite dans docs/DECISIONS.md" -->
- **WHEN** la mesure est lancée
- **THEN** `docs/DECISIONS.md` contient déjà le seuil go/no-go, écrit par l'humain
- **AND** aucun fichier du kit (code, config, doc) ne fixe de valeur de seuil

### Requirement: Agrégation de plusieurs développeurs
L'export MUST contenir les jours actifs du développeur, sous forme de dates seulement, avec ses événements relus.
`report --merge <exports…>` MUST additionner les dev-jours actifs et les événements de plusieurs exports, vérifier
l'échantillon (au moins 3 développeurs avec 10 jours actifs chacun) et appliquer le seuil go/no-go de D24.

#### Scenario: Verdict sur un échantillon suffisant
- **WHEN** trois exports de 10 jours actifs chacun totalisent 0,6 blocage YES par dev-jour et une médiane de 12 minutes
- **THEN** le rapport donne le verdict `GO`

#### Scenario: Échantillon insuffisant
- **WHEN** un seul export est fourni, ou qu'un développeur a moins de 10 jours actifs
- **THEN** le verdict est `INSUFFICIENT_SAMPLE`, quels que soient les chiffres

#### Scenario: Ancien format refusé
- **WHEN** un export est un simple tableau d'événements, sans jours actifs
- **THEN** il est refusé avec un message qui demande de réexporter
