# capability-error-summary Specification

## Purpose
La capacité `production.error_summary` prouve la divulgation minimale : elle résume l'état et les erreurs d'un service de production sans qu'aucune ligne de log ne sorte.

## Requirements

### Requirement: Capacité déterministe sans LLM

La capacité `production.error_summary` MUST être entièrement déterministe et MUST NOT appeler de LLM.

#### Scenario: Exécution sans modèle

- **WHEN** la capacité s'exécute sur une fenêtre de logs
- **THEN** aucun appel à un modèle de langage n'a lieu
- **AND** les mêmes logs et la même entrée produisent la même sortie

### Requirement: Propriétaire machine et approbateur distinct

Le propriétaire de la capacité MUST être le VPS (`ownerKind: 'machine'`) et son approbateur MUST être le Node de Guillaume.

#### Scenario: Carte publiée par le VPS

- **WHEN** la carte de `production.error_summary` est publiée
- **THEN** `owner.kind` vaut `'machine'` et désigne le VPS
- **AND** `approverNodeIds` contient le Node de Guillaume

### Requirement: Config propriétaire des services

La config propriétaire MUST être un fichier local, jamais transmise. Elle MUST déclarer `services: { [name: string]: { source: { kind: 'journald', unit: string } | { kind: 'file', path: string } | { kind: 'docker', container: string } } }`.

#### Scenario: Config jamais transmise

- **WHEN** un Drop `production.error_summary` est exécuté et son résultat envoyé
- **THEN** ni la carte, ni le résultat, ni le reçu ne contiennent la config propriétaire

#### Scenario: Trois types de source

- **WHEN** la config déclare un service
- **THEN** sa `source` est de `kind` `'journald'` (avec `unit`), `'file'` (avec `path`) ou `'docker'` (avec `container`)

### Requirement: Motifs d'erreur de la config

La config propriétaire MUST déclarer `errorPatterns: { name: string, regex: string }[]` (noms définis par le propriétaire, ex. `PAYMENT_TIMEOUT`) et `errorLineRegex: string`, qui définit ce qui compte comme une ligne d'erreur (ex. `"\\b(ERROR|FATAL)\\b"`).

#### Scenario: Ligne d'erreur comptée

- **WHEN** une ligne de log de la fenêtre correspond à `errorLineRegex`
- **THEN** elle est comptée dans `errorLines`

### Requirement: Schéma d'entrée

L'entrée MUST respecter `{ service: <un des noms de config>, window: '15m' | '1h' | '6h' | '24h' }`.

#### Scenario: AC: service absent de la config rejeté avant toute lecture

- **WHEN** une entrée `production.error_summary` désigne un service absent de `services` dans la config
- **THEN** l'entrée est rejetée avant toute lecture de journal ou de fichier
- **AND** ce comportement est couvert par un test

#### Scenario: Fenêtre hors liste

- **WHEN** l'entrée porte `window: '2h'`
- **THEN** l'entrée est rejetée avec `E_SCHEMA`

### Requirement: Schéma de sortie

La sortie MUST respecter `{ service: string, window: string, status: 'ok' | 'degraded' | 'down', errorLines: number, topErrors: { name: string, count: number, share: number, firstSeen: string, lastSeen: string }[] }`, avec au plus 5 entrées dans `topErrors`.

#### Scenario: Plus de cinq types d'erreurs

- **WHEN** la fenêtre contient plus de 5 types d'erreurs distincts
- **THEN** `topErrors` contient au plus 5 entrées, les plus fréquentes

### Requirement: Noms d'erreur issus de errorPatterns uniquement

Les noms d'erreur de la sortie MUST venir uniquement de `errorPatterns`. Une erreur qui ne correspond à aucun motif MUST être comptée dans `OTHER`.

#### Scenario: Erreur sans motif correspondant

- **WHEN** une ligne d'erreur ne correspond à aucun `regex` de `errorPatterns`
- **THEN** elle est comptée sous le nom `OTHER`
- **AND** aucun nom tiré du contenu de la ligne n'apparaît dans `topErrors`

### Requirement: Aucun fragment de log en sortie

La sortie MUST NOT contenir de fragment de ligne de log, jamais : elle ne contient que les champs du schéma de sortie, calculés à partir des logs.

#### Scenario: AC: fixture avec emails, UUID et montants

- **WHEN** la capacité s'exécute sur un fichier de logs de fixture contenant des emails, des UUID et des montants
- **THEN** la sortie ne contient aucun de ces emails, UUID ou montants
- **AND** ce comportement est couvert par un test

### Requirement: Lecture des journaux sans shell

La lecture MUST passer par `execFile` avec des arguments fixes (`journalctl -u <unit> --since <...> --no-pager -o cat`, `docker logs --since …`) et MUST NOT passer par un shell.

#### Scenario: Lecture d'une source journald

- **WHEN** le service demandé a une source `kind: 'journald'`
- **THEN** la capacité appelle `execFile` sur `journalctl` avec les arguments `-u <unit> --since <...> --no-pager -o cat`
- **AND** aucun shell n'est invoqué

#### Scenario: Lecture d'une source docker

- **WHEN** le service demandé a une source `kind: 'docker'`
- **THEN** la capacité appelle `execFile` sur `docker logs --since …` sans shell

### Requirement: Source désignée par la config

L'unité journald ou le conteneur docker lus MUST venir de la config propriétaire, jamais de l'entrée du Drop.

#### Scenario: Entrée qui tente de désigner une unité

- **WHEN** une entrée contient une valeur qui ressemble à un nom d'unité ou de conteneur
- **THEN** la capacité lit seulement l'`unit` ou le `container` configuré pour le service nommé

### Requirement: Utilisateur système drop en lecture seule

Le process de la capacité MUST tourner sous un utilisateur système `drop` qui a seulement le droit de lire ces journaux.

#### Scenario: Droits du process

- **WHEN** la capacité s'exécute sur le VPS
- **THEN** son process tourne sous l'utilisateur `drop`
- **AND** cet utilisateur n'a que le droit de lire les journaux configurés

### Requirement: Calcul du statut

`status` MUST valoir `down` si aucune ligne de log n'existe sur la fenêtre et que la source existe, `degraded` si `errorLines` dépasse un seuil configurable, sinon `ok`.

#### Scenario: Source muette

- **WHEN** la source existe et ne contient aucune ligne de log sur la fenêtre
- **THEN** `status` vaut `down`

#### Scenario: Erreurs au-delà du seuil

- **WHEN** `errorLines` est supérieur au seuil configuré
- **THEN** `status` vaut `degraded`

#### Scenario: Service sain

- **WHEN** la source contient des lignes sur la fenêtre et `errorLines` ne dépasse pas le seuil
- **THEN** `status` vaut `ok`

### Requirement: Sensibilité et approbation

La carte MUST déclarer `sensitivity: 'low'` et, en v1, `approval: 'always'`.

#### Scenario: Approbation systématique en v1

- **WHEN** un Drop `production.error_summary` est reçu en v1
- **THEN** il attend l'approbation explicite de l'approbateur malgré `sensitivity: 'low'`

### Requirement: Promesses de la carte

La carte MUST déclarer `receives` : « l'état du service », « le nombre d'erreurs », « les 5 types d'erreurs les plus fréquents (noms définis par le propriétaire) », et `neverReceives` : « les lignes de log », « les identifiants clients », « les accès au serveur ».

#### Scenario: Carte de consentement

- **WHEN** la carte de consentement de `production.error_summary` est affichée
- **THEN** elle liste exactement ces phrases `receives` et `neverReceives`
