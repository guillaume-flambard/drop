# owner-app Specification

## Purpose
L'app Mac rend drop installable par quelqu'un qui n'a jamais ouvert un terminal (T2.4, D26, D30) : une icône dans la
barre de menus, le Node qui tourne en arrière-plan, et un panneau pour décider, voir l'équipe et partager ses outils.
L'app ne porte aucune logique propre : le panneau est servi par le Node local et passe par son API protégée par jeton.

## Requirements

### Requirement: Panneau servi par le Node
Le Node SHALL servir le panneau sur `/app`, seulement avec son jeton, sous la politique de contenu
`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'`. Le panneau MUST
insérer tout texte venu d'un pair comme texte, jamais comme HTML.

#### Scenario: Jeton exigé
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > serves the panel only with the token, under a CSP that allows nothing but this node" -->
- **WHEN** on demande `/app` sans le jeton, puis avec
- **THEN** la première réponse est 401, la seconde sert le panneau avec cette politique de contenu

#### Scenario: Texte des pairs inerte
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > inserts what peers wrote as text only" -->
- **WHEN** une carte de consentement porte du HTML dans son titre, sa question ou le nom du demandeur
- **THEN** le panneau l'affiche comme du texte

### Requirement: Actions du propriétaire
L'API locale SHALL exposer au panneau, derrière le même jeton : l'état (nom, connexion au relais), les outils détectés
et ceux déjà partagés, partager ou retirer un outil, installer ou retirer drop d'un agent, créer l'équipe, et la liste
des questions envoyées par ce Node.

#### Scenario: Partage et installation depuis le panneau
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > serves the panel only with the token, under a CSP that allows nothing but this node" -->
- **WHEN** le panneau partage `claude_code/figma`, le retire, retire drop de Cursor et crée l'équipe Atlas
- **THEN** chaque action atteint le Node dans cet ordre ; une demande de partage incomplète est refusée (400), une demande sans jeton aussi (401)

### Requirement: App de la barre de menus
L'app SHALL embarquer Node et `drop.mjs` (D29), créer au premier lancement une identité au nom de l'utilisateur du Mac
sur le relais public, lancer `drop serve` et l'arrêter en quittant, afficher le panneau sous son icône, et ouvrir les
liens `drop://pair?code=…` dans le panneau, qui accepte l'invitation. Seule la version finale s'inscrit au démarrage de
la session.

#### Scenario: Premier lancement
<!-- openspec-guard:non-testable reason="App native : vérifiée à la main le 2026-10-08 (drop.app de debug, daemon embarqué connecté au relais public)" -->
- **WHEN** l'utilisateur ouvre drop.app
- **THEN** le Node démarre avec le Node embarqué, se connecte au relais, et le panneau s'affiche au clic sur l'icône

### Requirement: Mises à jour signées
Une app construite avec la clé de mise à jour de drop SHALL chercher une nouvelle version au lancement puis toutes les
6 h sur `https://drop.memolabs.dev/updates/latest.json`, et la proposer dans le menu de son icône (« Mettre à jour vers
x.y.z ») ; rien ne se télécharge ni ne s'installe sans ce clic (D35). L'archive MUST être signée par cette clé et sa
signature MUST porter la version annoncée (`requireSignedVersion` du plugin updater de Tauri), sinon l'app la refuse.
Une app construite sans la clé ne cherche pas de mise à jour. Le manifeste publié MUST être refusé à la construction si
la signature porte une autre version que celle de l'app.

#### Scenario: Manifeste publié
<!-- openspec-guard:test="signed updates of the Mac app (T2.4) > announces the build for darwin-aarch64 with its signature and a versioned URL under /updates" -->
- **WHEN** la version x.y.z est construite avec `--updates`
- **THEN** `latest.json` annonce x.y.z pour `darwin-aarch64`, avec la signature de l'archive et son URL sous `/updates/`

#### Scenario: Signature d'une autre version
<!-- openspec-guard:test="signed updates of the Mac app (T2.4) > refuses a signature made for another version, or carrying none" -->
- **WHEN** la signature de l'archive porte une autre version, ou aucune
- **THEN** la construction du manifeste échoue avec `E_UPDATE_SIGNATURE`

#### Scenario: Clé publique et HTTPS
<!-- openspec-guard:test="signed updates of the Mac app (T2.4) > turns the updater on only with a public key, over HTTPS, and requires the version in the signature" -->
- **WHEN** l'app est construite avec `--updates`
- **THEN** sa configuration porte la clé publique, l'adresse HTTPS de `latest.json` et `requireSignedVersion`, et une clé vide ou un chemin de fichier est refusé avec `E_UPDATER_KEY`

#### Scenario: Mise à jour proposée, pas imposée
<!-- openspec-guard:non-testable reason="App native : à vérifier à la main à la première version publiée sur drop.memolabs.dev/updates" -->
- **WHEN** une version plus récente est publiée
- **THEN** le menu de l'icône affiche « Mettre à jour vers x.y.z », et seul un clic télécharge, vérifie la signature, installe et relance l'app avec son Node

### Requirement: Connexion proposée dans le panneau
Quand le partage d'un outil échoue avec `E_SHARE_OAUTH`, le panneau SHALL proposer « Se connecter à <serveur> », qui
démarre la connexion de drop (T2.17). Le lien de secours vers la page de connexion MUST n'être affiché que s'il est en
https.

#### Scenario: Outil qui demande une connexion
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > offers to sign in when a shared server needs OAuth, and links only an https sign-in page (T2.17)" -->
- **WHEN** Natha partage Notion avant d'y avoir connecté drop
- **THEN** le panneau propose « Se connecter à notion », et n'affiche la page de connexion qu'en https
