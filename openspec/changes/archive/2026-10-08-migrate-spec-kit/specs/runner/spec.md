# Spec Delta

## Purpose

Le runner (`packages/runner`) exécute une capacité approuvée dans un cadre fixe : outils figés, répertoire temporaire, budget, validation de sortie et scan de secrets. Les implémentations des capacités vivent dans `packages/capabilities`.

## ADDED Requirements

### Requirement: Interface CapabilityImpl

Chaque capacité MUST implémenter `CapabilityImpl<I, O>` avec exactement ces membres : `card: Omit<CapabilityCard, 'owner' | 'executorNodeId' | 'approverNodeIds'>` (complétée à la publication) ; `input: z.ZodType<I>` ; `output: z.ZodType<O>` ; `preview(input: I): string` (rendu lisible pour la carte de consentement) ; `execute(input: I, ctx: RunContext): Promise<O>`.

#### Scenario: Carte complétée à la publication

- **WHEN** une capacité est publiée par un Node
- **THEN** les champs `owner`, `executorNodeId` et `approverNodeIds` de sa `CapabilityCard` sont complétés à la publication
- **AND** l'implémentation ne fournit que `card` sans ces trois champs

#### Scenario: Aperçu pour la carte de consentement

- **WHEN** la carte de consentement d'un Drop est affichée à l'approbateur
- **THEN** le rendu lisible de l'entrée provient de `preview(input)`

### Requirement: Contexte d'exécution RunContext

`execute()` MUST ne recevoir QUE ce que le cadre lui donne, à savoir l'entrée validée et un `RunContext` composé de : `config: unknown` (config propriétaire de la capacité, validée par son propre schéma zod) ; `workdir: string` (répertoire temporaire créé et supprimé par le runner) ; `signal: AbortSignal` (déclenché à `budget.maxSeconds`) ; `recordToolCall(name: string): void`.

#### Scenario: Config propriétaire validée par son schéma

- **WHEN** le runner appelle `execute(input, ctx)`
- **THEN** `ctx.config` a été validée par le schéma zod propre à la capacité
- **AND** la capacité ne reçoit aucune autre ressource que `input` et `ctx`

#### Scenario: Signal déclenché au budget de temps

- **WHEN** la durée d'exécution atteint `budget.maxSeconds` de la carte
- **THEN** `ctx.signal` est déclenché

#### Scenario: Enregistrement des appels d'outils

- **WHEN** une capacité appelle un outil pendant `execute()`
- **THEN** elle le signale au cadre via `ctx.recordToolCall(name)`

### Requirement: Pipeline imposé en 8 étapes

Pour chaque Drop approuvé, le runner MUST appliquer le pipeline imposé dans cet ordre exact : 1. validation de `input` ; 2. création de `workdir` et armement du timeout ; 3. `execute()` ; 4. validation `output.strict()` ; 5. contrôle de taille (`card.maxOutputChars`) ; 6. scanner de secrets ; 7. relecture si `sensitivity: 'high'` ; 8. suppression de `workdir`, écriture du reçu, envoi du résultat.

#### Scenario: Ordre des étapes respecté

- **WHEN** un Drop approuvé est exécuté par le runner
- **THEN** les étapes 1 à 8 s'enchaînent dans cet ordre
- **AND** la sortie est validée par son schéma (étape 4) avant d'être scannée (étape 6)

### Requirement: Étape 1, validation de l'entrée

Le runner MUST valider `input` avec le schéma zod de la capacité avant toute exécution. Une entrée invalide MUST produire `E_SCHEMA` et la capacité n'est jamais exécutée.

#### Scenario: Entrée invalide rejetée

- **WHEN** l'entrée d'un Drop approuvé ne respecte pas le schéma `input` de la capacité
- **THEN** le runner échoue avec `E_SCHEMA`
- **AND** `execute()` n'est jamais appelé

### Requirement: Étape 2, répertoire temporaire et timeout

Après validation de l'entrée, le runner MUST créer `workdir` avec `fs.mkdtemp` et armer le timeout avant d'appeler `execute()`. Le timeout MUST déclencher `ctx.signal` à `budget.maxSeconds`.

#### Scenario: Répertoire de travail créé par le runner

- **WHEN** l'entrée est valide
- **THEN** le runner crée un répertoire temporaire via `fs.mkdtemp` et le passe dans `ctx.workdir`
- **AND** le timeout est armé avant l'appel à `execute()`

### Requirement: Étape 3, exécution de la capacité

Le runner MUST appeler `execute(input, ctx)` uniquement après les étapes 1 et 2, avec l'entrée validée et le `RunContext` construit par le cadre.

#### Scenario: Exécution après préparation

- **WHEN** l'entrée est validée et `workdir` créé
- **THEN** le runner appelle `execute(input, ctx)` une fois avec ces valeurs

### Requirement: Étape 4, validation stricte de la sortie

Le runner MUST valider la sortie de `execute()` avec `output.strict()`. Une sortie invalide MUST produire `E_OUTPUT_INVALID` et MUST être rejetée, jamais réparée.

#### Scenario: Champ inattendu dans la sortie

- **WHEN** `execute()` renvoie un objet contenant un champ absent du schéma `output`
- **THEN** le runner échoue avec `E_OUTPUT_INVALID`

#### Scenario: Pas de réparation de sortie

- **WHEN** la sortie de `execute()` ne respecte pas `output.strict()`
- **THEN** le runner ne tente ni correction, ni troncature, ni complétion de la sortie
- **AND** rien n'est envoyé au demandeur

### Requirement: Étape 5, taille maximale de la sortie

Le runner MUST vérifier que la sortie sérialisée ne dépasse pas `card.maxOutputChars`. Une sortie trop longue MUST produire `E_OUTPUT_INVALID`.

#### Scenario: Sortie sérialisée trop longue

- **WHEN** la sortie validée, une fois sérialisée, dépasse `card.maxOutputChars` caractères
- **THEN** le runner échoue avec `E_OUTPUT_INVALID`

### Requirement: Étape 6, scan de secrets de la sortie

Le runner MUST passer toutes les chaînes de la sortie validée au scanner de secrets. Une détection MUST produire `E_SECRET_DETECTED` : le Drop échoue et rien ne sort.

#### Scenario: Secret dans une chaîne imbriquée

- **WHEN** une chaîne d'un tableau ou d'un objet imbriqué de la sortie correspond à un motif du scanner
- **THEN** le Drop échoue avec `E_SECRET_DETECTED`
- **AND** aucune partie de la sortie n'est envoyée

### Requirement: Étape 7, relecture des capacités sensibles

Si la carte déclare `sensitivity: 'high'`, le runner MUST envoyer `review_request` à l'approbateur, attendre `review_decision` et appliquer ses `redactions` avant l'envoi du résultat.

#### Scenario: Capacité à haute sensibilité

- **WHEN** la sortie d'une capacité `sensitivity: 'high'` a passé les étapes 4 à 6
- **THEN** le runner envoie `review_request` à l'approbateur et attend `review_decision`
- **AND** les `redactions` de la décision sont appliquées avant l'étape 8

#### Scenario: Capacité à faible sensibilité

- **WHEN** la carte déclare `sensitivity: 'low'`
- **THEN** l'étape 7 n'envoie pas de `review_request`

### Requirement: Étape 8, nettoyage, reçu et envoi

En fin de pipeline, le runner MUST supprimer `workdir`, écrire le reçu, puis envoyer le résultat.

#### Scenario: Fin de pipeline nominale

- **WHEN** la sortie a passé les étapes 4 à 7
- **THEN** `workdir` est supprimé, le reçu est écrit et le résultat est envoyé au demandeur

### Requirement: Module de scan de secrets

Le scanner de secrets MUST vivre dans le module `secrets.ts` et reposer sur une liste de motifs couverte par des tests.

#### Scenario: Motifs testés

- **WHEN** la suite de tests du runner s'exécute
- **THEN** chaque motif de `secrets.ts` est couvert par au moins un test de détection

### Requirement: Motifs de clés et de jetons

Le scanner MUST détecter : les en-têtes de clé privée PEM ; `AKIA[0-9A-Z]{16}` ; `sk-[A-Za-z0-9_-]{20,}` ; `sk-ant-[A-Za-z0-9_-]{20,}` ; `gh[pousr]_[A-Za-z0-9]{36}` ; `xox[baprs]-` ; les JWT (`eyJ…\.eyJ…\.`).

#### Scenario: En-tête de clé privée PEM

- **WHEN** une chaîne de la sortie contient `-----BEGIN PRIVATE KEY-----`
- **THEN** le scanner signale un secret

#### Scenario: Clé Anthropic

- **WHEN** une chaîne de la sortie contient une valeur qui correspond à `sk-ant-[A-Za-z0-9_-]{20,}`
- **THEN** le scanner signale un secret

#### Scenario: Jetons GitHub, Slack et AWS

- **WHEN** une chaîne de la sortie correspond à `gh[pousr]_[A-Za-z0-9]{36}`, `xox[baprs]-` ou `AKIA[0-9A-Z]{16}`
- **THEN** le scanner signale un secret

#### Scenario: JWT

- **WHEN** une chaîne de la sortie correspond au motif JWT `eyJ…\.eyJ…\.`
- **THEN** le scanner signale un secret

### Requirement: Motifs d'affectation et d'entropie

Le scanner MUST aussi détecter les chaînes `KEY=`, `SECRET=`, `TOKEN=` ou `PASSWORD=` suivies d'une valeur, et les chaînes de plus de 32 caractères dont l'entropie de Shannon est > 4,5.

#### Scenario: Affectation d'un mot de passe

- **WHEN** une chaîne de la sortie contient `PASSWORD=` suivi d'une valeur
- **THEN** le scanner signale un secret

#### Scenario: Chaîne longue à forte entropie

- **WHEN** une chaîne de la sortie contient une séquence de plus de 32 caractères d'entropie de Shannon > 4,5
- **THEN** le scanner signale un secret

### Requirement: Faux positifs acceptés

Le scanner MUST privilégier le refus : un faux positif est accepté, car mieux vaut un Drop refusé qu'un secret sorti.

#### Scenario: Valeur bénigne qui ressemble à un secret

- **WHEN** une chaîne bénigne de la sortie correspond à l'un des motifs du scanner
- **THEN** le Drop échoue avec `E_SECRET_DETECTED`
- **AND** rien ne sort

### Requirement: Requête d'un pair traitée comme donnée non fiable

Toute requête reçue d'un pair MUST être traitée comme une donnée non fiable : validée par zod, puis passée comme donnée encadrée, et jamais concaténée dans un prompt comme instruction.

#### Scenario: Requête contenant une instruction

- **WHEN** une entrée de Drop contient un texte formulé comme une instruction au modèle
- **THEN** ce texte n'est transmis au modèle que comme donnée encadrée, après validation zod
- **AND** il n'est jamais inséré dans les instructions du prompt

### Requirement: Outils figés par la capacité

Le LLM MUST NOT décider de la frontière d'autorisation : les outils accessibles au runner MUST être fixés par la capacité avant l'appel au modèle, et le code MUST NOT ajouter d'outil en fonction du contenu de la requête.

#### Scenario: Requête qui demande un outil supplémentaire

- **WHEN** une requête demande l'usage d'un outil absent de la liste fixée par la capacité
- **THEN** la liste d'outils passée au modèle reste celle fixée par la capacité avant l'appel

### Requirement: Lecture de fichiers en allowlist sur copie temporaire

Toute lecture de fichiers par une capacité MUST se faire en allowlist uniquement, dans une copie temporaire. Une blacklist seule MUST NOT servir de contrôle d'accès.

#### Scenario: Fichier hors allowlist

- **WHEN** un fichier du répertoire source ne correspond à aucune entrée de l'allowlist
- **THEN** il n'est pas copié dans la copie temporaire et reste illisible pour la capacité

### Requirement: Aucun secret dans les logs, reçus et télémétrie

Le runner MUST NOT écrire de secret dans les logs, les reçus ou la télémétrie : il y stocke des hash et des métadonnées.

#### Scenario: Reçu d'un Drop

- **WHEN** le runner écrit le reçu d'un Drop à l'étape 8
- **THEN** le reçu contient des hash et des métadonnées, sans contenu brut de l'entrée ni de la sortie susceptible de porter un secret

### Requirement: Aucun port en écoute

Le runner MUST n'écouter sur aucun port : il se connecte en sortie au relais.

#### Scenario: Démarrage du runner

- **WHEN** le runner démarre
- **THEN** il n'ouvre aucun port en écoute
- **AND** il établit une connexion sortante vers le relais
