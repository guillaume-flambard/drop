# gateway Specification

## Purpose
La passerelle rend drop utilisable depuis ChatGPT et Claude grand public, qui n'acceptent que des connecteurs MCP
distants (T2.13, D31). L'utilisateur colle une adresse, puis autorise dans son app drop : deux gestes. La passerelle
transmet ensuite les appels de son assistant à son propre Node par le relais ; elle ne détient aucune clé d'équipe et
ne décide rien.

## Requirements

### Requirement: Autorisation OAuth du connecteur
La passerelle SHALL suivre l'autorisation MCP (2025-06-18) : 401 avec `WWW-Authenticate` sans jeton valide,
métadonnées RFC 9728 et RFC 8414, enregistrement dynamique (RFC 7591), code d'autorisation avec PKCE S256 seulement,
`resource` lié à son adresse `/mcp`, jetons d'accès d'une heure, rafraîchissement à usage unique.

#### Scenario: Parcours complet du connecteur
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > runs the whole connector flow: discovery, registration, approval in the app, PKCE, then ask_team over MCP" -->
- **WHEN** Claude appelle `/mcp` sans jeton, découvre les métadonnées, s'enregistre, ouvre la page d'autorisation, et que l'utilisateur autorise dans l'app
- **THEN** Claude reçoit un code puis un jeton, peut appeler `ask_team`, et un code déjà utilisé est refusé

#### Scenario: Demandes d'autorisation refusées
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > refuses unregistered redirects, plain PKCE and a foreign resource" -->
- **WHEN** une adresse de retour n'est pas enregistrée, que PKCE n'est pas en S256, ou que `resource` désigne un autre serveur
- **THEN** la demande est refusée, et une session non autorisée ne donne aucun code

### Requirement: Jetons et adresses de retour
Les jetons MUST être stockés sous forme d'empreinte seulement. Les adresses de retour MUST être en https (ou http sur
localhost) et correspondre exactement à celles enregistrées.

#### Scenario: Adresse de retour étrangère
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > refuses unregistered redirects, plain PKCE and a foreign resource" -->
- **WHEN** un client s'enregistre avec une adresse http hors localhost, ou demande une adresse non enregistrée
- **THEN** la demande est refusée

### Requirement: Liaison confirmée dans l'app
La page d'autorisation SHALL ouvrir l'app par `drop://link?session=…&gateway=…&client=…&client_id=…&redirect=…`, `redirect` étant le domaine de retour de la session ; la page et le panneau MUST l'afficher à côté du nom de l'assistant. Le panneau MUST avertir si la passerelle n'est pas de confiance, ou si le domaine n'est ni `claude.ai`, ni `chatgpt.com`, ni `chat.openai.com`.

#### Scenario: Liaison puis retrait
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > runs the whole connector flow: discovery, registration, approval in the app, PKCE, then ask_team over MCP" -->
- **WHEN** l'utilisateur relie Claude et ChatGPT par la même passerelle, puis retire Claude dans son panneau
- **THEN** les appels de Claude passent tant que le lien existe, puis échouent ; ceux de ChatGPT continuent de passer

#### Scenario: Domaine inconnu signalé
<!-- openspec-guard:test="menu bar panel and its admin routes (T2.4) > names the domain a linked assistant returns to, and warns when it is neither Claude nor ChatGPT" -->
- **WHEN** le panneau reçoit une demande de liaison dont le domaine de retour n'est pas celui de Claude ou de ChatGPT
- **THEN** il affiche ce domaine et un avertissement ; sans `client_id` ni `redirect`, il ne propose pas d'autoriser

### Requirement: Lien accordé selon la session
Le Node MUST n'envoyer `link_grant { sessionId, clientId, clientName, redirectHost }` qu'après l'accord de l'utilisateur, avec ce que le panneau a affiché. La passerelle MUST accepter un `link_grant` d'un Node inconnu seulement pour une session en attente, et ne lier la session que si `clientId`, `clientName` et `redirectHost` sont exactement ceux de la session (D71).

#### Scenario: Lien truqué
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > binds a link only to the assistant and return domain the user saw in the app (consent phishing)" -->
- **WHEN** un client nommé « Claude » qui renvoie vers un autre domaine reçoit un `link_grant` qui annonce `claude.ai`, un autre client ou un autre nom
- **THEN** la passerelle le refuse et la session reste sans Node ; elle n'est liée que si le `link_grant` annonce le vrai domaine, que la page affiche

### Requirement: Appels transmis au Node
Chaque appel MCP SHALL devenir un `agent_call { callId, clientId, tool, args }` chiffré vers le Node lié au jeton, qui l'exécute avec `ask_team`, `get_drop_results` ou `list_capabilities` et répond `agent_reply`, seulement si un lien relie encore `clientId` par cette passerelle, sinon une erreur. Un lien antérieur à `clientId` vaut pour tous les clients de sa passerelle. Seul le Node visé MAY répondre. Sans réponse en 58 s, l'assistant reçoit un message clair.

#### Scenario: Question routée chez un collègue
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > runs the whole connector flow: discovery, registration, approval in the app, PKCE, then ask_team over MCP" -->
- **WHEN** Claude appelle `ask_team` avec une question sur une maquette
- **THEN** le Node de l'utilisateur la route vers le Figma de Julie, et la carte de consentement s'affiche chez Julie

### Requirement: Limites de la passerelle
L'enregistrement étant ouvert à tous, la passerelle MUST oublier un client qui n'a obtenu aucun jeton 24 h après son
enregistrement, et, au-delà de 1 000 clients sans jeton ou de 1 000 sessions d'autorisation ouvertes, oublier le plus
ancien pour faire place au nouveau plutôt que de refuser tout le monde (D71).

#### Scenario: Enregistrements en masse
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > forgets clients that never got a token after a day, and the oldest pending client or session beyond its limits" -->
- **WHEN** des clients s'enregistrent sans jamais obtenir de jeton, ou que des sessions s'ouvrent sans être autorisées
- **THEN** au-delà de la limite le plus ancien est oublié, et un client sans jeton disparaît après 24 h
