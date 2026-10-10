## ADDED Requirements

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
