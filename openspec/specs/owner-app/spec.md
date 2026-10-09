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
