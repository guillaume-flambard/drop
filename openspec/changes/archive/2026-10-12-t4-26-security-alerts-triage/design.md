# Design T4.26

## Sources lues

| Sujet | Source | Ce qui gouverne la décision |
| --- | --- | --- |
| Alertes | API GitHub `code-scanning/alerts` et `/alerts/<n>`, 12 octobre 2026 | 39 alertes ouvertes, messages et emplacements exacts |
| Fichiers temporaires | `javascript/ql/lib/semmle/javascript/security/dataflow/InsecureTemporaryFileCustomizations.qll` (github/codeql, `main`) | Puits : `open`/`openSync`/`writeFile*` sans `mode` dont les 6 bits bas sont nuls ; source : `os.tmpdir()` ; `mkdtemp` n'est pas un nettoyeur |
| Raccourcis `.cmd` | Node 24, `doc/api/child_process.md`, « Spawning .bat and .cmd files on Windows » | Un `.cmd` ne se lance pas sans `cmd.exe` ; les trois voies passent toutes par `cmd.exe` |
| Drapeaux d'ouverture | Node 24, `doc/api/fs.md`, « File open constants » | `O_NONBLOCK` existe sur macOS et Linux ; Windows n'a que `O_APPEND`, `O_CREAT`, `O_EXCL`, `O_RDONLY`, `O_RDWR`, `O_TRUNC`, `O_WRONLY` et les drapeaux `UV_FS_O_*` |
| Scorecard | `ossf/scorecard`, `docs/checks.md` | `Maintained` : rien à faire, dépôt de moins de 90 jours ; `Vulnerabilities` : un `osv-scanner.toml` à côté du manifeste ignore un identifiant avec sa raison ; `Fuzzing` et `CII-Best-Practices` décrivent des démarches, pas un défaut |
| OSV-Scanner | `google/osv-scanner`, `docs/configuration.md` | `[[IgnoredVulns]]` avec `id`, `ignoreUntil`, `reason`, dans le dossier du fichier analysé, sans propagation aux sous-dossiers |
| Avis | `api.osv.dev/v1/vulns/<id>` | GHSA-vfj7-8cjw-p6xm (`braces`), RUSTSEC-2024-0429 (`glib`), RUSTSEC-2024-0370 (`proc-macro-error`), RUSTSEC-2024-0436 (`paste`) |

Aucun exemple officiel exécutable ne couvre ces corrections : ce sont des réécritures locales. Le reproducer est le test
lui-même, lancé d'abord sur l'ancien code (voir `evidence.md`).

## Décisions

### ReDoS : lecture en une passe, mêmes résultats

Chaque expression signalée est remplacée par une lecture à la main dont le résultat est celui de l'expression, y
compris sur une entrée mal formée. Les tests de comportement passent sur l'ancien code avant la réécriture ; seuls les
tests de durée échouaient (39 s, 28 s, 5 s, 86 s et 69 s à 100 000 caractères).

Deux écarts assumés, sur des entrées qu'aucun outil n'écrit :

- Le terminateur d'un heredoc doit être le mot entier. L'expression acceptait aussi un préfixe (`EO` fermait
  `<<EOF`) par retour arrière ; un shell ne le fait jamais.
- Une barre oblique inverse suivie d'un séparateur de ligne Unicode (U+2028) dans une chaîne TOML, et une valeur qui
  commence par U+2028 après `=` ou `:`, ne se lisent plus tout à fait comme avant. Ces caractères ne figurent dans
  aucune configuration de client.

Les trois expressions `^clé:\s*(.*)$` perdent leur `\s*` : la valeur garde ses espaces de tête, que `scalar` et
`tomlValue` retiraient déjà.

### Course : ouvrir d'abord, contrôler par le descripteur

Même motif que `readConfig` de l'onboarding (T4.22) : ouverture, puis `fstat` sur le descripteur, puis lecture par ce
même descripteur. `O_NONBLOCK` là où il existe, pour qu'un tube nommé ne bloque pas l'ouverture : son type le refuse
ensuite. Windows refuse d'ouvrir un dossier (`EISDIR`) : traduit en `E_CONFIG_TYPE` pour les configurations, en 404
pour le site. La lecture d'une configuration reste bornée si le fichier grossit après le contrôle, et le site n'envoie
jamais plus que la longueur annoncée.

### Simulation : 0600 à la création et à la réécriture

Trois fonctions (`writeOwnerOnly`, `appendOwnerOnly`, `openOwnerOnly`) dans `owner-files.ts`, sur le modèle de
`writePrivate` du Node (T4.15) : mode 0600 à l'ouverture, `fchmod` pour un fichier qui existait. `campaign.ts` ne
change que ses appels d'écriture, pour ne pas croiser T4.25 qui stabilise le test de campagne. Un test vérifie
qu'aucune écriture de `campaign.ts` ne contourne ces fonctions.

### Publication : identifiant de capacité seulement

`DropHome.publish` valide l'identifiant par `CapabilityIdSchema` avant d'en faire un nom de fichier. Les appelants
existants passaient déjà des identifiants valides ; `drop share --id` était le seul chemin sans contrôle.

### Raccourci Windows : garder `cmd.exe`, proposer le rejet

`runOfficial` passe par `cmd.exe` parce que Node l'exige pour un `.cmd`. La ligne est déjà bâtie argument par argument
entre guillemets, avec `/d /s /c`, un `cmd.exe` fixe (jamais `ComSpec`) et un refus de tout argument qui pourrait
sortir des guillemets ou être développé (`"`, `%`, `!`, `^`, contrôle, barre finale). Les valeurs viennent de
l'environnement du propriétaire (son `PATH`, son dossier personnel, `process.execPath`), pas d'un pair : qui contrôle
ces valeurs exécute déjà ce qu'il veut. CodeQL ne reconnaît pas ce refus comme nettoyeur et signalera toujours ce
chemin. Lire la cible d'un raccourci npm pour la lancer sans `cmd.exe` changerait le comportement de T4.22 sans
machine Windows pour le vérifier : proposé au rejet, avec un test de plus qui garde `&`, `|`, `<`, `>` et les
parenthèses entre guillemets.

### Images : empreintes et Dependabot

Empreintes de l'index multi-plateforme relevées par `docker buildx imagetools inspect` (lecture seule) le 12 octobre
2026 : `node:24-bookworm-slim` a la même empreinte que l'image du Dockerfile racine. Les deux dossiers rejoignent
l'entrée `docker` de Dependabot, qui met à jour l'empreinte avec l'étiquette.

### Vulnérabilités connues : raison écrite dans le dépôt

Les quatre avis de l'alerte Scorecard 41 sont les deux alertes Dependabot déjà rejetées (`braces`, `glib`) et deux
crates non maintenues sans faille (`proc-macro-error`, `paste`). Un `osv-scanner.toml` par manifeste les accepte avec
leur raison et une date de revue (12 janvier 2027). Le comportement de Scorecard est celui de sa documentation ; il
n'est pas observé avant la prochaine analyse.
