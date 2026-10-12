# simulation Specification

## Purpose
Banc local qui fait vivre drop dans une entreprise fictive avant tout essai réel (D56) : relais dédié en bouclage, vrais nœuds en profil privé, charge et décisions reproductibles par graine, mesures de mémoire et de latence, contrôle de fuite et rapport. Il ne touche jamais `~/.drop`, le VPS ni le relais de production.

## Requirements

### Requirement: Banc isolé de la production

Le banc SHALL tout créer dans un dossier de campagne temporaire et démarrer son propre relais sur une adresse de bouclage. Les nœuds simulés MUST ne jamais notifier la personne qui lance le banc. Il MUST refuser une URL de relais qui n'est pas une adresse de bouclage, ne jamais lire ni écrire `~/.drop`, et arrêter tous les processus qu'il a lancés à la fin, y compris après une erreur.

#### Scenario: AC: refus d'un relais hors bouclage

<!-- openspec-guard:test="simulation plan (T4.1) > AC refuses a relay outside loopback" -->

- **WHEN** la campagne est lancée avec un relais `wss://drop.memolabs.dev/v1`
- **THEN** elle s'arrête avant de lancer un processus, avec le code `E_SIM_RELAY`

#### Scenario: AC: aucun processus orphelin

<!-- openspec-guard:test="simulation bench signals (T4.1) > AC stops every process it started when the bench receives SIGTERM mid-campaign" -->

- **WHEN** une campagne s'arrête, normalement, sur erreur ou sur SIGINT ou SIGTERM
- **THEN** tous les processus de relais et de nœuds qu'elle a lancés sont terminés

### Requirement: Charge et décisions déterministes

Pour une graine donnée, le banc SHALL produire la même séquence de demandes (demandeur, propriétaire, entrée) et les mêmes décisions des propriétaires. La politique de décision MUST être réglable (parts d'autorisation, de refus et de report) et appliquée par l'API locale du propriétaire, jamais par contournement du consentement.

#### Scenario: AC: même graine, même plan

<!-- openspec-guard:test="simulation plan (T4.1) > AC same seed same plan, different seed different plan" -->

- **WHEN** deux plans de campagne sont générés avec la même graine et les mêmes paramètres
- **THEN** ils sont identiques, et une graine différente donne un plan différent

#### Scenario: AC: politique de décision respectée

<!-- openspec-guard:test="simulation plan (T4.1) > AC decision policy is followed within 3 points" -->

- **WHEN** la politique est 80 % d'autorisations, 10 % de refus et 10 % de reports sur un plan de 1 000 demandes
- **THEN** chaque décision du plan suit la politique et la répartition obtenue correspond aux parts demandées à 3 points près

### Requirement: Mesures et rapport

Le banc SHALL échantillonner la mémoire résidente de chaque processus, mesurer la latence de bout en bout de chaque demande autorisée, compter les issues par code et vérifier qu'aucun fragment sensible du journal factice n'atteint un demandeur. Il MUST écrire un événement par étape dans `events.jsonl` et un rapport `report.json` et `report.md` avec médiane, 95e centile et maximum.

#### Scenario: AC: statistiques du rapport

<!-- openspec-guard:test="simulation report (T4.1) > AC report statistics are exact" -->

- **WHEN** le rapport est calculé sur un jeu de latences et d'échantillons mémoire connu
- **THEN** la médiane, le 95e centile, le maximum et les totaux par issue sont exacts

#### Scenario: AC: campagne réelle de bout en bout

<!-- openspec-guard:test="simulation campaign (T4.1) > AC real end-to-end campaign: allowed requests deliver, refusals stay refused, no leak, no orphan" -->

- **WHEN** une campagne de 3 nœuds tourne avec une politique qui autorise, refuse et reporte
- **THEN** chaque demande autorisée reçoit son résultat, chaque refus est vu comme refusé, aucune fuite n'est détectée, et `events.jsonl` comme le rapport sont écrits

### Requirement: Fichiers de campagne réservés au propriétaire
Le banc SHALL créer chacun de ses fichiers (plan, événements, configuration et journal du relais, journaux des nœuds, journaux et configurations plantés, rapports) en mode 0600, et resserrer à 0600 un fichier qu'une campagne précédente aurait laissé plus large dans un `--work-dir` réutilisé. Aucune écriture de `campaign.ts` MUST NOT contourner ces fonctions. Une écriture MUST NOT suivre un lien : un nom de fichier de campagne qui est un lien symbolique, un second lien physique, un dossier, un tube nommé ou le fichier d'un autre utilisateur MUST être refusé avec `E_SIM_FILE`, sans attendre, avant d'être tronqué, resserré ou écrit. Chaque dossier où le banc écrit (dossier de travail, `HOME` du relais, dossier de chaque nœud et son `user-home`) SHALL être un vrai dossier de la personne qui lance le banc, fermé aux autres (0700) avant toute écriture ; un lien ou le dossier d'un autre utilisateur MUST être refusé avec `E_SIM_WORK_DIR` avant le lancement de tout processus.

#### Scenario: AC: fichiers 0600 même réutilisés
<!-- openspec-guard:test="campaign files readable by their owner only (T4.26) > creates campaign files 0600 and narrows a file left wider by an earlier run" -->
- **WHEN** le banc écrit un fichier neuf, réécrit un rapport laissé en 0644, complète un journal d'événements laissé en 0666 et ouvre le journal du relais
- **THEN** chacun est en 0600 et garde le contenu attendu (macOS et Linux ; Windows ne garde que le bit lecture seule)

#### Scenario: AC: aucune écriture hors des fonctions réservées
<!-- openspec-guard:test="campaign files readable by their owner only (T4.26) > leaves no file write in the campaign that bypasses the owner-only helpers" -->
- **WHEN** on lit `campaign.ts`
- **THEN** il n'appelle ni `writeFileSync`, ni `appendFileSync`, ni `openSync`, ni `createWriteStream`, ni `mkdirSync`

#### Scenario: AC: lien planté à la place d'un fichier non suivi
<!-- openspec-guard:test="campaign writes never follow a planted link (T4.42) > refuses to write through a link or a second hard link planted in place of a campaign file, and leaves its target untouched" -->
- **WHEN** un rapport est un lien symbolique vers un fichier hors du dossier, un journal d'événements est un second lien physique vers ce fichier, un plan est un dossier et un journal du relais est un tube nommé sans lecteur
- **THEN** chaque écriture, ajout ou ouverture est refusé avec `E_SIM_FILE`, le tube en moins d'une seconde, le fichier visé garde son contenu et son mode, et un fichier ordinaire s'écrit toujours

#### Scenario: AC: dossier partagé fermé, lien de dossier refusé
<!-- openspec-guard:test="campaign writes never follow a planted link (T4.42) > keeps every bench directory a real directory of its owner, closed to others, and refuses a planted link" -->
- **WHEN** le banc prépare un dossier neuf, un dossier laissé en 0777, un dossier de nœud qui est un lien vers un autre dossier, un lien pendant, et un dossier qui appartient à un autre utilisateur
- **THEN** les deux premiers sont en 0700, les deux liens sont refusés avec `E_SIM_WORK_DIR` sans rien créer dans leur cible, et le dossier d'un autre utilisateur est refusé avec `E_SIM_WORK_DIR` (macOS et Linux pour les modes et le propriétaire)

#### Scenario: AC: campagne refusée sur un dossier de travail piégé
<!-- openspec-guard:test="simulation campaign work directory (T4.42) > refuses a reused work directory where a node directory is a planted link, before starting any process" -->
- **WHEN** une campagne est lancée dans un `--work-dir` réutilisé dont `node-0` est un lien vers un autre dossier
- **THEN** elle échoue avec `E_SIM_WORK_DIR` avant de lancer un processus, et rien n'est écrit dans le dossier visé

### Requirement: Démarrage parallèle borné
Le banc SHALL lancer l'`init` de chaque nœud et la publication de chaque propriétaire en parallèle, au plus un processus par cœur (`os.availableParallelism()`), avant de lancer le relais et les nœuds. Après un échec, il MUST ne plus en lancer de nouveau et attendre ceux en cours avant de s'arrêter ; ces processus courts MUST être arrêtés comme les autres sur SIGINT ou SIGTERM.

#### Scenario: AC: au plus la borne à la fois, dans l'ordre
<!-- openspec-guard:test="bench start in parallel (T4.42) > runs at most the limit at once and keeps results in input order" -->
- **WHEN** sept tâches de durées différentes passent avec une borne de 3
- **THEN** jamais plus de 3 ne tournent à la fois, et les résultats gardent l'ordre des nœuds

#### Scenario: AC: rien de nouveau après un échec
<!-- openspec-guard:test="bench start in parallel (T4.42) > starts nothing new after a failure and settles the tasks in flight before rejecting" -->
- **WHEN** une tâche échoue pendant qu'une autre tourne encore, avec quatre tâches en attente
- **THEN** aucune tâche en attente ne démarre, celle en cours finit, puis l'erreur est rendue
