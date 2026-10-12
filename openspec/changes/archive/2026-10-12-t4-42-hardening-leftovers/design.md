# Design T4.42

## Sources lues

| Sujet | Source | Ce qui gouverne la décision |
| --- | --- | --- |
| Drapeaux d'ouverture | Node 24.21.0 (version installée), `doc/api/fs.md`, « File open constants » | `O_NOFOLLOW` : « the open should fail if the path is a symbolic link » ; `O_NONBLOCK` : ouverture non bloquante quand c'est possible ; sous Windows seuls `O_APPEND`, `O_CREAT`, `O_EXCL`, `O_RDONLY`, `O_RDWR`, `O_TRUNC`, `O_WRONLY` et les `UV_FS_O_*` existent |
| Constantes présentes | `node -e` sur la version installée (macOS) | `O_NOFOLLOW` 256, `O_NONBLOCK` 4, `O_DIRECTORY` présent ; `os.availableParallelism()` = 10 sur le poste de mesure |
| Motifs à réutiliser | `capabilities/src/clients.ts` `readConfigText`, `simulation/src/owner-files.ts`, `node/src/onboarding.ts` `saveBackup` (T4.22, T4.26) | Une ouverture, contrôle par le descripteur, `O_NONBLOCK` ; 0600 à l'ouverture et `fchmod` ; dossier contrôlé par `lstat` |
| Mesures de démarrage | T4.25 (`openspec/changes/archive/2026-10-12-t4-25-simulation-signal-flake/proposal.md`) | Démarrages à froid en série = l'essentiel de l'attente avant la charge |

Aucun exemple officiel exécutable ne couvre ces corrections : ce sont des réécritures locales de motifs déjà en place.
Le reproducer est le test, lancé d'abord sur l'ancien code (voir `evidence.md`).

## Décisions

### Onboarding : un seul lecteur, option `followLinks`

Plutôt qu'ajouter `O_NONBLOCK` à une deuxième copie du lecteur, `readConfig` de l'onboarding appelle `readConfigText`
avec `{ followLinks: false }`. L'option ajoute `O_NOFOLLOW` là où il existe, traduit `ELOOP` en `E_CONFIG_SYMLINK`, et
sous Windows contrôle `lstat` après ouverture et avant toute lecture, comme le faisait T4.22. L'onboarding gagne au
passage la lecture bornée (un fichier qui grossit entre le contrôle et la lecture ne dépasse plus la borne) et la
traduction de `EISDIR` sous Windows. Les autres appelants gardent le comportement par défaut (liens suivis : un dépôt
cloné peut légitimement lier un fichier de projet).

### Fichiers du banc : ouvrir sans suivre, contrôler, puis seulement vider

`O_TRUNC` est retiré de l'ouverture : un lien physique serait vidé avant tout contrôle. `O_NONBLOCK` y est ajouté, comme
à la lecture : sans lui, un tube nommé posé sous un nom de fichier bloquait l'ouverture en écriture jusqu'à l'arrivée
d'un lecteur, et le banc, bloqué dans un appel synchrone, n'exécutait plus ses gestionnaires de SIGTERM (trouvé par la
revue adverse : 3,8 s d'attente mesurées avec un lecteur retardé). Sans lecteur, l'ouverture échoue avec `ENXIO`,
traduit en `E_SIM_FILE` ; avec un lecteur, `fstat` refuse le tube. Un fichier ordinaire ignore ce drapeau, y compris
dans les processus enfants qui héritent des journaux. Après ouverture, le
descripteur doit être un fichier ordinaire, à un seul lien, de cet utilisateur ; le nom doit désigner ce même fichier
(`lstat` : pas un lien, même `dev` et `ino` que `fstat`, en `bigint` pour ne rien arrondir). Ce dernier contrôle est
la seule protection sous Windows, qui n'a pas `O_NOFOLLOW`, et ferme ailleurs la fenêtre d'un renommage. Le refus du
second lien physique va un peu au-delà de la ligne (« lien symbolique ») : c'est la même attaque sous un autre nom,
pour le prix d'un champ de `fstat`.

### Dossiers du banc : fermés de haut en bas

`O_NOFOLLOW` ne protège que le dernier composant d'un chemin. Un dossier de nœud remplacé par un lien ferait donc
écrire `drop init`, `app.log` et la configuration plantée ailleurs. `ownerOnlyDir` crée le dossier en 0700, puis
l'ouvre avec `O_DIRECTORY | O_NOFOLLOW`, refuse un autre propriétaire et resserre à 0700 par le descripteur. Appliqué
au dossier de travail puis à chaque dossier de nœud avant tout processus : une fois un niveau fermé, personne d'autre
ne peut rien y poser. Sous Windows, où un dossier ne s'ouvre pas comme un fichier, seul `lstat` refuse un lien ou une
jonction ; l'ACL du profil fait le reste.

Écarté : refuser tout dossier de travail ouvert à d'autres. Un umask 002 (groupe privé, fréquent sous Linux) le
rendrait inutilisable ; on le resserre plutôt, comme T4.26 resserre un fichier.

### Démarrage parallèle borné

Chaque `init` et `publish` n'écrit que dans le `DROP_HOME` de son nœud et ne contacte pas le relais (`drop publish`
écrit la publication en local) : ils peuvent tourner ensemble. Le relais a besoin de tous les identifiants, il part
après. Borne : `os.availableParallelism()`, au-delà les processus attendent le processeur et la mémoire grimpe
(environ 70 Mo par processus). `inParallel` n'en lance plus après un échec et attend ceux en cours, pour que le
`finally` de la campagne arrête bien tout ; ces processus courts rejoignent la liste des enfants arrêtés sur signal.

Les attentes « nœud servi » restent en série : les `serve` tournent déjà tous en même temps, et chaque nœud garde sa
limite de 30 s, que T4.25 a calibrée.

## Risks / Trade-offs

- **Windows** : `O_NOFOLLOW` et `O_DIRECTORY` n'existent pas. Fichier : le contrôle après ouverture refuse le lien
  avant toute écriture, mais `O_CREAT` a déjà pu créer une cible absente vide derrière un lien pendant. Dossier : une
  course entre `lstat` et l'usage reste possible. Créer un lien y demande le mode développeur ou l'administrateur.
  Seule la CI `test-windows` prouve ce comportement.
- **Un dossier de travail sous un parent ouvert à tous sans sticky bit** : un autre utilisateur peut y renommer le
  dossier après son contrôle et poser un lien à sa place, que les chemins suivants traverseraient. `/tmp` et le
  dossier temporaire par défaut (`mkdtemp`) ne le permettent pas ; Node n'offre pas d'ouverture relative à un
  descripteur de dossier (`openat`) qui fermerait ce cas.
- **Entrées posées avant le resserrement** : un dossier de cet utilisateur laissé ouvert à d'autres (umask 002 d'une
  campagne ancienne) peut contenir des entrées posées avant `ownerOnlyDir`. Les écritures du banc les refusent ; les
  lectures du contrôle de fuite (`filesUnder`) et les fichiers écrits par `drop init` et `drop serve` eux-mêmes
  (`writePrivate` du Node) restent hors de cette change.
- **Plus de processus en même temps** au démarrage : au plus un par cœur, donc la mémoire de pointe du démarrage passe
  d'un processus court à `availableParallelism()` processus courts.
