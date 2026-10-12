## MODIFIED Requirements

### Requirement: Profil privé explicite
Le Node SHALL proposer un profil privé sans compte externe, passerelle cloud, financement distant automatique, télémétrie, activation de licence ni téléchargement au démarrage. Le relais et les destinations sont choisis localement. Le relais MAY être nommé par DNS, en `wss:` seulement ; il n'entre alors jamais dans les destinations permises au modèle ou aux serveurs MCP (D95). Un relais littéral MUST être une origine listée, sauf s'il est adopté (T4.33).

#### Scenario: AC: installation et cycle sans Internet
<!-- openspec-guard:test="private system > runs two private nodes with internal MCP and model through consent failure and restart" -->
- **WHEN** deux Nodes privés utilisent leur relais et leur modèle internes, Internet bloqué
- **THEN** le consentement et la réponse fonctionnent après arrêt et relance, sans connexion externe ; la recette conserve les observations réseau.

#### Scenario: AC: relais de l'équipe par nom DNS
<!-- openspec-guard:test="private configuration > initializes without cloud accounts and rejects forbidden profile settings" -->
- **WHEN** un profil privé est créé avec `wss://drop.memolabs.dev/v1`, puis avec `ws://drop.memolabs.dev/v1`, une adresse publique littérale, des identifiants, une URL `https:` ou une requête
- **THEN** le premier est accepté avec pour seule destination le modèle local, les autres sont refusés

### Requirement: Relais adopté au premier « Rejoindre »
Un Node sur le relais de bouclage par défaut (`DEFAULT_RELAY_URL`, `ws://127.0.0.1:7780/v1`), sans pair, équipe ni appairage en cours SHALL, après « Rejoindre », passer au relais de l'invitation : `config.json` réécrit sous verrou, connexion changée sans redémarrage, puis admission et appairage. La prévisualisation MUST ne rien changer. Un relais non admissible ou hors politique MUST être refusé (`E_INVITE_RELAY`). Un Node déjà relié ou réglé à la main SHALL garder son relais (`kept`).

#### Scenario: AC: deux « Rejoindre » rapides et appairage en cours
<!-- openspec-guard:test="one-link join (T4.23) > accepts a link once even on two quick « Rejoindre », and moves no relay while a pairing is pending" -->
- **WHEN** l'invitée appuie deux fois sur « Rejoindre » avec le même lien, puis accepte un second lien avant la réponse du premier inviteur
- **THEN** le second appui est refusé avec `E_INVITE_USED` et une seule demande d'appairage part, et le second lien garde le relais déjà adopté (`kept`)

#### Scenario: AC: carte qui annonce le relais
<!-- openspec-guard:test="menu bar panel and its admin routes (T4.14) > previews an invitation without pairing and pairs only after Rejoindre" -->
- **WHEN** le panneau montre la carte d'une invitation qui ferait changer de relais, ou qu'un lien est refusé
- **THEN** la carte nomme le relais de l'invitation avant « Rejoindre », et le refus affiche le message de son code stable

#### Scenario: AC: nouveau poste sur le relais de l'équipe
<!-- openspec-guard:test="one-link join (T4.23) > a fresh private node adopts the relay of the link, is admitted and joins the team after Rejoindre" -->
- **WHEN** un poste privé neuf, sur le relais de bouclage par défaut, prévisualise puis accepte le lien d'un membre admis du relais de l'équipe
- **THEN** la prévisualisation annonce `adopt` sans rien changer, puis le poste passe au relais de l'équipe, y est admis par le ticket, rejoint l'équipe, et ses destinations privées restent celles d'avant, sans le relais adopté

#### Scenario: AC: relais gardé ou refusé
<!-- openspec-guard:test="one-link join (T4.23) > keeps the relay of a node that already joined someone, and refuses a relay it may not adopt (E_INVITE_RELAY)" -->
- **WHEN** l'invitation nomme `ws://` vers un nom DNS ou une adresse publique littérale, puis, le poste ayant une équipe, un autre relais admissible
- **THEN** les premières sont refusées avec `E_INVITE_RELAY` sans modifier `config.json` ni appairer, la dernière garde le relais du poste (`kept`)

#### Scenario: AC: relais réglé à la main gardé
<!-- openspec-guard:test="join hardening (T4.33) > adopts a relay only from the default loopback relay: a relay set by hand is kept" -->
- **WHEN** un poste neuf, sans pair ni équipe, réglé à la main sur un relais interne, accepte une invitation qui nomme un autre relais
- **THEN** la prévisualisation et « Rejoindre » rendent `kept`, `config.json` ne change pas et la demande d'appairage part

## ADDED Requirements

### Requirement: Relais adopté hors des destinations
Le relais adopté d'une invitation MUST NOT entrer dans `network.origins`, et l'adoption MUST NOT en retirer aucune origine : le relais est choisi par l'inviteur, il ne devient pas une destination du modèle ou des serveurs MCP (T4.33). `config.json` SHALL alors porter `relayAdopted: true`, qui dispense ce relais seul d'être une origine listée.

#### Scenario: AC: origines du propriétaire conservées
<!-- openspec-guard:test="join hardening (T4.33) > switching relay keeps every listed origin and never lists the adopted relay" -->
- **WHEN** un profil privé dont le propriétaire a listé l'origine du relais par défaut et une origine interne adopte un relais à adresse privée littérale, puis redémarre
- **THEN** `network.origins` est inchangé, ne contient pas le relais adopté, `relayAdopted` vaut `true` et la configuration se relit sans erreur

### Requirement: Vraie cause d'un échec d'adoption
Quand `config.json` ne peut être réécrit pour adopter un relais, le refus de « Rejoindre » MUST porter sa cause : `E_LOCKED` quand le verrou de configuration est occupé, `E_CONFLICT` quand le fichier a changé entre sa lecture et sa réécriture, au lieu de `E_INVITE_RELAY`. L'API MUST répondre 400 avec ce code et son message, sans écho de l'invitation, et l'invitation MUST rester utilisable (T4.33).

#### Scenario: AC: vraie cause d'un échec de réécriture
<!-- openspec-guard:test="join hardening (T4.33) > answers E_LOCKED or E_CONFLICT, not E_INVITE_RELAY, when config.json cannot be rewritten, and keeps the invite usable" -->
- **WHEN** « Rejoindre » trouve le verrou de configuration occupé, ou la réécriture de `config.json` échoue en `E_CONFLICT`
- **THEN** l'API répond 400 `E_LOCKED` avec son message, le moteur refuse avec `E_CONFLICT`, rien n'est envoyé, et le même lien est accepté une fois la cause levée
