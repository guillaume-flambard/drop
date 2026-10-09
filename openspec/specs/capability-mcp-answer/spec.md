# capability-mcp-answer Specification

## Purpose
La capacité `mcp.answer` répond à la question d'un collègue à partir d'un des serveurs MCP du propriétaire (Figma, Notion,
Linear, GitHub, une base de données…), sans lui donner l'accès à l'outil ni ses données brutes (T2.2, D26). Elle ouvre
les cas d'usage réels : chacun partage une réponse depuis les outils qu'il utilise déjà.

## Requirements

### Requirement: Une publication par source
`mcp.answer` SHALL être une famille : le propriétaire la publie une fois par serveur MCP, sous l'id
`mcp.answer.<nom>` (`<nom>` en `[a-z][a-z0-9_]*`), chaque publication avec sa propre config. La carte MUST nommer la
source dans son titre (« Répondre à partir de <label> ») et dans `neverReceives` (« l'accès à <label> »).

#### Scenario: Carte d'une source
<!-- openspec-guard:test="mcp.answer (T2.2) > is published once per source as mcp.answer.<name>, with a card naming the source" -->
- **WHEN** Julie publie `mcp.answer.figma` avec `label: "mon Figma"`
- **THEN** la carte a l'id `mcp.answer.figma`, le titre « Répondre à partir de mon Figma » et la sensibilité `high`
- **AND** un id hors du format `mcp.answer.<nom>` ne correspond à aucune capacité

### Requirement: Outils choisis par le propriétaire
La config MUST lister les outils que le modèle peut appeler (`tools`). Le runner MUST ne proposer au modèle que les
outils de cette liste que le serveur offre réellement, en retirant ceux que le serveur marque `destructiveHint`, et MUST
refuser tout autre appel d'outil sans l'exécuter. La requête ne choisit jamais un outil (D19). `drop mcp-tools` liste les
outils d'un serveur avec leurs annotations pour aider le propriétaire à choisir.

#### Scenario: Outil non choisi refusé
<!-- openspec-guard:test="mcp.answer (T2.2) > answers from the owner MCP server, calling only the tools the owner chose" -->
- **WHEN** le modèle appelle un outil hors de la liste, ou un outil de la liste marqué destructif par le serveur
- **THEN** l'outil n'est pas appelé sur le serveur et le modèle reçoit « outil non autorisé »
- **AND** seuls les outils choisis et non destructifs sont proposés au modèle

#### Scenario: Aucun outil disponible
<!-- openspec-guard:test="mcp.answer (T2.2) > frames the question as data and refuses a server that offers none of the chosen tools" -->
- **WHEN** le serveur n'offre aucun des outils choisis
- **THEN** l'exécution échoue avec `E_RUNNER`, sans appeler le modèle pour répondre

### Requirement: Secrets du serveur dans l'environnement
Un serveur stdio MUST recevoir l'environnement minimal du SDK plus les seules variables que la config nomme (`env`) ;
un serveur HTTP MUST recevoir ses en-têtes depuis des variables nommées (`headersFromEnv`). Aucune valeur de secret ne
figure dans la config. Une variable nommée absente MUST faire échouer la connexion.

#### Scenario: Variable transmise au serveur stdio
<!-- openspec-guard:test="mcp.answer (T2.2) > starts a stdio server with only the environment variables the owner named" -->
- **WHEN** la config nomme `FAKE_DESIGN_TOKEN` et que la variable est définie chez le propriétaire
- **THEN** le serveur la reçoit ; si elle est absente, la connexion échoue en la nommant

### Requirement: Résultats d'outils traités comme données
Les résultats d'outils MUST être réduits à leur texte (images et binaires retirés), tronqués à 20 000 caractères, et
présentés au modèle comme des données dont il ignore les consignes. La question MUST être encadrée par
`<question>…</question>` après échappement.

#### Scenario: Texte seulement
<!-- openspec-guard:test="mcp.answer (T2.2) > reads only text from tool results and only a well-formed final answer" -->
- **WHEN** un outil renvoie du texte et une image
- **THEN** le modèle ne reçoit que le texte

### Requirement: Sortie bornée et relue
La sortie MUST être `{ answer: string (≤ 1500), verdict: 'yes'|'no'|'partial'|'unknown', sources: string[] (≤ 10 noms) }`.
La carte MUST déclarer `sensitivity: 'high'` et `approval: 'always'` : le propriétaire relit chaque réponse avant envoi.

#### Scenario: Réponse finale invalide
<!-- openspec-guard:test="mcp.answer (T2.2) > reads only text from tool results and only a well-formed final answer" -->
- **WHEN** le modèle ne rend pas un objet conforme
- **THEN** la réponse n'est pas retenue (une relance, puis `E_OUTPUT_INVALID`)

### Requirement: Clé du demandeur
Quand la demande porte une clé plafonnée (D27), la capacité MUST appeler le modèle avec cette clé, l'URL qu'elle donne et
son modèle s'il est précisé, avec un budget égal au plus petit de `maxUsd` et du plafond de la clé.

#### Scenario: Modèle payé par le demandeur
<!-- openspec-guard:test="mcp.answer (T2.2) > runs on the requester capped key when the requester pays (D27)" -->
- **WHEN** la demande porte une clé plafonnée à 0,10 $ pour `requester/model`
- **THEN** le modèle appelé est `requester/model` avec cette clé, et le budget est 0,10 $

### Requirement: Serveur déclaré par un agent
La config MAY désigner un serveur par `{ transport: 'agent', agent, name }` : un serveur déjà déclaré par Claude Code,
Claude Desktop, Cursor ou Codex (T2.8). La capacité SHALL alors le démarrer comme l'agent le démarre, avec les
variables et en-têtes lus dans le fichier de l'agent au moment de l'exécution, sans les recopier dans la config de drop.

#### Scenario: Secret lu chez l'agent
<!-- openspec-guard:test="MCP servers declared by the coding agents (T2.8) > starts a server as its agent declares it, with the secrets read from the agent file at run time" -->
- **WHEN** Claude Code déclare un serveur avec un jeton dans `env`, et que Julie le partage
- **THEN** le serveur démarre avec ce jeton, lu dans `~/.claude.json` ; un serveur que l'agent ne déclare plus fait échouer la connexion

#### Scenario: Config des quatre agents
<!-- openspec-guard:test="MCP servers declared by the coding agents (T2.8) > reads the servers of Claude Code, Cursor, Claude Desktop and Codex, with their env and headers" -->
- **WHEN** les quatre agents déclarent des serveurs, dont une table Codex désactivée
- **THEN** chaque serveur actif est lu avec sa commande ou son URL, ses variables et ses en-têtes

### Requirement: Partage vérifié
Partager un serveur détecté (`drop share`, panneau) SHALL toujours s'y connecter d'abord et MUST ne rien publier si :
le serveur exige une connexion OAuth (401 ou 403 sans en-tête `Authorization`), refuse son jeton (401 ou 403 avec
en-tête), ne répond pas, n'offre pas un outil choisi, ou marque un outil choisi `destructiveHint`. Le message MUST dire
quoi faire, en français, puisque le panneau l'affiche tel quel ; à l'exécution, ces mêmes cas restent `E_RUNNER` (T2.16,
D38).

#### Scenario: Serveur que drop ne peut pas utiliser
<!-- openspec-guard:test="detecting agents and their MCP servers (T2.8) > drop share checks the server first: OAuth-only, refused token, unreachable, missing or destructive tools (T2.16)" -->
- **WHEN** Natha partage un serveur qui exige OAuth, un serveur qui refuse son jeton, un serveur éteint, un outil absent ou un outil destructif
- **THEN** le partage échoue avec un message qui nomme la cause, et aucune capacité n'est publiée
- **AND** le même serveur partagé avec des outils offerts et en lecture est publié

### Requirement: Serveurs distants avec OAuth
Pour un serveur MCP distant qui exige OAuth et accepte l'enregistrement dynamique (Notion par exemple), drop SHALL
s'enregistrer comme son propre client (nom « drop »), puis obtenir ses jetons par le code d'autorisation avec PKCE
S256, une fois, dans le navigateur du propriétaire (T2.17, D39). Les jetons MUST rester sous `DROP_HOME/oauth`
(dossier 0700, un fichier 0600 par serveur), ne jamais être journalisés ni envoyés à un pair, et être rafraîchis
quand ils expirent. Une exécution ou un partage MUST ne jamais lancer de connexion ni s'enregistrer : sans jetons
valides, ils échouent comme un serveur qui exige OAuth. Un jeton déjà configuré dans l'agent passe en premier. Les
outils utilisables restent ceux choisis au partage.

#### Scenario: Connexion unique puis rafraîchissement
<!-- openspec-guard:test="remote MCP servers behind OAuth (T2.17) > signs in once (registration, PKCE, consent), keeps the tokens 0600, refreshes them, and stops when revoked" -->
- **WHEN** Natha connecte drop à son serveur Notion, puis que le jeton d'accès expire, puis que la connexion est révoquée
- **THEN** drop s'enregistre une fois sous le nom « drop », garde ses jetons en 0600, les rafraîchit à l'expiration, et échoue comme un serveur OAuth après la révocation
- **AND** avant la connexion, un appel échoue sans rien enregistrer ; un `state` inconnu ou déjà utilisé est refusé

#### Scenario: Partage après connexion
<!-- openspec-guard:test="remote MCP servers behind OAuth (T2.17) > drop share uses the tokens of a sign-in, and says how to sign in before one" -->
- **WHEN** Natha partage le serveur Notion avant, puis après la connexion de drop
- **THEN** le premier partage indique `drop connect claude_code/notion`, le second publie les outils en lecture du serveur
