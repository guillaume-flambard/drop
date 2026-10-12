## ADDED Requirements

### Requirement: Fichier de release contrôlé par le descripteur envoyé
Le site public SHALL ouvrir un fichier de release avant de le contrôler, puis lire son type et sa taille par ce descripteur et n'envoyer que la longueur annoncée. Un dossier ou un tube nommé portant un nom de release MUST répondre 404 sans attendre.

#### Scenario: AC: dossier et tube refusés sans attente
<!-- openspec-guard:test="documentation site > checks a release through the handle it sends, answers 404 for a directory or a pipe and never waits on one (T4.26)" -->
- **WHEN** le dossier des releases contient `latest.json`, un `drop.dmg` vide, un dossier et un tube nommé aux noms de releases
- **THEN** `latest.json` est servi avec sa longueur en GET et en HEAD, le fichier vide avec une longueur 0, le dossier, le tube et une release absente répondent 404
