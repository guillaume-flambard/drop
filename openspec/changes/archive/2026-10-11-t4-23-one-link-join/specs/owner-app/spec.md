## MODIFIED Requirements

### Requirement: App de la barre de menus
L’app SHALL embarquer Node et `drop.mjs`, créer une identité au premier lancement avec un relais local ou explicitement configuré, lancer le daemon et l’arrêter en quittant, y compris quand la coque est tuée. Le panneau et les liens d’appairage restent locaux. Le bootstrap MUST NOT sélectionner de lui-même le relais public : seul le Node, au clic sur « Rejoindre », adopte le relais d’une invitation (D89). Seule la version finale s’inscrit au démarrage de session.

#### Scenario: Premier lancement
<!-- openspec-guard:test="private bundled bootstrap > initializes a fresh private home without starting the imported MCP executable" -->
- **WHEN** l’utilisateur ouvre l’app sur une installation vierge
- **THEN** le bootstrap choisit le profil privé et une destination locale, sans connexion imposée au lab

#### Scenario: AC: pas de daemon orphelin
<!-- openspec-guard:test="daemon lifecycle (T4.18) > AC stops serving when the shell's stdin pipe closes, and only in that mode" -->
- **WHEN** la coque qui a lancé le daemon disparaît sans le quitter
- **THEN** le daemon s’arrête de lui-même et libère son port, alors qu’un `drop serve` lancé hors de l’app continue de tourner

### Requirement: Invitation confirmée avant appairage
Ouvert par un lien `drop://pair` ou `drop://join` (T4.23), même avant que le Node réponde, le panneau SHALL afficher qui invite et l'équipe, comme texte, puis attendre « Rejoindre » ou « Refuser ». Il MUST NOT envoyer de demande d'appairage avant « Rejoindre ». Le code MUST rester hors de l'URL une fois le panneau ouvert. Mon espace SHALL accepter le code ou le lien collé, avec le même aperçu.

#### Scenario: AC: aucun appairage sans clic
<!-- openspec-guard:test="menu bar panel and its admin routes (T4.14) > previews an invitation without pairing and pairs only after Rejoindre" -->
- **WHEN** le panneau est ouvert avec une invitation valide
- **THEN** la prévisualisation montre l'inviteur sans appairer, et l'appairage n'a lieu qu'après « Rejoindre »

#### Scenario: AC: lien drop://join
<!-- openspec-guard:test="desktop join link (T4.23) > opens drop://join like drop://pair: the confirmation card, queued until the node answers" -->
- **WHEN** la page pour rejoindre ouvre `drop://join?invite=<code>`, avant ou après le démarrage du Node
- **THEN** l'app passe le seul code base64url au panneau, comme pour `drop://pair`, et ignore un lien trop long, sans code ou d'une autre sorte
