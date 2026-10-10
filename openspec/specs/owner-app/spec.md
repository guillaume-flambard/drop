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
L’app SHALL embarquer Node et `drop.mjs`, créer une identité au premier lancement avec un relais local ou explicitement configuré, lancer le daemon et l’arrêter en quittant. Le panneau et les liens d’appairage restent locaux. Le bootstrap MUST NOT sélectionner le relais public. Seule la version finale s’inscrit au démarrage de session.

#### Scenario: Premier lancement
<!-- openspec-guard:test="private bundled bootstrap > initializes a fresh private home without starting the imported MCP executable" -->
- **WHEN** l’utilisateur ouvre l’app sur une installation vierge
- **THEN** le bootstrap choisit le profil privé et une destination locale, sans connexion imposée au lab

### Requirement: Deux confirmations de raccordement
Le panneau SHALL d'abord montrer l'analyse locale expurgée des adaptateurs connus et laisser choisir ceux à raccorder. Une seconde action explicite SHALL appliquer cette sélection et afficher un résultat par agent. Il MUST distinguer configuration modifiée, relance de l'agent nécessaire et équipe joignable. Sans agent compatible, ou pour un agent non pris en charge, il SHALL montrer une voie de configuration manuelle sans demander de permission générale.

#### Scenario: AC-CONNECT-07 — états de relance et d'équipe distincts
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-07 reports agent restart independently of team connectivity" -->
- **WHEN** la configuration est raccordée mais l'agent doit redémarrer ou l'équipe est hors ligne
- **THEN** le panneau affiche ces états distincts sans annoncer que le parcours entier est terminé

#### Scenario: AC-CONNECT-08 — état vide et voie manuelle
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-08 offers a manual stdio entry without broad permissions" -->
- **WHEN** aucun des quatre adaptateurs n'est détecté, ou que l'agent de l'utilisateur n'est pas pris en charge
- **THEN** le panneau propose la configuration manuelle et n'élargit aucune permission

### Requirement: Mises à jour signées
Une app construite avec la clé de mise à jour SHALL chercher une version au lancement puis toutes les 6 h sur `https://drop.memolabs.dev/updates/latest.json` et la proposer dans le menu ; rien ne s'installe sans ce clic (D70). L'archive MUST être signée par cette clé pour la version annoncée (`requireSignedVersion`), sinon refusée. Sans la clé, l'app ne cherche aucune mise à jour (D76). La construction MUST refuser un manifeste signé pour une autre version.

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
