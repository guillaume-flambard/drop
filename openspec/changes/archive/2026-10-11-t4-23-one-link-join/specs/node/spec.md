## MODIFIED Requirements

### Requirement: Commandes drop invite et drop pair
`drop invite` et `drop pair <code>` SHALL réaliser l'appairage tel que défini par le protocole (code d'invitation, `pair_request`, `pair_accept`, `peers.json`). `drop invite --link` SHALL afficher le lien à envoyer (T4.23) ; `drop join <code-ou-lien>` SHALL rejoindre l'équipe de l'inviteur et accepter le code comme le lien, `drop pair` restant un synonyme.

#### Scenario: Appairage par la CLI
- **WHEN** A lance `drop invite` et B lance `drop pair <code>` avec le code obtenu
- **THEN** A et B se trouvent chacun dans le `peers.json` de l'autre

#### Scenario: Nouveau venu appairé sans modifier le relais
<!-- openspec-guard:test="joining the relay by invitation (T2.1) > a node the relay does not know pairs through an invite code and is admitted, with no allowlist edit" -->
- **WHEN** B, inconnu du relais, lance `drop pair <code>` avec un code de A
- **THEN** B garde le ticket d'admission du code, se reconnecte aussitôt avec, est admis, et A et B sont appairés
- **AND** le ticket est effacé du disque de B une fois admis

### Requirement: Profil privé explicite
Le Node SHALL proposer un profil privé sans compte externe, passerelle cloud, financement distant automatique, télémétrie, activation de licence ni téléchargement au démarrage. Le relais et les destinations sont choisis localement. Le relais MAY être nommé par DNS, en `wss:` seulement ; il n'entre alors jamais dans les destinations permises au modèle ou aux serveurs MCP (D95). Un relais à adresse littérale MUST rester une origine privée listée.

#### Scenario: AC: installation et cycle sans Internet
<!-- openspec-guard:test="private system > runs two private nodes with internal MCP and model through consent failure and restart" -->
- **WHEN** deux Nodes privés utilisent leur relais et leur modèle internes, Internet bloqué
- **THEN** le consentement et la réponse fonctionnent après arrêt et relance, sans connexion externe ; la recette conserve les observations réseau.

#### Scenario: AC: relais de l'équipe par nom DNS
<!-- openspec-guard:test="private configuration > initializes without cloud accounts and rejects forbidden profile settings" -->
- **WHEN** un profil privé est créé avec `wss://drop.memolabs.dev/v1`, puis avec `ws://drop.memolabs.dev/v1`, une adresse publique littérale, des identifiants, une URL `https:` ou une requête
- **THEN** le premier est accepté avec pour seule destination le modèle local, les autres sont refusés

## ADDED Requirements

### Requirement: Lien d'invitation à envoyer
L'API locale SHALL répondre à `POST /ui/invite` par `{ code, link, validHours: 24 }`, où `link` est le lien de la page pour rejoindre avec le code dans le fragment. Les invitations du Node SHALL nommer le relais qu'il utilise au moment de l'invitation.

#### Scenario: AC: lien produit par l'app
<!-- openspec-guard:test="one-link join (T4.23) > a fresh private node adopts the relay of the link, is admitted and joins the team after Rejoindre" -->
- **WHEN** l'inviteur demande une invitation à son Node
- **THEN** il reçoit `https://drop.memolabs.dev/join#<code>`, et une fois l'invitée arrivée dans l'équipe, les invitations de celle-ci nomment le relais de l'équipe

### Requirement: Rejoindre par un lien
`POST /ui/pair/preview` SHALL vérifier une invitation, code ou lien, sans rien envoyer. `POST /ui/pair`, après « Rejoindre », SHALL refaire ces vérifications, appairer et répondre `next: 'connect_agents'`. Chaque refus MUST répondre 400 avec son code stable (`E_INVITE`, `E_INVITE_EXPIRED`, `E_INVITE_SIG`, `E_INVITE_USED`, `E_INVITE_RELAY`) sans répéter l'invitation, qui MUST NOT apparaître dans un journal. Le Node MUST refuser sa propre invitation.

#### Scenario: AC: refus à codes stables
<!-- openspec-guard:test="one-link join (T4.23) > answers each refusal with its stable code: modified, expired, own, reused, unreadable" -->
- **WHEN** l'invitée présente une invitation modifiée, expirée, la sienne, un lien d'une autre sorte, puis une invitation déjà acceptée
- **THEN** elle reçoit `E_INVITE_SIG`, `E_INVITE_EXPIRED`, `E_INVITE`, `E_INVITE` puis `E_INVITE_USED`, sans écho du code, et rien n'est envoyé

### Requirement: Relais adopté au premier « Rejoindre »
Un Node sans pair ni équipe SHALL, après « Rejoindre », passer au relais de l'invitation : `config.json` réécrit sous verrou, connexion changée sans redémarrage, puis ticket d'admission et demande d'appairage. La prévisualisation MUST ne rien changer. Un relais non admissible (protocole) ou hors de la politique d'organisation MUST être refusé (`E_INVITE_RELAY`). Un Node déjà relié SHALL garder son relais.

#### Scenario: AC: nouveau poste sur le relais de l'équipe
<!-- openspec-guard:test="one-link join (T4.23) > a fresh private node adopts the relay of the link, is admitted and joins the team after Rejoindre" -->
- **WHEN** un poste privé neuf, sur le relais de bouclage, prévisualise puis accepte le lien d'un membre admis du relais de l'équipe
- **THEN** la prévisualisation annonce `adopt` sans rien changer, puis le poste passe au relais de l'équipe, y est admis par le ticket, rejoint l'équipe, et l'origine de bouclage quitte ses destinations privées

#### Scenario: AC: relais gardé ou refusé
<!-- openspec-guard:test="one-link join (T4.23) > keeps the relay of a node that already joined someone, and refuses a relay it may not adopt (E_INVITE_RELAY)" -->
- **WHEN** l'invitation nomme `ws://` vers un nom DNS ou une adresse publique littérale, puis, le poste ayant une équipe, un autre relais admissible
- **THEN** les premières sont refusées avec `E_INVITE_RELAY` sans modifier `config.json` ni appairer, la dernière garde le relais du poste (`kept`)

### Requirement: Invitations gardées au redémarrage
Le Node SHALL garder dans `invites.json` (mode `0600`) les jetons de ses invitations encore valables, pour les honorer une seule fois après un redémarrage, et l'empreinte SHA-256 des invitations qu'il a acceptées, jamais leur jeton, pour refuser une seconde utilisation (`E_INVITE_USED`). Les deux s'effacent à l'expiration de l'invitation.

#### Scenario: AC: lien honoré après redémarrage, une fois
<!-- openspec-guard:test="one-link join (T4.23) > the inviter honours a link sent before its restart, once, and forgets it when it expires" -->
- **WHEN** l'inviteur redémarre puis reçoit deux demandes avec le même jeton, puis une demande avec un jeton expiré
- **THEN** seule la première aboutit

#### Scenario: AC: lien déjà accepté refusé après redémarrage
<!-- openspec-guard:test="one-link join (T4.23) > remembers accepted invites across a restart: a reused link stays refused (E_INVITE_USED)" -->
- **WHEN** l'invitée accepte un lien, redémarre, puis le présente de nouveau
- **THEN** il est refusé avec `E_INVITE_USED`, rien n'est envoyé, et `invites.json` ne contient pas le jeton
