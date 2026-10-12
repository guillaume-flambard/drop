## ADDED Requirements

### Requirement: Région vivante unique pour les cartes
Chaque surface qui montre des cartes de consentement (panneau, « Ton espace ») SHALL annoncer leurs changements d'état dans une seule région vivante polie, présente dès le premier rendu ; aucune carte ne porte sa propre région. Après une décision prise sur la carte, le focus SHALL aller sur la carte, puisque ses boutons disparaissent.

#### Scenario: AC: focus et annonce après décision
<!-- openspec-guard:test="consent card (T4.35) > after a decision the card takes the focus and the single live region announces its state" -->
- **WHEN** le propriétaire refuse une demande de Julie dans le panneau
- **THEN** la carte prend le focus et affiche « Refusée » et « Rien n'a été envoyé à Julie. », la région vivante unique l'annonce, et la carte n'a aucune région vivante à elle

### Requirement: Bouton bloqué focalisable
Pendant qu'une décision part, les boutons de la carte MUST rester focalisables, marqués `aria-disabled`, et décrits par la raison du blocage ; les activer ne MUST rien envoyer. Une réponse illisible MUST s'afficher « Incertaine » sur la carte.

#### Scenario: AC: bouton bloqué focalisable
<!-- openspec-guard:test="consent card (T4.35) > keeps a blocked button focusable with its reason while the decision is in flight" -->
- **WHEN** le propriétaire autorise une demande et que le Node n'a pas encore répondu
- **THEN** le bouton activé garde le focus, les trois boutons sont `aria-disabled` et décrits par « Décision en cours d'envoi : attends sa confirmation. », et un second appui n'envoie rien

#### Scenario: AC: réponse illisible montrée incertaine
<!-- openspec-guard:test="consent card (T4.35) > shows an unreadable reply as uncertain on the card, never as refused" -->
- **WHEN** `/ui/decide` répond par une erreur serveur à une autorisation
- **THEN** la carte affiche « Incertaine » et « Impossible de confirmer ce qui a été envoyé à Julie. », jamais « Rien n'a été envoyé »

### Requirement: Demandes dans Ton espace
« Ton espace » SHALL offrir une page « Demandes » qui liste les demandes en attente avec la même carte que le panneau (composant partagé de `packages/desktop-ui`, logique dans son module pur), « Répondre moi-même » et les cartes de relecture. La page MUST se tenir à jour par le flux `/ui/events` du Node, sans rechargement, et la navigation SHALL compter les demandes qui attendent. Les décisions passent par les mêmes routes que le panneau.

#### Scenario: AC: décider depuis Ton espace
<!-- openspec-guard:test="workspace requests (T4.35) > lists pending requests, follows the live stream and decides through the same card as the panel" -->
- **WHEN** une demande de Julie arrive pendant que « Ton espace » est ouvert, puis que le propriétaire la refuse depuis la page « Demandes »
- **THEN** la demande apparaît par le flux sans rechargement, la navigation compte une demande, le refus part par `/ui/decide` et la carte affiche « Refusée » avec le focus, annoncée par la seule région vivante de l'espace

## MODIFIED Requirements

### Requirement: Panneau accessible
Le panneau SHALL exposer ses onglets en `tablist`, `tab` et `tabpanel`, parcourus par les flèches, Début et Fin. Il SHALL annoncer chaque résultat dans une région vivante et y déplacer le focus : la carte après une décision, le bandeau sinon ; l'état de connexion a sa propre région polie. Un échec de chargement MUST s'afficher en alerte avec « Réessayer ». Le panneau SHALL suivre le thème du système, « réduire les animations », « réduire la transparence » et « augmenter le contraste ».

#### Scenario: AC: onglets au clavier
<!-- openspec-guard:test="menu bar panel (T4.24) > uses tabs with arrow keys, Home and End, and a badge counting what waits" -->
- **WHEN** le focus est sur « Demandes » et que l'utilisateur presse Flèche droite, puis Fin, puis Début
- **THEN** l'onglet suivant, le dernier puis le premier prennent le focus et s'affichent, et le badge de « Demandes » dit combien de décisions attendent

#### Scenario: AC: résultat annoncé et focalisé
<!-- openspec-guard:test="menu bar panel (T4.24) > announces each result, moves the focus to it, and shows the connection state in its own live region" -->
- **WHEN** le propriétaire autorise une demande, puis envoie une relecture
- **THEN** la carte passe à « Autorisée une fois » et reçoit le focus, la région vivante l'annonce, puis le bandeau « Réponse envoyée. » reçoit le focus, pendant que l'état de connexion garde sa propre région

#### Scenario: AC: échec de chargement
<!-- openspec-guard:test="menu bar panel (T4.24) > shows a load failure as an alert with Réessayer, and a refusal with its translated code" -->
- **WHEN** le Node ne répond pas à la lecture d'un onglet
- **THEN** une alerte « Impossible de charger cette section » s'affiche avec « Réessayer », qui relit l'onglet

#### Scenario: AC: réglages d'affichage du système
<!-- openspec-guard:test="menu bar panel (T4.24) > honours reduced motion, reduced transparency, increased contrast and both themes in its stylesheet" -->
- **WHEN** le système demande le thème sombre, moins d'animations, moins de transparence ou plus de contraste
- **THEN** la feuille de style du panneau applique chaque réglage, et le focus garde un contour visible de 2 px en couleur d'accent
