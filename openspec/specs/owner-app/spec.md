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
L’app SHALL embarquer Node et `drop.mjs`, créer une identité au premier lancement avec un relais local ou explicitement configuré, lancer le daemon et l’arrêter en quittant. Le daemon MUST aussi s’arrêter quand la coque disparaît sans quitter, y compris tuée par un signal. Le panneau et les liens d’appairage restent locaux. Le bootstrap MUST NOT sélectionner le relais public. Seule la version finale s’inscrit au démarrage de session.

#### Scenario: Premier lancement
<!-- openspec-guard:test="private bundled bootstrap > initializes a fresh private home without starting the imported MCP executable" -->
- **WHEN** l’utilisateur ouvre l’app sur une installation vierge
- **THEN** le bootstrap choisit le profil privé et une destination locale, sans connexion imposée au lab

#### Scenario: AC: pas de daemon orphelin
<!-- openspec-guard:test="daemon lifecycle (T4.18) > AC stops serving when the shell's stdin pipe closes, and only in that mode" -->
- **WHEN** la coque qui a lancé le daemon disparaît sans le quitter
- **THEN** le daemon s’arrête de lui-même et libère son port, alors qu’un `drop serve` lancé hors de l’app continue de tourner

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

### Requirement: Invitation confirmée avant appairage
Ouvert par un lien `drop://pair`, le panneau SHALL afficher qui invite et, s'il y a lieu, l'équipe, comme texte, puis attendre « Rejoindre » ou « Refuser ». Il MUST NOT envoyer de demande d'appairage avant « Rejoindre ». Le code d'invitation MUST rester hors de l'URL une fois le panneau ouvert.

#### Scenario: AC: aucun appairage sans clic
<!-- openspec-guard:test="menu bar panel and its admin routes (T4.14) > previews an invitation without pairing and pairs only after Rejoindre" -->
- **WHEN** le panneau est ouvert avec une invitation valide
- **THEN** la prévisualisation montre l'inviteur sans appairer, et l'appairage n'a lieu qu'après « Rejoindre »

### Requirement: Carte et relecture conformes dans le panneau
Le panneau SHALL afficher sur la carte de consentement la ligne de sensibilité haute quand elle s'applique, le compte à rebours « Expire dans » et faire de « Pas maintenant » le bouton par défaut au clavier. Pour une capacité sensible, son écran de relecture SHALL proposer une case par champ de premier niveau pour le retirer avant l'envoi.

#### Scenario: AC: carte et relecture du panneau
<!-- openspec-guard:test="menu bar panel and its admin routes (T4.14) > renders expiry, high sensitivity, a default Pas maintenant and per-field redaction" -->
- **WHEN** le panneau rend une carte de capacité sensible puis son écran de relecture
- **THEN** la carte montre la sensibilité haute, « Expire dans » et « Pas maintenant » par défaut, et la relecture propose une case par champ qui ajoute ce champ aux retraits envoyés

### Requirement: Répondre moi-même dans le panneau
La carte de décision SHALL offrir « Répondre moi-même », qui ouvre une zone de texte et le choix d'un fichier texte, sans masquer ce que le demandeur recevra ou ne recevra jamais. Un brouillon MUST survivre aux rafraîchissements, et un refus MUST s'afficher avec son code traduit. Un fichier qui n'est pas en UTF-8 MUST être refusé.

#### Scenario: AC: réponse relue avant envoi
<!-- openspec-guard:test="menu bar panel (T4.3) > offers to answer by hand, keeps the ledger visible and reviews the answer before sending" -->
- **WHEN** le propriétaire choisit « Répondre moi-même », écrit puis relit sa réponse
- **THEN** le registre reste visible, la relecture montre le texte et le contenu du fichier qui partiront, et seul « Envoyer » appelle `POST /ui/answer`

### Requirement: Relecture fidèle de la réponse humaine
Avant l'envoi, le panneau MUST montrer exactement ce qui partira, contenu du fichier compris, et nommer le premier destinataire réel d'après les pairs locaux quand la capacité vit sur un autre Node.

#### Scenario: AC: destinataire réel nommé
<!-- openspec-guard:test="menu bar panel (T4.3) > offers to answer by hand, keeps the ledger visible and reviews the answer before sending" -->
- **WHEN** la capacité vit sur le Node d'un autre pair
- **THEN** la relecture dit que la réponse part chez ce pair, nommé d'après les pairs locaux, pour le demandeur

### Requirement: Ce que je publie
L'onglet « Mes outils » SHALL montrer « Ce que je publie » : sujet, énoncé, source, fin de validité, public et nombre de fois servi, avec ajouter, modifier et retirer. Un fait expiré ou retiré MUST apparaître en grisé avec son état. Le texte des faits MUST être inséré comme texte.

#### Scenario: AC: liste des faits publiés
<!-- openspec-guard:test="menu bar panel (T4.4) > lists what I publish with add, edit and retire, and greys out an expired fact" -->
- **WHEN** le propriétaire ouvre « Mes outils »
- **THEN** il voit ses faits, peut en ajouter, modifier et retirer, et un fait expiré est grisé

### Requirement: Analyse des treize clients dans le panneau
« Connecter mes agents » SHALL analyser les treize clients, séparer configuration globale et projets, proposer d'ajouter ou de retirer un dossier de projet, et montrer pour un client `manual` son extrait et sa marche à suivre. Les textes « quatre agents » MUST disparaître.

#### Scenario: AC: analyse et projets dans le panneau
<!-- openspec-guard:test="menu bar panel (T4.5) > analyses thirteen clients, separates global and project configurations, and shows manual steps" -->
- **WHEN** le propriétaire analyse ce Mac
- **THEN** il voit les treize clients, une section projets avec ajout et retrait de dossier, et les étapes manuelles des clients qui en ont besoin

### Requirement: Choix du relais Internet
« Mes outils » SHALL proposer « Connexion par Internet » : désactivée (par défaut), direct seulement, mon relais ou celui de l'équipe (adresse), ou relais de test de n0 signalé comme tiers qui voit les adresses IP. L'état MUST dire si le programme est prêt et expliquer un échec.

#### Scenario: AC: choix du relais
<!-- openspec-guard:test="internet (T4.2b) > lets the owner choose no relay, their own relay or the n0 test relays, flagged as third party" -->
- **WHEN** le propriétaire choisit son relais, puis les relais de test de n0
- **THEN** la configuration garde son choix, et le panneau signale n0 comme un tiers de test qui voit les adresses IP
