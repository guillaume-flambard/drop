## ADDED Requirements

### Requirement: Journal du moteur gardé par l'app
L'app SHALL lancer le daemon avec `DROP_LOG=file` et sa propre version dans `DROP_APP_VERSION`, et MUST NOT vider `daemon.log`. Ce que le moteur écrit hors de son journal SHALL arriver dans le même fichier, après l'expurgation de la coque. Les erreurs de l'app SHALL aller dans `DROP_HOME/logs/app.log`, expurgées, avec un fichier précédent au-delà de 1 Mio.

#### Scenario: AC: journal jamais vidé par l'app
<!-- openspec-guard:test="desktop logs (T4.37) > keeps daemon.log: the shell never empties it, hands the node its log and redacts what it writes" -->
- **WHEN** l'app démarre ou relance le moteur
- **THEN** elle ouvre `logs/daemon.log` en ajout, jamais en création, passe `DROP_LOG=file` et sa version, et expurge la sortie brute du moteur et ses propres erreurs avant de les écrire

### Requirement: Chemin du journal au démarrage
En cas d'échec du démarrage, la page de démarrage SHALL afficher, comme texte, le chemin du journal du moteur, avec « Ouvrir le dossier des journaux » et « Copier le chemin ».

#### Scenario: AC: chemin donné par la page de démarrage
<!-- openspec-guard:test="desktop logs (T4.37) > gives the log path on the start page, as text, with the folder to open" -->
- **WHEN** le démarrage échoue avec un code
- **THEN** la page affiche le code, le chemin du journal comme texte, et propose d'ouvrir le dossier des journaux et de copier le chemin

### Requirement: Diagnostic dans mon espace
Mon espace SHALL avoir une page « Diagnostic » : versions de l'app et du moteur, chemin du dossier des journaux avec « Ouvrir le dossier » et « Copier le chemin », et « Préparer le diagnostic », qui affiche le texte expurgé entier en lecture seule. « Copier le diagnostic » MUST n'apparaître qu'une fois ce texte affiché, et MUST copier exactement ce texte. L'app MUST NOT l'envoyer elle-même.

#### Scenario: AC: version et dossier des journaux
<!-- openspec-guard:test="workspace diagnostic (T4.37) > shows the versions and the logs path, opens the folder and copies the path" -->
- **WHEN** le propriétaire ouvre « Diagnostic »
- **THEN** il voit les versions et le chemin du dossier des journaux, « Ouvrir le dossier » appelle le Node, et « Copier le chemin » copie ce chemin

#### Scenario: AC: diagnostic relu avant copie
<!-- openspec-guard:test="workspace diagnostic (T4.37) > shows the redacted diagnostic for review before offering to copy it" -->
- **WHEN** le propriétaire prépare le diagnostic
- **THEN** le texte s'affiche en entier, avec le nombre de lignes retirées, et seulement alors « Copier le diagnostic » copie ce même texte

### Requirement: Code d'erreur affiché dans l'espace
Quand une action ou un chargement échoue avec un code stable, Mon espace SHALL afficher une phrase, puis des « Détails techniques » repliables avec le code, le statut HTTP et la route, et « Copier les détails ». Le message reçu MUST être inséré comme texte.

#### Scenario: AC: code reçu affiché
<!-- openspec-guard:test="workspace diagnostic (T4.37) > shows the code it receives with a sentence and copyable technical details" -->
- **WHEN** le Node refuse une action avec `{ error: 'E_…', message }`
- **THEN** l'espace affiche la phrase, et les détails repliés donnent le code, le statut et la route, copiables
