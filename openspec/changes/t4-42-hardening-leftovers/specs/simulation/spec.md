## MODIFIED Requirements

### Requirement: Fichiers de campagne réservés au propriétaire
Le banc SHALL créer chacun de ses fichiers (plan, événements, configuration et journal du relais, journaux des nœuds, journaux et configurations plantés, rapports) en mode 0600, et resserrer à 0600 un fichier qu'une campagne précédente aurait laissé plus large dans un `--work-dir` réutilisé. Aucune écriture de `campaign.ts` MUST NOT contourner ces fonctions. Une écriture MUST NOT suivre un lien : un nom de fichier de campagne qui est un lien symbolique, un second lien physique, un dossier ou le fichier d'un autre utilisateur MUST être refusé avec `E_SIM_FILE` avant d'être tronqué, resserré ou écrit. Chaque dossier où le banc écrit (dossier de travail, dossier de chaque nœud et son `user-home`) SHALL être un vrai dossier de la personne qui lance le banc, fermé aux autres (0700) avant toute écriture ; un lien ou le dossier d'un autre utilisateur MUST être refusé avec `E_SIM_WORK_DIR` avant le lancement de tout processus.

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
- **WHEN** un rapport est un lien symbolique vers un fichier hors du dossier, un journal d'événements est un second lien physique vers ce fichier, et un plan est un dossier
- **THEN** chaque écriture, ajout ou ouverture est refusé avec `E_SIM_FILE`, le fichier visé garde son contenu et son mode, et un fichier ordinaire s'écrit toujours

#### Scenario: AC: dossier partagé fermé, lien de dossier refusé
<!-- openspec-guard:test="campaign writes never follow a planted link (T4.42) > keeps every bench directory a real directory of its owner, closed to others, and refuses a planted link" -->
- **WHEN** le banc prépare un dossier neuf, un dossier laissé en 0777, un dossier de nœud qui est un lien vers un autre dossier, et un dossier qui appartient à un autre utilisateur
- **THEN** les deux premiers sont en 0700, le lien est refusé avec `E_SIM_WORK_DIR` sans rien créer dans sa cible, et le dossier d'un autre utilisateur est refusé avec `E_SIM_WORK_DIR` (macOS et Linux pour les modes et le propriétaire)

#### Scenario: AC: campagne refusée sur un dossier de travail piégé
<!-- openspec-guard:test="simulation campaign work directory (T4.42) > refuses a reused work directory where a node directory is a planted link, before starting any process" -->
- **WHEN** une campagne est lancée dans un `--work-dir` réutilisé dont `node-0` est un lien vers un autre dossier
- **THEN** elle échoue avec `E_SIM_WORK_DIR` avant de lancer un processus, et rien n'est écrit dans le dossier visé

## ADDED Requirements

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
