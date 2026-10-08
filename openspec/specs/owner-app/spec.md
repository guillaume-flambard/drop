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
