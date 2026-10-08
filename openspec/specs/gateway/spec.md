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
La page d'autorisation SHALL ouvrir l'app drop par `drop://link?session=…&gateway=…&client=…`. Le Node MUST n'envoyer
`link_grant` qu'après l'accord de l'utilisateur dans son panneau, qui avertit si la passerelle n'est pas parmi celles de
confiance. La passerelle MUST accepter un `link_grant` d'un Node inconnu seulement pour une session en attente, et lier
la session à ce Node.

#### Scenario: Liaison puis retrait
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > runs the whole connector flow: discovery, registration, approval in the app, PKCE, then ask_team over MCP" -->
- **WHEN** l'utilisateur relie Claude puis retire le lien dans son panneau
- **THEN** les appels de Claude passent tant que le lien existe, puis échouent : le Node ignore une passerelle qu'il ne connaît plus

### Requirement: Appels transmis au Node
Chaque appel MCP SHALL devenir un `agent_call { callId, tool, args }` chiffré vers le Node lié au jeton, qui l'exécute
avec les outils du demandeur (`ask_team`, `get_drop_results`, `list_capabilities`) et répond `agent_reply`. Seul le
Node visé MAY répondre à un appel. Sans réponse en 58 s, l'assistant reçoit un message clair.

#### Scenario: Question routée chez un collègue
<!-- openspec-guard:test="consumer gateway: Claude or ChatGPT reach the team through the user’s node (T2.13) > runs the whole connector flow: discovery, registration, approval in the app, PKCE, then ask_team over MCP" -->
- **WHEN** Claude appelle `ask_team` avec une question sur une maquette
- **THEN** le Node de l'utilisateur la route vers le Figma de Julie, et la carte de consentement s'affiche chez Julie
