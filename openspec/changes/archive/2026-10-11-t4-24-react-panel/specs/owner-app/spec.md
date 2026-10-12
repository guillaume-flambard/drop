## MODIFIED Requirements

### Requirement: Panneau servi par le Node
Le Node SHALL servir le panneau sur `/app`, seulement avec son jeton : l'interface React compilée hors ligne et intégrée à `drop.mjs`, sous une politique de contenu `default-src 'none'` dont le seul script autorisé est celui de la page, par son empreinte SHA-256 (`script-src 'sha256-…'`), avec `connect-src 'self'` et ni image, ni police, ni formulaire. Aucune ressource externe n'est chargée. Le panneau MUST insérer tout texte venu d'un pair comme texte, jamais comme HTML.

#### Scenario: Jeton exigé
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > serves the panel only with the token, under a CSP that allows nothing but this node" -->
- **WHEN** on demande `/app` sans le jeton, puis avec
- **THEN** la première réponse est 401, la seconde sert le panneau sous cette politique, dont l'empreinte est celle du script servi

#### Scenario: Texte des pairs inerte
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > inserts what peers wrote as text only" -->
- **WHEN** une carte de consentement porte du HTML dans son titre, sa question ou le nom du demandeur
- **THEN** le panneau l'affiche comme du texte

## ADDED Requirements

### Requirement: Panneau accessible
Le panneau SHALL exposer ses onglets en `tablist`, `tab` et `tabpanel`, que les flèches, Début et Fin parcourent. Il SHALL annoncer chaque résultat d'action dans une région vivante et y déplacer le focus, et annoncer l'état de connexion dans sa propre région polie. Un échec de chargement MUST s'afficher en alerte avec « Réessayer ». Le panneau SHALL suivre les réglages du système : thème clair ou sombre, « réduire les animations », « réduire la transparence » et « augmenter le contraste ».

#### Scenario: AC: onglets au clavier
<!-- openspec-guard:test="menu bar panel (T4.24) > uses tabs with arrow keys, Home and End, and a badge counting what waits" -->
- **WHEN** le focus est sur « Demandes » et que l'utilisateur presse Flèche droite, puis Fin, puis Début
- **THEN** l'onglet suivant, le dernier puis le premier prennent le focus et s'affichent, et le badge de « Demandes » dit combien de décisions attendent

#### Scenario: AC: résultat annoncé et focalisé
<!-- openspec-guard:test="menu bar panel (T4.24) > announces each result, moves the focus to it, and shows the connection state in its own live region" -->
- **WHEN** le propriétaire autorise une demande
- **THEN** le bandeau « Demande autorisée une fois. » reçoit le focus et la région vivante l'annonce, pendant que l'état de connexion garde sa propre région

#### Scenario: AC: échec de chargement
<!-- openspec-guard:test="menu bar panel (T4.24) > shows a load failure as an alert with Réessayer, and a refusal with its translated code" -->
- **WHEN** le Node ne répond pas à la lecture d'un onglet
- **THEN** une alerte « Impossible de charger cette section » s'affiche avec « Réessayer », qui relit l'onglet

#### Scenario: AC: réglages d'affichage du système
<!-- openspec-guard:test="menu bar panel (T4.24) > honours reduced motion, reduced transparency, increased contrast and both themes in its stylesheet" -->
- **WHEN** le système demande le thème sombre, moins d'animations, moins de transparence ou plus de contraste
- **THEN** la feuille de style du panneau applique chaque réglage, et le focus garde un contour visible de 2 px en couleur d'accent
