## ADDED Requirements

### Requirement: Page pour rejoindre
Le site SHALL servir `/join`, seule page à script : un script en ligne épinglé par son empreinte dans la CSP, `connect-src 'none'`, aucune ressource d'un autre site. Il SHALL lire l'invitation dans le fragment, afficher qui invite comme texte, proposer d'abord le téléchargement du système détecté, un bouton vers `drop://join?invite=<code>` et le code à copier, ou expliquer un lien inutilisable. Il MUST NOT transmettre l'invitation. Les autres pages gardent `script-src 'none'`.

#### Scenario: AC: politique de la page
<!-- openspec-guard:test="join page (T4.23) > serves /join under a policy that pins its one script and allows no connection, other pages keep none" -->
- **WHEN** on demande `/join` et ses variantes
- **THEN** la CSP épingle l'empreinte du seul script, interdit toute connexion et tout formulaire, la page ne charge rien d'ailleurs, et « Démarrer » garde `script-src 'none'`

#### Scenario: AC: rien ne sort de la page
<!-- openspec-guard:test="join page (T4.23) > never sends the invite anywhere and writes names as text only" -->
- **WHEN** on lit le script de la page
- **THEN** il n'appelle ni `fetch`, ni `XMLHttpRequest`, ni `WebSocket`, ni `sendBeacon`, n'écrit pas de HTML et n'ouvre aucune autre adresse

#### Scenario: AC: invitation affichée et bouton
<!-- openspec-guard:test="join page (T4.23) > shows who invites, offers the matching download, opens drop://join and drops the fragment" -->
- **WHEN** un PC Windows ouvre le lien d'une invitation de Guillaume pour l'équipe Atelier
- **THEN** la page affiche « Guillaume t'invite dans l'équipe Atelier », propose Windows en premier, pointe le bouton vers `drop://join?invite=<code>`, retire le fragment de l'adresse et retrouve l'invitation après rechargement

#### Scenario: AC: lien inutilisable expliqué
<!-- openspec-guard:test="join page (T4.23) > explains an incomplete, unreadable or expired link instead of a join button" -->
- **WHEN** le lien n'a pas de fragment, un fragment trop court, illisible ou une invitation expirée
- **THEN** la page l'explique, masque les étapes et le bouton ne mène nulle part ; un nom piégé est affiché nettoyé, comme texte
