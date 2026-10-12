## ADDED Requirements

### Requirement: Journal du daemon gardé
Lancé avec `DROP_LOG=file`, `drop serve` SHALL écrire son journal dans `DROP_HOME/logs/daemon.log` et MUST NOT le vider au démarrage : chaque démarrage ajoute un en-tête à la suite des lignes précédentes.

#### Scenario: AC: journal gardé au redémarrage
<!-- openspec-guard:test="daemon log (T4.37) > keeps the previous run instead of emptying the log at start" -->
- **WHEN** le daemon redémarre après un plantage
- **THEN** les lignes de l'exécution précédente sont toujours dans `daemon.log`, suivies d'un nouvel en-tête

### Requirement: Rotation du journal par taille et âge
Le journal SHALL tourner vers `daemon.log.1` à `.3` quand il atteint 2 Mio ou que son en-tête a plus de 7 jours. Les fichiers tournés de plus de 14 jours SHALL être supprimés. Le dossier `logs` MUST être en mode `0700` et ses fichiers en `0600`.

#### Scenario: AC: rotation par taille et âge
<!-- openspec-guard:test="daemon log (T4.37) > rotates by size and by age, keeps three files and deletes those older than fourteen days" -->
- **WHEN** le journal dépasse sa taille, ou que son en-tête a plus de 7 jours
- **THEN** il passe en `daemon.log.1`, au plus trois fichiers précédents restent, et un fichier tourné de plus de 14 jours disparaît

### Requirement: En-tête système du journal
Chaque démarrage et chaque nouveau fichier SHALL commencer par un en-tête : versions de l'app et du moteur, système et sa version, architecture, version de Node, pid et profil. L'en-tête MUST NOT contenir le nom de la machine ni celui de l'utilisateur.

#### Scenario: AC: en-tête système sans nom de machine
<!-- openspec-guard:test="daemon log (T4.37) > starts each file and each run with a system header, without host or user name" -->
- **WHEN** le daemon démarre ou que le journal tourne
- **THEN** la première ligne du fichier, et la première de chaque démarrage, donne versions, système, architecture, Node et profil, sans nom de machine ni d'utilisateur, dans un dossier `0700` et un fichier `0600`

### Requirement: Expurgation dans l'écriture du journal
Chaque ligne écrite par le daemon, entrée de journal ou autre écriture sur sa sortie d'erreur, MUST être expurgée avant l'écriture : valeurs connues (jeton local, variables au nom de secret), valeurs des clés et paramètres d'URL au nom de secret, `Bearer`, puis chaque mot reconnu par le scanner de secrets, remplacé par une empreinte courte. Une ligne encore reconnue MUST être remplacée en entier.

#### Scenario: AC: secret planté jamais écrit
<!-- openspec-guard:test="daemon log (T4.37) > redacts patterns, key names and known values in the writing itself" -->
- **WHEN** une ligne de journal porte le jeton local, une clé `sk-ant-…`, un jeton GitHub, un `Bearer`, un `?token=`, un champ `apiKey` ou `password`, ou la valeur d'une variable `*_API_KEY`
- **THEN** aucune de ces valeurs n'est dans le fichier, le scanner ne reconnaît aucune ligne écrite, et le code et l'événement de la ligne restent lisibles

### Requirement: Plantage journalisé
Une erreur non rattrapée du daemon SHALL être journalisée sous `E_CRASH`, par la même expurgation, avant que le processus sorte avec le code 1.

#### Scenario: AC: plantage journalisé expurgé
<!-- openspec-guard:test="daemon log (T4.37) > logs a crash and every stray stderr write through the same redaction" -->
- **WHEN** le daemon écrit sur sa sortie d'erreur hors de son journal, puis lève une erreur non rattrapée dont le message porte un secret
- **THEN** les deux arrivent dans `daemon.log` expurgés, le plantage sous `E_CRASH`, et le processus sort avec le code 1

### Requirement: Diagnostic expurgé
`GET /ui/admin/diagnostic` SHALL rendre, derrière le jeton, un texte à relire : date, versions, système, profil, états du relais, du réseau local et d'Internet, nombre de pairs, politique présente, puis les 200 dernières lignes du journal du moteur et les 50 dernières de `app.log`. Chaque ligne MUST repasser l'expurgation, le dossier personnel MUST devenir `~`, et une ligne encore reconnue par le scanner MUST être retirée et comptée.

#### Scenario: AC: aucun secret planté dans l'export
<!-- openspec-guard:test="redacted diagnostic (T4.37) > never exports a planted secret, from the daemon log, the app log or the node files" -->
- **WHEN** un secret est planté dans un ancien journal écrit sans expurgation, dans `app.log`, dans la clé privée et dans le jeton local
- **THEN** le diagnostic ne le contient pas, compte la ligne retirée, et passe le scanner de secrets

### Requirement: Exclusions du diagnostic
Le diagnostic MUST NOT contenir l'identité, une clé, le jeton local, la configuration, les pairs, l'équipe, les invitations, les reçus, les faits ni le contenu d'une demande. Un texte qui ne passe pas le scanner MUST être refusé avec `E_SECRET_DETECTED`. drop MUST NOT envoyer ce texte lui-même.

#### Scenario: AC: contenu et exclusions du diagnostic
<!-- openspec-guard:test="redacted diagnostic (T4.37) > exports versions, system and states, and leaves out keys, token, peers and request contents" -->
- **WHEN** le propriétaire prépare le diagnostic
- **THEN** il voit versions, système, états et fins des journaux, avec `~` à la place du dossier personnel, et rien de l'identité, des pairs, de l'équipe, des reçus ni des demandes

### Requirement: Ouverture du dossier des journaux
`POST /ui/admin/logs/open` SHALL ouvrir `DROP_HOME/logs` dans le gestionnaire de fichiers du système, chemin passé seul en argument, sans shell, et MUST NOT ouvrir `DROP_HOME`.

#### Scenario: AC: routes du diagnostic derrière le jeton
<!-- openspec-guard:test="redacted diagnostic (T4.37) > serves the diagnostic and opens the logs folder only with the token" -->
- **WHEN** on demande le diagnostic ou l'ouverture du dossier sans le jeton, puis avec
- **THEN** la première réponse est 401, puis le diagnostic est rendu et seul le dossier `logs` est ouvert
