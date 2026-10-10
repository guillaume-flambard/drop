# node Specification

## Purpose
Package `packages/node`, binaire `drop` : un daemon long (`drop serve`) et des sous-commandes qui portent l'identité, la configuration locale, l'appairage, l'API locale utilisée par `requester-mcp` et les surfaces de consentement de l'approbateur.

## Requirements

### Requirement: Répertoire DROP_HOME
L'état local d'un Node SHALL vivre dans `DROP_HOME`, qui vaut `~/.drop` par défaut.

#### Scenario: Valeur par défaut
- **WHEN** `drop` s'exécute sans variable `DROP_HOME`
- **THEN** il lit et écrit son état dans `~/.drop`

### Requirement: Contenu de DROP_HOME
`DROP_HOME` SHALL contenir `identity.json` (clés, mode `0600`), `peers.json` (Nodes connus et leurs noms), `capabilities/` (cartes publiées par ce Node), `receipts/` (JSONL) et `config.json` (URL du relais, rôle).

#### Scenario: Arborescence après init
- **WHEN** un Node est initialisé puis appairé, a publié une capacité et a traité un Drop
- **THEN** `DROP_HOME` contient `identity.json`, `peers.json`, `capabilities/`, `receipts/` et `config.json`

### Requirement: Clés privées en mode 0600
`identity.json`, qui contient les clés du Node, MUST avoir le mode fichier `0600`.

#### Scenario: Permissions de l'identité
- **WHEN** `drop init` crée `identity.json`
- **THEN** le mode du fichier est `0600`

### Requirement: Reçus en JSONL
Le Node SHALL écrire ses reçus en JSONL dans `DROP_HOME/receipts/`.

#### Scenario: Reçu écrit
- **WHEN** un Drop auquel ce Node participe produit un `receipt`
- **THEN** une ligne JSON est ajoutée dans un fichier de `DROP_HOME/receipts/`

### Requirement: Plusieurs Nodes sur une même machine
Plusieurs Nodes sur une même machine SHALL fonctionner avec plusieurs `DROP_HOME` distincts ; c'est ainsi qu'on simule un second propriétaire (« Julie ») en dev.

#### Scenario: Deux Nodes locaux
- **WHEN** on lance deux `drop serve` avec deux `DROP_HOME` différents
- **THEN** chacun a sa propre identité, ses pairs et ses reçus, sans partage d'état

### Requirement: Commande drop init
`drop init --name "Guillaume" --kind human --relay wss://…` SHALL créer `DROP_HOME`, l'identité et la configuration.

#### Scenario: Initialisation
- **WHEN** on lance `drop init --name "Guillaume" --kind human --relay wss://relay.example/v1` sur un `DROP_HOME` vide
- **THEN** `DROP_HOME`, `identity.json` et `config.json` (URL du relais, rôle) sont créés

### Requirement: Commandes drop invite et drop pair
`drop invite` et `drop pair <code>` SHALL réaliser l'appairage tel que défini par le protocole (code d'invitation, `pair_request`, `pair_accept`, `peers.json`).

#### Scenario: Appairage par la CLI
- **WHEN** A lance `drop invite` et B lance `drop pair <code>` avec le code obtenu
- **THEN** A et B se trouvent chacun dans le `peers.json` de l'autre

#### Scenario: Nouveau venu appairé sans modifier le relais
<!-- openspec-guard:test="joining the relay by invitation (T2.1) > a node the relay does not know pairs through an invite code and is admitted, with no allowlist edit" -->
- **WHEN** B, inconnu du relais, lance `drop pair <code>` avec un code de A
- **THEN** B garde le ticket d'admission du code, se reconnecte aussitôt avec, est admis, et A et B sont appairés
- **AND** le ticket est effacé du disque de B une fois admis

### Requirement: Qui paie le modèle
La config du Node SHALL porter `payer: 'requester' | 'owner'` (défaut `requester`, D27) pour ce qu'il exécute. Un
exécuteur en `payer: 'owner'` ignore la clé reçue et paie avec sa propre config.

#### Scenario: Le propriétaire paie
<!-- openspec-guard:test="the requester pays with a capped key (T2.3, D27) > an owner who pays ignores the key and the card says the cost is theirs" -->
- **WHEN** l'exécuteur est en `payer: 'owner'` et reçoit une demande avec une clé
- **THEN** la capacité tourne sans la clé et la carte indique `paidBy: 'owner'`

### Requirement: Clé plafonnée du demandeur
La config MAY porter `funding: { kind: 'openrouter', managementKeyEnv, perDropUsd, model? }`. Le Node demandeur SHALL
alors créer par demande une clé OpenRouter plafonnée à `perDropUsd`, qui expire au bout de 2 h, et la supprimer quand la
demande se termine. Sans clé de gestion, ou si l'API refuse, il n'envoie pas de clé.

#### Scenario: Clé plafonnée créée puis supprimée
<!-- openspec-guard:test="OpenRouter capped keys > mints a key capped and expiring, then deletes it by hash" -->
- **WHEN** le demandeur envoie une demande avec `funding` configuré
- **THEN** il crée une clé `POST /keys` avec `limit` = `perDropUsd` et `expires_at` à 2 h, puis la supprime par `DELETE /keys/{hash}`

#### Scenario: Pas de clé de gestion
<!-- openspec-guard:test="OpenRouter capped keys > sends no key when the management key is missing or the API refuses" -->
- **WHEN** la variable de la clé de gestion est absente ou l'API refuse
- **THEN** la demande part sans clé et l'erreur est journalisée avec un code stable

### Requirement: Détection des agents et de leurs serveurs MCP
`drop detect` SHALL lister, en moins de 3 secondes, les agents de code présents (Claude Code, Claude Desktop, Cursor,
Codex), si drop y est installé, et leurs serveurs MCP lus dans leurs fichiers de config, avec le genre de chaque
serveur quand son nom, sa commande ou son URL le dit (Figma, Notion, GitHub, Linear, Jira, base de données, CRM…). La
sortie MUST NOT contenir de valeur secrète : seulement les noms de variables et d'en-têtes (T2.8, D28).

#### Scenario: Inventaire sans secret
<!-- openspec-guard:test="detecting agents and their MCP servers (T2.8) > lists each agent, whether drop is installed, and what each server is, without any secret value" -->
- **WHEN** Claude Code déclare un serveur Notion avec `NOTION_TOKEN` et le serveur drop, et Cursor un CRM
- **THEN** `drop detect` montre Notion (genre `notion`, variable `NOTION_TOKEN`), drop installé dans Claude Code, le CRM
  dans Cursor, et aucune valeur de jeton

### Requirement: Partage d'un serveur détecté
`drop share <agent>/<serveur>` SHALL publier `mcp.answer.<genre ou nom>` sur ce serveur, tel que l'agent le déclare,
avec par défaut les seuls outils que le serveur marque `readOnlyHint` ; si aucun ne l'est, la commande MUST demander
`--tools`. Les serveurs de drop lui-même ne sont jamais proposés.

#### Scenario: Partage en une commande
<!-- openspec-guard:test="detecting agents and their MCP servers (T2.8) > drop share publishes a detected server with its read-only tools, and never drop itself" -->
- **WHEN** Julie lance `drop share claude_code/figma`
- **THEN** `mcp.answer.figma` est publié avec le libellé « mon Figma », le serveur désigné par l'agent et les seuls outils en lecture seule
- **AND** `drop share` sur le serveur de drop lui-même est refusé

### Requirement: Équipe
Un Node SHALL pouvoir créer une équipe (`drop team create <nom>`) ; ses invitations portent alors l'équipe, et qui
s'appaire avec elles la rejoint (T2.9, D28). Chaque membre MUST envoyer la liste des membres (`team_roster`) à un
nouveau pair de l'équipe, et à tous les membres quand sa liste change. Un membre inconnu reçu d'un membre de la même
équipe MUST devenir un pair, présenté par ce membre (`via`), et recevoir une demande de catalogue.

#### Scenario: Tout le monde se connaît
<!-- openspec-guard:test="team (T2.9) > everyone invited by any member ends up paired with every member, and sees their agents and tools" -->
- **WHEN** Guillaume crée l'équipe Atlas et invite Julie, Julie invite Natha, et Guillaume invite Sami
- **THEN** chacun des quatre a les trois autres pour pairs et dans son équipe, sans autre appairage
- **AND** `drop team` montre chaque membre avec ses agents, en ligne ou non, et ce qu'il partage

### Requirement: Liste d'une autre équipe ignorée
Un Node MUST ignorer une liste `team_roster` d'une autre équipe, ou reçue alors qu'il n'est dans aucune équipe ;
aucune liste ne choisit un outil ni n'autorise une demande : chaque demande passe toujours par le consentement.

#### Scenario: Liste étrangère
<!-- openspec-guard:test="team (T2.9) > ignores a roster from another team, and a node outside any team ignores rosters" -->
- **WHEN** un pair qui n'est pas de l'équipe envoie une liste d'une autre équipe avec un inconnu
- **THEN** ni la liste des membres ni les pairs ne changent

### Requirement: Routage d'une question
`POST /ask { question, purpose?, agent }` SHALL choisir au plus trois capacités qui prennent une question libre, par des
règles sans modèle (D32) : un prénom cité dans la question l'emporte ; sinon les mots de la question sont comparés au
genre de chaque outil partagé (Figma, code, GitHub, Notion, Linear, Jira, CRM, base de données…). Le Node MUST envoyer
une demande à chacune et MUST n'en envoyer aucune quand rien ne correspond.

#### Scenario: Mots de la question
<!-- openspec-guard:test="routing a plain question to the right people (T2.12, D32) > matches the words of the question to the kind of each shared tool" -->
- **WHEN** la question parle de la couleur d'un bouton sur la maquette, ou des PR, des tickets et du contrat client
- **THEN** elle part vers Figma, ou vers GitHub, Linear et le CRM

#### Scenario: Prénom ou rien
<!-- openspec-guard:test="routing a plain question to the right people (T2.12, D32) > a first name wins, accents and case do not matter, and nothing is sent when nothing matches" -->
- **WHEN** la question cite « sami », ou ne correspond à aucun outil
- **THEN** elle part vers l'outil de Sami, ou nulle part

#### Scenario: Question libre seulement
<!-- openspec-guard:test="routing a plain question to the right people (T2.12, D32) > only capabilities that take a free-text question can be asked" -->
- **WHEN** une capacité demande des champs précis (`service`, `window`)
- **THEN** le routage ne la choisit jamais

### Requirement: Commande drop peers
`drop peers` SHALL lister les pairs.

#### Scenario: Liste des pairs
- **WHEN** on lance `drop peers` sur un Node appairé
- **THEN** chaque pair de `peers.json` est affiché

### Requirement: Daemon drop serve
`drop serve` SHALL être un process long qui maintient la connexion au relais, sert l'API locale et l'UI locale, et lance le runner si des capacités sont publiées sur ce Node.

#### Scenario: Runner conditionnel
- **WHEN** `drop serve` démarre sur un Node sans capacité publiée
- **THEN** l'API locale et l'UI locale sont servies, sans runner

#### Scenario: Runner actif
- **WHEN** `drop serve` démarre sur un Node qui a publié une capacité
- **THEN** le runner est lancé en plus de l'API et de l'UI locales

### Requirement: Reconnexion exponentielle au relais
`drop serve` MUST se reconnecter seul au relais après une coupure, avec un délai exponentiel de 1 s à 30 s.

#### Scenario: AC: drop serve se reconnecte seul après coupure du relais
- **WHEN** le relais coupe la connexion puis redevient disponible
- **THEN** `drop serve` se reconnecte sans intervention

#### Scenario: Délais bornés
- **WHEN** le relais reste indisponible
- **THEN** les délais entre tentatives croissent exponentiellement depuis 1 s sans dépasser 30 s

### Requirement: Commande drop publish
`drop publish <capability-id> [--approver <nodeId>]` SHALL publier sur ce Node une capacité du package `capabilities`, avec l'approbateur indiqué.

#### Scenario: Publication avec approbateur distant
- **WHEN** on lance `drop publish production.error_summary --approver <nodeId du Mac>` sur le Node VPS
- **THEN** la carte est enregistrée dans `DROP_HOME/capabilities/` avec ce `nodeId` parmi `approverNodeIds`

### Requirement: Commande drop pending
`drop pending` SHALL lister les demandes en attente d'approbation, en alternative CLI à l'UI.

#### Scenario: Demandes en attente
- **WHEN** un `approval_request` non décidé est en file et on lance `drop pending`
- **THEN** la demande est listée avec son `dropId`

### Requirement: Décision en CLI
`drop approve <dropId>`, `drop deny <dropId>` et `drop not-now <dropId>` SHALL émettre respectivement les décisions `allow_once`, `deny` et `not_now` pour ce Drop.

#### Scenario: Approbation en CLI
- **WHEN** on lance `drop approve <dropId>` sur une demande en attente
- **THEN** l'exécuteur reçoit une décision `allow_once` pour ce `dropId`

### Requirement: Commande drop receipts
`drop receipts [--since 7d]` SHALL afficher l'historique des reçus, filtré sur la période donnée par `--since`.

#### Scenario: Historique filtré
- **WHEN** on lance `drop receipts --since 7d`
- **THEN** seuls les reçus des 7 derniers jours sont affichés

### Requirement: Écoute de l'API locale
L'API locale SHALL être servie en HTTP sur `127.0.0.1:<port>` uniquement, port 7781 par défaut ; elle est l'interface utilisée par `requester-mcp`.

#### Scenario: Adresse d'écoute
- **WHEN** `drop serve` démarre sans port configuré
- **THEN** l'API locale écoute sur `127.0.0.1:7781` et sur aucune autre interface

### Requirement: Jeton de l'API locale
L'API locale MUST exiger un jeton aléatoire non vide, écrit dans `DROP_HOME/local-token` en mode `0600` et présenté dans l'en-tête `Authorization: Bearer`, ou dans `?token=` pour l'UI et son flux SSE. Toute requête sans jeton valide MUST être refusée. `drop serve` MUST refuser de démarrer l'API locale si ce fichier est absent, vide ou réduit à des espaces ; il MUST signaler une erreur stable sans journaliser le jeton.

#### Scenario: AC: requête sans jeton refusée
<!-- openspec-guard:test="refuses a request without the token" -->
- **WHEN** une requête arrive sur l'API locale sans en-tête `Authorization: Bearer <jeton>` valide
- **THEN** elle est refusée (test)

#### Scenario: Fichier du jeton
<!-- openspec-guard:test="creates a local token with owner-only permissions" -->
- **WHEN** `drop serve` crée le jeton
- **THEN** `DROP_HOME/local-token` existe en mode `0600`

#### Scenario: AC: jeton local absent ou vide au démarrage
<!-- openspec-guard:test="refuses to start with a missing or empty local token" -->
- **WHEN** `drop serve` trouve `DROP_HOME/local-token` absent, vide ou composé uniquement d'espaces
- **THEN** il échoue avec `E_TOKEN` avant de lancer le relais ou d'ouvrir l'API locale, sans imprimer le contenu du fichier

#### Scenario: AC: présentation vide refusée
<!-- openspec-guard:test="rejects missing and empty presented tokens" -->
- **WHEN** un client appelle l'API, l'UI ou le flux SSE sans jeton, avec un `Bearer` vide ou avec `?token=` vide
- **THEN** la requête est refusée, même si la configuration du serveur est invalide ou vide

#### Scenario: AC: jeton valide préservé
<!-- openspec-guard:test="preserves authenticated local API and panel access" -->
- **WHEN** `drop serve` possède un jeton non vide et le client présente cette valeur
- **THEN** l'API et le panneau local restent accessibles selon leurs règles existantes

### Requirement: Contrôle de l'en-tête Host
L'API locale MUST refuser toute requête dont l'en-tête `Host` n'est pas `127.0.0.1:<port>` ou `localhost:<port>`, pour se protéger du DNS rebinding.

#### Scenario: AC: Host étranger refusé
- **WHEN** une requête avec un jeton valide porte `Host: evil.example:7781`
- **THEN** elle est refusée (test)

#### Scenario: Host local accepté
- **WHEN** une requête avec un jeton valide porte `Host: localhost:7781`
- **THEN** elle est traitée

### Requirement: Route GET /peers
`GET /peers` SHALL renvoyer les pairs et leur statut de connexion.

#### Scenario: Pairs et statut
- **WHEN** `requester-mcp` appelle `GET /peers`
- **THEN** la réponse liste chaque pair avec son statut de connexion

### Requirement: Route GET /capabilities
`GET /capabilities` SHALL renvoyer le catalogue agrégé des pairs, mis en cache 60 s et rafraîchi par `catalog_request`.

#### Scenario: Cache du catalogue
- **WHEN** `GET /capabilities` est appelé deux fois en moins de 60 s
- **THEN** aucun nouveau `catalog_request` n'est envoyé pour le second appel

#### Scenario: Rafraîchissement
- **WHEN** le cache a plus de 60 s
- **THEN** le Node envoie `catalog_request` aux pairs pour rafraîchir le catalogue

### Requirement: Route POST /drops
`POST /drops` SHALL accepter `{ capabilityId, input, purpose, agent }` et renvoyer `{ dropId }`.

#### Scenario: Création d'un Drop
- **WHEN** `requester-mcp` envoie `POST /drops` avec `{ capabilityId, input, purpose, agent }`
- **THEN** la réponse est `{ dropId }`

### Requirement: Route GET /drops/:id
`GET /drops/:id` SHALL renvoyer l'état courant du Drop, avec son résultat ou son erreur.

#### Scenario: Polling du résultat
- **WHEN** l'agent interroge `GET /drops/:id` après réception d'un `drop_result`
- **THEN** la réponse contient l'état et le résultat

#### Scenario: Erreur
- **WHEN** le Drop a reçu un `drop_error`
- **THEN** `GET /drops/:id` renvoie l'état et l'erreur

### Requirement: Séquence nominale côté Node demandeur
Sur `POST /drops`, le Node demandeur SHALL envoyer via le relais une enveloppe `drop_request` chiffrée pour le Node exécuteur.

#### Scenario: Requête transmise
- **WHEN** `requester-mcp` appelle `POST /drops` sur le Node Mac pour une capacité du Node VPS
- **THEN** une enveloppe `drop_request` chiffrée pour le Node VPS part vers le relais

### Requirement: Séquence nominale validation par l'exécuteur
À réception d'un `drop_request`, le Node exécuteur MUST le valider (schéma, signature, expiration, quota) avant d'envoyer `approval_request` à l'approbateur.

#### Scenario: Requête valide
- **WHEN** le Node VPS reçoit un `drop_request` valide
- **THEN** il envoie un `approval_request` au Node approbateur (le Mac)

#### Scenario: Requête invalide
- **WHEN** le `drop_request` échoue à la validation
- **THEN** aucun `approval_request` n'est envoyé

### Requirement: Séquence nominale affichage chez l'approbateur
À réception d'un `approval_request`, le Node approbateur SHALL afficher la carte de consentement dans l'UI locale et par notification.

#### Scenario: Demande affichée
- **WHEN** le Node Mac reçoit un `approval_request`
- **THEN** la carte apparaît dans l'UI locale et une notification est émise

### Requirement: Séquence nominale décision signée
Quand l'approbateur clique « Autoriser une fois » (`Allow once`), son Node SHALL envoyer une décision signée au Node exécuteur, dont le runner exécute ensuite la capacité. La séquence nomme ce message `drop_decision` ; la table du protocole le nomme `approval_decision`.

#### Scenario: Autorisation puis exécution
- **WHEN** l'approbateur clique « Autoriser une fois »
- **THEN** le Node exécuteur reçoit une décision signée `allow_once` et le runner exécute la capacité

### Requirement: Séquence nominale relecture en sensibilité haute
Après validation par le schéma et scan de la sortie, le Node exécuteur SHALL renvoyer la sortie à l'approbateur pour relecture si la capacité est `high`.

#### Scenario: Sortie à relire
- **WHEN** une capacité `high` produit une sortie validée et scannée
- **THEN** le Node exécuteur envoie un `review_request` à l'approbateur avant tout `drop_result`

### Requirement: Séquence nominale livraison et reçus
Le Node exécuteur SHALL envoyer `drop_result` au demandeur, et les deux côtés MUST écrire un `receipt`.

#### Scenario: Livraison
- **WHEN** un Drop est livré
- **THEN** le demandeur reçoit `drop_result`, et le Node exécuteur comme le Node demandeur ont un reçu écrit

### Requirement: Deux surfaces de consentement, une file
Le consentement SHALL être offert par deux surfaces, l'UI web locale et la notification, qui partagent la même file d'attente.

#### Scenario: Décision depuis une surface
- **WHEN** une demande est décidée depuis l'UI locale
- **THEN** elle disparaît aussi de `drop pending`

### Requirement: UI web locale
`drop serve` SHALL servir sur `127.0.0.1` une page unique, sans framework, qui liste les demandes en attente et se rafraîchit par SSE. Elle MUST exiger le même jeton que l'API, transmis par un lien ouvert localement.

#### Scenario: Nouvelle demande poussée
- **WHEN** une nouvelle demande arrive pendant que la page est ouverte
- **THEN** elle apparaît sans rechargement, via SSE

#### Scenario: Accès sans jeton
- **WHEN** on ouvre l'UI locale sans le jeton
- **THEN** l'accès est refusé

### Requirement: Notification macOS
Sur macOS, le Node SHALL notifier chaque demande avec le titre « {Nom} a besoin d'aide » et pour sous-titre le titre de la capacité ; un clic SHALL ouvrir l'UI locale. Lancé par l'app Mac (`DROP_NOTIFY=shell`), il MUST remettre la notification à l'app, qui l'affiche avec son icône ; ailleurs, il utilise `osascript`. `DROP_NOTIFY=off`, réservé au banc de simulation, MUST l'empêcher.

#### Scenario: Notification émise
- **WHEN** une demande de Julie pour « Résumer les erreurs de production » arrive sur macOS
- **THEN** une notification « Julie a besoin d'aide » s'affiche avec ce sous-titre, et un clic ouvre l'UI locale

#### Scenario: AC: banc de simulation silencieux
<!-- openspec-guard:test="notifications (T4.1) > AC stays silent when DROP_NOTIFY is off, even on macOS" -->
- **WHEN** le Node tourne sur macOS avec `DROP_NOTIFY=off`
- **THEN** aucune notification n'est émise

#### Scenario: AC: notification remise à l'app
<!-- openspec-guard:test="notifications (T4.14) > AC hands the notification to the Mac app as one JSON line in shell mode" -->
- **WHEN** le Node tourne avec `DROP_NOTIFY=shell` et qu'une demande arrive
- **THEN** il écrit une seule ligne JSON `dropNotify` portant titre et sous-titre, et n'appelle pas `osascript`

### Requirement: Pas de notification sous Linux
Sous Linux, le Node SHALL ne pas émettre de notification ; `drop pending` suffit.

#### Scenario: Linux
- **WHEN** une demande arrive sur un Node Linux
- **THEN** aucune notification n'est émise et la demande est visible par `drop pending`

### Requirement: Contenu exact de la carte de consentement
La carte SHALL afficher exactement ce contenu, dans cet ordre (ligne « Sensibilité haute » seulement si `high`), au tutoiement sur la page historique comme dans le panneau :

```text
{requestedBy.displayName} a besoin d'aide            via {agent}
{card.title}
« {inputPreview} »

Pourquoi : {purpose}

{displayName} recevra :            {receives[]}
{displayName} ne recevra jamais :  {neverReceives[]}
Coût max : {maxUsd} $, à ta charge.   (ou « gratuit », ou « non mesuré » ; absent si la capacité ne coûte rien)
Sensibilité haute : tu reliras le résultat avant envoi.   (si high)

Expire dans {mm:ss}

[ Pas maintenant ]   [ Refuser ]   [ Autoriser une fois ]
```

#### Scenario: Ordre des éléments
<!-- openspec-guard:test="consent UI > shows no technical identifier and defaults to « Pas maintenant »" -->
- **WHEN** la carte d'une demande est rendue
- **THEN** les éléments apparaissent dans l'ordre : demandeur et agent, titre, aperçu de l'entrée, « Pourquoi », « recevra », « ne recevra jamais », coût éventuel, sensibilité haute éventuelle, « Expire dans », puis les boutons « Pas maintenant », « Refuser », « Autoriser une fois »

#### Scenario: Ligne de sensibilité haute
<!-- openspec-guard:test="consent UI > omits the high-sensitivity line for a low capability and words it in tu otherwise" -->
- **WHEN** la capacité est `low`
- **THEN** la ligne « Sensibilité haute : tu reliras le résultat avant envoi. » est absente

### Requirement: Aucun identifiant technique sur la carte
La carte de consentement MUST NOT afficher d'identifiant technique : ni `nodeId`, ni nom d'outil, ni id de capacité.

#### Scenario: Carte sans identifiant
- **WHEN** la carte d'une demande pour `production.error_summary` est rendue
- **THEN** ni le `nodeId`, ni un nom d'outil, ni la chaîne `production.error_summary` n'y figurent

### Requirement: Aperçu d'entrée échappé
`inputPreview` MUST être un rendu lisible et échappé de l'entrée : aucun HTML n'est interprété.

#### Scenario: AC: l'UI échappe une entrée contenant script
- **WHEN** l'entrée d'une demande contient `<script>`
- **THEN** l'UI affiche le texte littéral et n'exécute ni n'interprète le HTML (test)

### Requirement: Bouton par défaut au clavier
Le bouton par défaut au clavier MUST être « Pas maintenant », jamais « Autoriser ».

#### Scenario: Entrée au clavier
- **WHEN** l'utilisateur presse Entrée sur une carte sans avoir choisi de bouton
- **THEN** la décision émise est `not_now`

### Requirement: Expiration de la demande
Une demande non décidée MUST expirer après 10 minutes par défaut : le Drop passe à `expired` et `E_EXPIRED` est envoyé au demandeur.

#### Scenario: AC: un Drop non décidé passe à expired et le demandeur reçoit E_EXPIRED
- **WHEN** avec une horloge simulée, 10 minutes s'écoulent sans décision sur une demande
- **THEN** le Drop passe à `expired` et le demandeur reçoit `E_EXPIRED` (test)

### Requirement: Écran de relecture champ par champ
Pour `sensitivity: 'high'`, l'écran de relecture SHALL afficher la sortie champ par champ, avec une case à cocher par champ de premier niveau qui permet de le retirer (`redactions`).

#### Scenario: Retrait d'un champ
- **WHEN** l'approbateur coche un champ de premier niveau puis envoie
- **THEN** la `review_decision` porte ce champ dans `redactions`

### Requirement: Boutons de l'écran de relecture
L'écran de relecture SHALL proposer les boutons « Ne pas envoyer » et « Envoyer ».

#### Scenario: Ne pas envoyer
- **WHEN** l'approbateur clique « Ne pas envoyer »
- **THEN** la `review_decision` porte `decision: 'discard'`

#### Scenario: Envoyer
- **WHEN** l'approbateur clique « Envoyer »
- **THEN** la `review_decision` porte `decision: 'send'`

### Requirement: Texte long échappé en relecture
L'écran de relecture MUST afficher le texte long tel quel, échappé.

#### Scenario: Texte avec balises
- **WHEN** un champ de sortie contient du HTML
- **THEN** il est affiché littéralement, sans interprétation ni troncature

### Requirement: Profil privé explicite
Le Node SHALL proposer un profil privé sans compte externe, passerelle cloud, financement distant automatique, télémétrie, activation de licence ni téléchargement au démarrage. Le relais et les destinations sont choisis localement.

#### Scenario: AC: installation et cycle sans Internet
<!-- openspec-guard:test="private system > runs two private nodes with internal MCP and model through consent failure and restart" -->
- **WHEN** deux Nodes privés utilisent leur relais et leur modèle internes, Internet bloqué
- **THEN** le consentement et la réponse fonctionnent après arrêt et relance, sans connexion externe ; la recette conserve les observations réseau.

### Requirement: Migration privée réversible
La migration SHALL être explicite, sauvegarder la configuration en mode privé, préserver identité, jeton, pairs et publications, et proposer un retour arrière sans écraser une modification concurrente.

#### Scenario: AC: migration et restauration
<!-- openspec-guard:test="private configuration > backs up migrates and restores configuration without changing identity or publications" -->
- **WHEN** une configuration historique est migrée puis restaurée
- **THEN** les autres fichiers restent identiques et une modification concurrente empêche la restauration.

### Requirement: Demandes reçues persistantes
Le Node MUST conserver au plus 16 384 identifiants reçus, sans contenu, pendant 30 minutes. Une horloge et une empreinte des marqueurs durables MUST empêcher leur rejeu après redémarrage, recul d'horloge ou perte partielle. Le Node MUST refuser avant accord les UUIDv7 vieux (>30 min) ou futurs (>5 min), les doublons et les admissions dont le stockage est saturé, verrouillé, illisible, incomplet ou non durable. Une demande interrompue exige un nouvel identifiant et un nouvel accord.

#### Scenario: AC: ancien consentement après redémarrage
<!-- openspec-guard:test="private restart > rejects a previously received drop after restart before any consent can be reused" -->
- **WHEN** une demande reçue avant arrêt est présentée au Node redémarré
- **THEN** elle est refusée sans nouvelle exécution ni remise en attente d'un ancien consentement

#### Scenario: AC: demande périmée ou future
<!-- openspec-guard:test="bounded received drops > rejects stale and future identifiers before writing a marker" -->
- **WHEN** une nouvelle demande porte un UUIDv7 plus vieux que 30 minutes ou avancé de plus de 5 minutes
- **THEN** le Node la refuse avant création d'une demande d'accord

#### Scenario: AC: marqueurs bornés après redémarrage
<!-- openspec-guard:test="bounded received drops > prunes old markers and rejects them after restart and clock rollback" -->
- **WHEN** des marqueurs périmés existent et le Node redémarre puis reçoit une demande récente
- **THEN** les marqueurs périmés sont supprimés et la demande est traitée sans réutiliser un ancien accord

#### Scenario: AC: retour d'horloge
<!-- openspec-guard:test="bounded received drops > prunes old markers and rejects them after restart and clock rollback" -->
- **WHEN** l'horloge locale recule après la suppression de marqueurs périmés
- **THEN** un identifiant déjà supprimé reste refusé, y compris après redémarrage

#### Scenario: AC: stockage anti-rejeu saturé
<!-- openspec-guard:test="bounded received drops > refuses another claim at the marker cap" -->
- **WHEN** 16 384 marqueurs non expirés occupent le stockage
- **THEN** le Node refuse une demande supplémentaire avec `E_RATE`, sans accord ni exécution

#### Scenario: AC: état anti-rejeu corrompu
<!-- openspec-guard:test="bounded received drops > fails closed when replay clock state is corrupt" -->
- **WHEN** la marque d'horloge persistante est corrompue
- **THEN** le Node refuse les nouvelles demandes sans consentement ni exécution

#### Scenario: AC: admission concurrente
<!-- openspec-guard:test="bounded received drops > refuses a claim while another process owns the replay lock" -->
- **WHEN** un autre processus possède le verrou d'admission du même `DROP_HOME`
- **THEN** le Node refuse la nouvelle demande sans ajouter de marqueur

#### Scenario: AC: même identifiant sous deux casses
<!-- openspec-guard:test="bounded received drops > treats lowercase and uppercase UUIDv7 as the same claim" -->
- **WHEN** le même UUIDv7 est reçu en minuscules puis en majuscules
- **THEN** le second envoi est refusé comme doublon, sans nouveau marqueur ni consentement

#### Scenario: AC: anciens marqueurs nil et max
<!-- openspec-guard:test="bounded received drops > deletes legacy nil and max UUID markers instead of blocking admission" -->
- **WHEN** le stockage contient un marqueur nil ou max accepté avant T3.1b
- **THEN** le Node le supprime et admet la nouvelle demande récente

#### Scenario: AC: fichiers étrangers dans le stockage
<!-- openspec-guard:test="bounded received drops > ignores operating system and foreign entries in the marker directory" -->
- **WHEN** `received-drops/` contient un fichier ou dossier dont le nom n'a pas la forme d'un UUID, comme `.DS_Store`
- **THEN** le Node l'ignore, sans le compter ni le supprimer, et continue d'admettre

#### Scenario: AC: verrou abandonné par ce processus
<!-- openspec-guard:test="bounded received drops > reclaims only its own replay lock and refuses an old foreign lock" -->
- **WHEN** le verrou d'admission porte le nonce du processus courant, sans admission synchrone en cours
- **THEN** le Node reprend ce verrou et traite la demande

#### Scenario: AC: verrou d'un autre processus
<!-- openspec-guard:test="bounded received drops > reclaims only its own replay lock and refuses an old foreign lock" -->
- **WHEN** le verrou porte un autre nonce, même s'il semble ancien
- **THEN** le Node refuse la demande sans toucher au verrou

#### Scenario: AC: verrou sans propriétaire
<!-- openspec-guard:test="bounded received drops > requires manual removal of an ownerless replay lock before admission resumes" -->
- **WHEN** un verrou sans propriétaire subsiste après un crash, même ancien
- **THEN** le Node refuse toute admission jusqu'au retrait manuel après arrêt de tous les processus qui partagent ce `DROP_HOME`

#### Scenario: AC: horloge anti-rejeu perdue
<!-- openspec-guard:test="bounded received drops > fails closed if the durable replay clock disappears after migration and pruning" -->
- **WHEN** le fichier d'horloge manque après une première admission T3.1b
- **THEN** le Node refuse toute nouvelle admission sans recréer une horloge initiale

#### Scenario: AC: marqueurs anti-rejeu perdus
<!-- openspec-guard:test="bounded received drops > fails closed if the marker directory disappears after a durable claim" -->
- **WHEN** le dossier des marqueurs manque après une première admission T3.1b
- **THEN** le Node refuse toute nouvelle admission sans recréer ce dossier

#### Scenario: AC: marqueur anti-rejeu isolé perdu
<!-- openspec-guard:test="bounded received drops > fails closed if one recent marker disappears while the directory remains" -->
- **WHEN** un marqueur récent est perdu alors que le dossier et l'horloge existent encore
- **THEN** le Node détecte l'écart avec l'empreinte durable et refuse toute nouvelle admission

#### Scenario: AC: version anti-rejeu perdue
<!-- openspec-guard:test="bounded received drops > fails closed if replay version and clock disappear while integrity remains" -->
- **WHEN** le fichier de version manque alors que l'horloge ou l'empreinte indique un stockage déjà utilisé
- **THEN** le Node refuse l'admission sans réinitialiser l'état anti-rejeu

#### Scenario: AC: doublon d'une demande terminée
<!-- openspec-guard:test="replay admission through the engine > answers a duplicate of a finished request with its recorded outcome" -->
- **WHEN** le même demandeur renvoie une demande déjà refusée ou échouée
- **THEN** le Node renvoie la même erreur, sans nouvel accord

#### Scenario: AC: identifiant actif réutilisé par un autre pair
<!-- openspec-guard:test="replay admission through the engine > refuses another peer reusing an active drop id without revealing its state" -->
- **WHEN** un autre pair envoie l'identifiant d'une demande active
- **THEN** il reçoit `E_DENIED` sans l'état de la demande

#### Scenario: AC: résultat réel après un refus de doublon
<!-- openspec-guard:test="end to end, in memory: relay and three nodes > a real result still lands after an overtaking refusal or a premature delivered status, and funding is released once" -->
- **WHEN** un refus de doublon ou un `drop_status` annonçant une livraison précède le vrai résultat
- **THEN** le demandeur enregistre le vrai résultat et libère le financement une seule fois

#### Scenario: AC: horloge anti-rejeu en avance
<!-- openspec-guard:test="replay admission through the engine > refuses a request after clock rollback with E_EXPIRED and logs that the replay clock is ahead" -->
- **WHEN** l'horloge persistante est en avance sur l'horloge du Node
- **THEN** la demande reçoit `E_EXPIRED` sans accord et le journal indique `replay_clock_ahead`

#### Scenario: AC: doublon d'une demande active
<!-- openspec-guard:test="replay admission through the engine > answers a duplicate of an active request with its current state" -->
- **WHEN** une demande encore en attente ou en cours est reçue une seconde fois du même demandeur
- **THEN** le Node répond par un `drop_status` portant l'état courant, sans nouvel accord

#### Scenario: AC: issue finale conservée chez le demandeur
<!-- openspec-guard:test="end to end, in memory: relay and three nodes > a late executor update cannot rewrite a finished outbound drop" -->
- **WHEN** un `drop_error` ou un `drop_status` arrive après l'issue finale d'une demande
- **THEN** le demandeur conserve l'issue déjà reçue

#### Scenario: AC: décision de relecture reçue deux fois
<!-- openspec-guard:test="end to end, in memory: relay and three nodes > records one result and receipt when the approver repeats a review decision concurrently" -->
- **WHEN** deux décisions de relecture pour la même demande arrivent pendant l'envoi du résultat
- **THEN** l'exécuteur n'émet qu'un résultat et un reçu

#### Scenario: AC: délai de relecture pendant l'envoi
<!-- openspec-guard:test="end to end, in memory: relay and three nodes > does not expire a review while its accepted result is being sent" -->
- **WHEN** la relecture acceptée est en cours d'envoi et son délai expire
- **THEN** l'exécuteur ne produit pas de reçu d'expiration contradictoire

### Requirement: Nettoyage des écritures anti-rejeu échouées
Le Node MUST supprimer le fichier temporaire d'une écriture durable échouée, afin qu'une panne répétée n'accumule pas de fichiers hors de la borne anti-rejeu.

#### Scenario: AC: échec répété de l'écriture durable
<!-- openspec-guard:test="replay clock write failures > does not accumulate temporary files when durable writes repeatedly fail" -->
- **WHEN** la synchronisation de l'horloge échoue plusieurs fois avant le renommage
- **THEN** le Node refuse chaque demande sans laisser de fichier temporaire supplémentaire

### Requirement: Mémoire des demandes exécutées bornée
Le Node MUST limiter à 1 024 les demandes reçues encore actives en mémoire. Dès qu'une issue est envoyée, il MUST libérer l'entrée complète ; il MAY conserver pendant au plus 30 minutes un résumé borné du refus pour répondre au même demandeur. La suppression de mémoire MUST NOT supprimer le marqueur anti-rejeu durable ni relancer une demande.

#### Scenario: AC: libération après issue
<!-- openspec-guard:test="replay admission through the engine > frees a delivered request without reopening its durable replay marker" -->
- **WHEN** une demande se termine par résultat, refus, expiration ou erreur
- **THEN** l'entrée contenant son entrée, sa configuration et ses outils sort de la mémoire active, tandis que son identifiant reste protégé contre le rejeu

#### Scenario: AC: doublon après libération
<!-- openspec-guard:test="replay admission through the engine > answers a duplicate of a finished request with its recorded outcome" -->
- **WHEN** le demandeur renvoie un identifiant terminé encore dans la fenêtre anti-rejeu
- **THEN** aucun nouvel accord n'est créé ; une erreur finale mémorisée peut être répétée au même demandeur, sans révéler son contenu à un autre pair

#### Scenario: AC: durée maximale du résumé de refus
<!-- openspec-guard:test="replay admission through the engine > expires a finished-error summary within 30 minutes even for a future UUIDv7" -->
- **WHEN** un refus concerne un UUIDv7 avancé de cinq minutes par rapport à l'horloge locale
- **THEN** son résumé mémoire disparaît au plus tard 30 minutes après le refus, sans modifier le marqueur durable

#### Scenario: AC: plafond de demandes actives
<!-- openspec-guard:test="replay admission through the engine > refuses another request before consent when active execution memory is full" -->
- **WHEN** 1 024 demandes reçues sont encore actives
- **THEN** une demande supplémentaire reçoit `E_RATE` avant accord ou exécution, sans évincer une demande active

### Requirement: Mémoire des demandes émises bornée
Le Node MUST conserver au plus 1 024 demandes émises en mémoire. Il MUST évincer d'abord les plus anciennes demandes terminées ; si toutes les places sont actives, il MUST refuser la nouvelle demande avec une erreur de capacité explicite sans créer de financement ni envoyer d'enveloppe. L'API locale MUST exposer cette saturation par HTTP 429.

#### Scenario: AC: historique local borné
<!-- openspec-guard:test="bounded requester memory > evicts the oldest finished drop while retaining every active drop" -->
- **WHEN** plus de 1 024 demandes sont émises et des issues terminées existent
- **THEN** le Node ne garde que 1 024 demandes au plus et préserve toutes celles qui sont encore actives

#### Scenario: AC: émission à capacité
<!-- openspec-guard:test="local API > reports requester capacity as E_RATE/429 for /drops and /ask" -->
- **WHEN** les 1 024 demandes émises sont encore actives
- **THEN** le Node refuse une nouvelle demande avec `E_RATE` et l'API locale répond HTTP 429 sans envoyer la demande ni prélever de financement

### Requirement: Boîte d'approbation bornée
Le Node MUST conserver au plus 1 024 cartes d'approbation ou de relecture reçues. Il MUST refuser une carte dont l'expiration est passée ou avance de plus de 15 minutes, et MUST refuser tout remplacement d'une carte encore visible portant le même `dropId`, même depuis un autre pair. Il MUST NOT évincer une carte encore valide pour accepter une autre carte. Une carte refusée MUST produire un diagnostic local sans contenu sensible.

#### Scenario: AC: saturation de la boîte d'approbation
<!-- openspec-guard:test="bounded transient node memory > refuses extra approval cards and excessive expiration without evicting a pending card" -->
- **WHEN** 1 024 cartes non expirées occupent la boîte d'approbation
- **THEN** une nouvelle carte est refusée sans effacer les cartes déjà visibles

#### Scenario: AC: expiration abusive d'une carte
<!-- openspec-guard:test="bounded transient node memory > refuses extra approval cards and excessive expiration without evicting a pending card" -->
- **WHEN** un pair envoie une carte dont `expiresAt` dépasse l'heure courante de plus de 15 minutes
- **THEN** le Node l'ignore sans l'ajouter à la boîte d'approbation

#### Scenario: AC: collision d'identifiant dans la boîte d'approbation
<!-- openspec-guard:test="bounded transient node memory > keeps the first approval and review when another paired peer reuses their drop ids" -->
- **WHEN** un pair envoie une approbation ou une relecture avec le `dropId` d'une carte déjà visible
- **THEN** la première carte, son émetteur et son contenu restent intacts ; le remplacement est refusé et diagnostiqué

### Requirement: File hors ligne bornée
Le Node MUST conserver au plus 1 024 enveloppes en attente de reconnexion, en comptant l'enveloppe dont l'envoi est en cours. Un seul vidage de file peut être actif à la fois. Il MUST purger les enveloppes expirées avant une nouvelle mise en file ; à saturation il MUST abandonner l'enveloppe la plus ancienne et journaliser un code stable, sans laisser croître la mémoire. Une exception de transport MUST être traitée comme une panne hors ligne et diagnostiquée.

#### Scenario: AC: panne réseau prolongée
<!-- openspec-guard:test="bounded transient node memory > caps offline envelopes and logs the oldest envelope dropped at capacity" -->
- **WHEN** le relais reste indisponible pendant plus de 1 024 envois
- **THEN** la file reste sous son plafond et chaque perte par saturation est journalisée

#### Scenario: AC: ordre de la file pendant un vidage concurrent
<!-- openspec-guard:test="bounded transient node memory > requeues an older envelope ahead of newer sends during a concurrent flush" -->
- **WHEN** une ancienne enveloppe échoue à nouveau pendant qu'un envoi plus récent rejoint la file
- **THEN** l'ancienne garde sa place chronologique et reste la première à être renvoyée ou abandonnée à saturation

#### Scenario: AC: vidages concurrents et plafond global
<!-- openspec-guard:test="bounded transient node memory > serializes concurrent flushes and counts the held send against outbox capacity" -->
- **WHEN** deux vidages démarrent pendant qu'un envoi est suspendu et que la file se remplit
- **THEN** une seule copie part au transport et les enveloppes retenues, y compris celle en vol, restent sous le plafond

#### Scenario: AC: tentative unique par vidage
<!-- openspec-guard:test="bounded transient node memory > attempts each queued envelope once per flush even when an older one is requeued" -->
- **WHEN** plusieurs enveloppes sont en file et la première est replacée après un nouvel échec
- **THEN** chacune est tentée une seule fois pendant ce vidage et reste disponible pour un prochain essai

#### Scenario: AC: transport qui échoue après accord
<!-- openspec-guard:test="replay admission through the engine > does not strand an approved request when transport throws on status" -->
- **WHEN** le transport rejette l'envoi d'un statut après une décision `allow_once`
- **THEN** le Node n'abandonne pas la demande dans un état intermédiaire retenu indéfiniment

### Requirement: Refus explicite du relais côté demandeur
Le Node MUST traiter `E_RATE`, `E_QUEUE_FULL` ou l'indisponibilité du relais à la demande initiale comme une non-livraison. Il MUST retirer l'entrée locale active, demander la révocation de la clé plafonnée créée pour cette demande et exposer `E_RATE` à l'appelant ; une demande initiale non livrée MUST NOT rester dans la file volatile, et aucun résultat tardif ne doit recréer une demande effacée.

#### Scenario: AC: relais refuse la demande initiale
<!-- openspec-guard:test="bounded requester memory > releases funding and active memory when the relay returns E_RATE" -->
- **WHEN** le relais refuse un `drop_request` avec `E_RATE` ou `E_QUEUE_FULL`
- **THEN** la demande n'occupe pas une place active, une révocation de la clé plafonnée est déclenchée une fois et l'API locale répond 429 ; un échec fournisseur passe en reprise bornée

#### Scenario: AC: relais indisponible à la demande initiale
<!-- openspec-guard:test="bounded requester memory > does not leave an offline drop request in volatile memory" -->
- **WHEN** le relais est hors ligne au moment d'émettre une nouvelle demande
- **THEN** la demande est retirée, la révocation de sa clé plafonnée est déclenchée, l'API locale répond 429 et aucun `drop_request` volatile ne reste en file

#### Scenario: AC: refus temporaire au vidage de file
<!-- openspec-guard:test="bounded transient node memory > keeps a queued envelope after a temporary relay refusal on flush" -->
- **WHEN** le relais répond `E_RATE` ou `E_QUEUE_FULL` à une enveloppe déjà en file
- **THEN** le Node garde l'enveloppe jusqu'à son expiration et journalise le refus, sans la perdre silencieusement

#### Scenario: AC: enveloppe initiale trop grande
<!-- openspec-guard:test="bounded requester memory > releases funding and active memory when the initial envelope is too large" -->
- **WHEN** la demande initiale dépasse la taille maximale de l'enveloppe avant envoi au relais
- **THEN** la demande locale est retirée, la révocation de la clé plafonnée est déclenchée et l'API locale répond `E_TOO_LARGE` sans fausse réussite ni place active immobilisée

#### Scenario: AC: enveloppe trop grande via /ask
<!-- openspec-guard:test="local API > reports requester capacity as E_RATE/429 for /drops and /ask" -->
- **WHEN** une demande routée par `/ask` dépasse la taille maximale de l'enveloppe
- **THEN** l'API locale répond HTTP 413 avec `E_TOO_LARGE` et indique les routes éventuellement déjà émises

### Requirement: Révocation différée des clés plafonnées
Si la révocation échoue, le Node MUST conserver uniquement le hash de la clé en mémoire, réessayer avec délai et journaliser sans secret jusqu'à confirmation ou expiration après deux heures. Il MUST limiter à 8 192 les clés et créations en cours, réserver une place avant l'appel fournisseur, refuser un doublon ou un dépassement avec `E_RATE` avant cet appel et libérer la place si la création échoue.

#### Scenario: AC: révocation différée après refus du relais
<!-- openspec-guard:test="OpenRouter capped keys > retries a failed deletion on node ticks after relay refusal" -->
- **WHEN** le relais refuse la demande puis le fournisseur échoue à révoquer sa clé plafonnée
- **THEN** le Node libère la place de la demande, conserve seulement le hash pour une nouvelle tentative bornée et réessaie sans attendre une autre demande

#### Scenario: AC: plafond des révocations en attente
<!-- openspec-guard:test="OpenRouter capped keys > refuses to mint beyond the pending-key cap before contacting the provider" -->
- **WHEN** 8 192 clés plafonnées non expirées attendent encore leur fin ou une révocation confirmée
- **THEN** aucune clé supplémentaire n'est créée, `E_RATE` est retourné et une place se libère après leur expiration automatique

#### Scenario: AC: créations plafonnées simultanées
<!-- openspec-guard:test="OpenRouter capped keys > reserves pending-key capacity before concurrent provider calls and refuses duplicate drop ids" -->
- **WHEN** plusieurs créations sont en cours avant la réponse du fournisseur et que le plafond est atteint
- **THEN** les suivantes et le doublon d'une demande sont refusés avant tout autre appel fournisseur

#### Scenario: AC: réservation libérée après refus fournisseur
<!-- openspec-guard:test="OpenRouter capped keys > frees a reserved key slot when the provider rejects creation" -->
- **WHEN** le fournisseur refuse la création d'une clé plafonnée
- **THEN** la réservation est libérée et une demande ultérieure peut créer sa clé

### Requirement: Raccordement local contrôlé des agents
Le Node SHALL analyser uniquement les configurations des quatre adaptateurs connus et proposer, par agent, un état et l'ajout précis du connecteur MCP drop. Cette analyse MUST NOT exécuter un serveur MCP, scanner le disque ou contacter le réseau. L'aperçu MUST exclure les valeurs de secrets, arguments et en-têtes existants. Une configuration illisible ou invalide produit une erreur pour cet agent, jamais une configuration vide de remplacement.

#### Scenario: AC-CONNECT-01 — analyse bornée et expurgée
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-01 analyzes known adapters without exposing secret values" -->
- **WHEN** les quatre adaptateurs déclarent des serveurs avec des valeurs secrètes
- **THEN** l'analyse lit seulement leurs emplacements connus, n'exécute aucun serveur et ne renvoie aucune valeur sensible

#### Scenario: AC-CONNECT-04 — erreur par agent sans écrasement
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-04 and AC-CONNECT-05 refuses malformed and changed files without overwriting" -->
- **WHEN** une configuration est invalide, une CLI manque ou l'accès est refusé
- **THEN** cet agent reçoit une erreur explicite et sa configuration reste intacte

Le Node MUST exiger une empreinte correspondant à l'aperçu confirmé avant chaque modification. Une entrée drop identique est sans effet ; une entrée différente est un conflit visible. Il MUST ne modifier que l'entrée drop annoncée et ne publier aucune capacité. Les écritures de fichiers MUST préserver les autres entrées et utiliser une sauvegarde locale privée bornée ; la déconnexion MUST retirer seulement l'entrée drop qu'il a installée.

#### Scenario: AC-CONNECT-02 — sélection confirmée sans publication
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-02 and AC-CONNECT-03 changes only the selected entry, then becomes idempotent" -->
- **WHEN** le propriétaire confirme une sélection d'agents après l'aperçu
- **THEN** seules les entrées drop annoncées pour cette sélection changent et aucune capacité n'est publiée

#### Scenario: AC-CONNECT-03 — répétition et conflit
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-03 refuses an existing entry with different settings" -->
- **WHEN** l'installation est répétée, puis rencontre une entrée drop différente
- **THEN** la répétition n'écrit rien et l'entrée différente n'est pas remplacée silencieusement

#### Scenario: AC-CONNECT-05 — modification concurrente ou interruption
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-05 preserves a competing write during the JSON transaction" -->
- **WHEN** une configuration change après l'aperçu ou une écriture s'interrompt
- **THEN** le Node arrête l'action de cet agent et conserve le contenu tiers, avec une sauvegarde privée exploitable

#### Scenario: AC-CONNECT-06 — déconnexion sélective
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-06 removes only the owned entry after a third-party addition" -->
- **WHEN** un tiers ajoute une autre entrée après le raccordement
- **THEN** la déconnexion retire seulement drop et conserve l'ajout tiers

### Requirement: Découverte sur le réseau local
En mode local actif, le Node SHALL annoncer le service `_drop._tcp` sous un nom aléatoire, avec un jeton tournant que seuls ses pairs reconnaissent, et jamais son identifiant ; il SHALL découvrir les annonces de ses pairs. Il MUST ignorer toute adresse annoncée qui n'est pas privée ; une adresse de bouclage n'est retenue que dans les tests et le banc de simulation. Il MUST borner le nombre d'annonces retenues.

#### Scenario: AC: adresses publiques ignorées
<!-- openspec-guard:test="local network (T4.2) > keeps only private addresses from discovery, loopback only when allowed" -->
- **WHEN** une annonce porte une adresse publique, une adresse de bouclage et une adresse privée
- **THEN** seule l'adresse privée est retenue

#### Scenario: AC: annonce tournante
<!-- openspec-guard:test="local network privacy (T4.2c) > announces only a rotating tag that paired peers recognize, never the node id" -->
- **WHEN** un nœud annonce son service pendant deux époques de 15 minutes
- **THEN** l'annonce ne contient pas son identifiant, son nom et son jeton changent, un pair qui a sa clé le reconnaît et un inconnu non

### Requirement: Session locale authentifiée
Une session locale SHALL commencer par un défi signé dans les deux sens avec la clé Ed25519 annoncée ; aucune enveloppe MUST NOT être traitée avant les deux preuves. En sortie, le Node MUST NOT ouvrir de session que vers un pair appairé ou l'inviteur d'un code en cours, et l'identifiant prouvé MUST être celui visé. En entrée, il MUST refuser une clé inconnue hors invitation en cours.

#### Scenario: AC: imposteur refusé
<!-- openspec-guard:test="local network (T4.2) > refuses a peer whose proof does not match the announced or expected key" -->
- **WHEN** un pair annonce l'identifiant d'un autre ou ne prouve pas sa clé
- **THEN** la session est fermée sans qu'aucune enveloppe ne passe

#### Scenario: AC: clé inconnue refusée hors invitation
<!-- openspec-guard:test="local network (T4.2) > refuses an unknown key when no invite is live" -->
- **WHEN** une clé ni appairée ni en cours d'appairage ouvre une session et qu'aucune invitation n'est en cours
- **THEN** la session est fermée avec `E_LAN_UNKNOWN` et rien n'est transmis au moteur

### Requirement: Robustesse de l'écoute locale
Une trame trop grande, hors schéma ou trop fréquente SHALL fermer la seule session concernée, jamais le Node. Le nombre de connexions et de sessions MUST être borné ; une adresse injoignable MUST se traduire par un échec d'envoi local, sans exception non rattrapée.

#### Scenario: AC: trames invalides sans arrêt du Node
<!-- openspec-guard:test="local network (T4.2) > survives malformed, oversized and early frames, and dead addresses" -->
- **WHEN** un client envoie une trame de 600 Kio, puis du texte hors JSON, et qu'un pair annoncé ne répond pas
- **THEN** ces sessions sont fermées, l'envoi rend `unreachable` et le Node accepte encore une session valide

### Requirement: Chemin local préféré
Une enveloppe vers un pair joignable par une session locale authentifiée SHALL passer par elle ; sinon le Node SHALL utiliser le relais configuré, et sinon la file d'envoi. Une enveloppe ne MUST compter comme remise localement qu'après un accusé signé par la clé du destinataire ; sans cet accusé, le Node SHALL passer au relais.

#### Scenario: AC: échange sans relais
<!-- openspec-guard:test="local network (T4.2) > completes a consented drop between two paired nodes with no relay at all" -->
- **WHEN** deux Nodes appairés se découvrent localement et qu'aucun relais n'est joignable
- **THEN** une demande, sa décision et son résultat circulent par la session locale

#### Scenario: AC: accusé signé exigé
<!-- openspec-guard:test="local network (T4.2) > counts an envelope as delivered only after the peer signed its acknowledgement" -->
- **WHEN** l'accusé de réception d'une enveloppe n'est pas signé par la clé du destinataire
- **THEN** l'envoi local rend `unreachable` et la session est fermée

### Requirement: Mode local refusé ou désactivé
Si le système refuse l'accès au réseau local ou si l'écoute est impossible, le Node SHALL journaliser `E_LAN_DENIED` et continuer par le relais. Avec `lan: false` dans sa configuration, il MUST n'écouter ni n'annoncer quoi que ce soit sur le réseau local.

#### Scenario: AC: mode local désactivé
<!-- openspec-guard:test="local network (T4.2) > neither listens nor announces when the local mode is off" -->
- **WHEN** le Node démarre avec `lan: false`
- **THEN** aucun port local n'est ouvert pour le réseau et aucune annonce n'est faite

#### Scenario: AC: écoute impossible
<!-- openspec-guard:test="local network (T4.2) > reports E_LAN_DENIED and keeps going when the local port cannot be opened" -->
- **WHEN** le port local est déjà pris au démarrage
- **THEN** le Node journalise `E_LAN_DENIED`, son état local est `denied` et le démarrage continue

### Requirement: Réponse à la main par l'approbateur
Sur une carte d'approbation en attente, le Node de l'approbateur SHALL permettre de répondre à la main par un `HumanAnswer`, ce qui vaut consentement pour cette seule demande. Il MUST valider la réponse et y chercher des secrets avant tout envoi ; un refus laisse la carte en attente. La route locale `POST /ui/answer` MUST refuser avec un code stable, et `/ui/pending` MUST nommer l'exécuteur d'après les pairs locaux.

#### Scenario: AC: réponse livrée avec le même reçu
<!-- openspec-guard:test="human answer (T4.3) > delivers a hand-written answer with the same consent and a receipt marked human" -->
- **WHEN** l'approbateur répond « Le déploiement est prévu jeudi » à une demande en attente
- **THEN** le demandeur reçoit ce texte, la capacité n'est pas exécutée et le reçu signé porte `answeredBy: 'human'`

#### Scenario: AC: secret bloqué avant envoi
<!-- openspec-guard:test="human answer (T4.3) > refuses a hand-written answer that carries a secret, before anything is sent" -->
- **WHEN** la réponse contient une clé d'API reconnue
- **THEN** le Node refuse avec `E_SECRET_DETECTED`, rien n'est envoyé et la carte reste en attente pour une correction

#### Scenario: AC: route locale de réponse
<!-- openspec-guard:test="human answer (T4.3) > answers by hand through the panel route, which refuses an empty or oversized answer" -->
- **WHEN** le panneau envoie à `POST /ui/answer` une réponse vide, mal formée, au nom trop long, trop grosse ou dépassant le corps permis, puis valide
- **THEN** chacune est refusée avec son code (`E_SCHEMA`, `E_TOO_LARGE`, 413 pour le corps) et la dernière est livrée ; `/ui/pending` nomme l'exécuteur d'après les pairs locaux

### Requirement: Contrôle de la réponse humaine par l'exécuteur
L'exécuteur MUST n'accepter `human_answer` que d'un approbateur de la carte pour un Drop en `awaiting_approval`, refaire la validation et la recherche de secrets, livrer sans exécuter la capacité et écrire le reçu signé. Un refus MUST ne rien dire au demandeur du contenu refusé.

#### Scenario: AC: seul l'approbateur répond
<!-- openspec-guard:test="human answer (T4.3) > accepts a hand-written answer from a remote approver and from no one else" -->
- **WHEN** un pair qui n'est pas approbateur envoie `human_answer`, puis l'approbateur distant le fait, puis un nœud approbateur qui a sauté le contrôle envoie un secret
- **THEN** le premier est ignoré, seule la réponse de l'approbateur est livrée, et le secret est refusé par l'exécuteur avec un message qui n'en dit rien

### Requirement: Publication d'un fait
Le Node SHALL permettre au propriétaire de publier, modifier (nouvelle révision signée) et retirer un fait. Il MUST refuser un fait qui contient un secret reconnu, garder les faits sous `DROP_HOME` en mode `0600` et garder la trace d'un fait retiré.

#### Scenario: AC: publication et stockage
<!-- openspec-guard:test="published facts (T4.4) > publishes, edits and retires a signed fact, refuses a secret, and keeps facts privately on disk" -->
- **WHEN** le propriétaire publie un fait, le modifie, tente d'en publier un avec une clé d'API, puis le retire
- **THEN** la révision augmente et la signature reste valide, le secret est refusé avec `E_SECRET_DETECTED`, le fait retiré reste listé, et `facts.json` est en mode `0600`

### Requirement: Service d'un fait sans décision
Le Node SHALL annoncer un fait seulement dans le catalogue des pairs de son public, tant qu'il est actif et non expiré, et le servir sans carte d'approbation avec un reçu signé. Il MUST refuser un fait retiré, expiré, hors public ou d'une ancienne révision par le même `E_SCHEMA` « Fait indisponible. », revérifier après chaque attente, limiter chaque pair à 10 faits par minute et ne jamais défaire un retrait ou une révision concurrente.

#### Scenario: AC: catalogue selon le public
<!-- openspec-guard:test="published facts (T4.4) > lists a fact only in the catalog of its audience" -->
- **WHEN** un fait est réservé à un pair choisi
- **THEN** seul ce pair le voit dans son catalogue

#### Scenario: AC: fait servi sans décision
<!-- openspec-guard:test="published facts (T4.4) > serves a fact without a decision, with a signed receipt marked fact" -->
- **WHEN** un pair du public demande un fait actif
- **THEN** il le reçoit sans carte d'approbation chez le propriétaire, et le compteur de service augmente

#### Scenario: AC: fait indisponible
<!-- openspec-guard:test="published facts (T4.4) > refuses a retired, expired, out-of-audience or outdated fact without saying which" -->
- **WHEN** le fait demandé est retiré, expiré, hors public ou d'une ancienne révision
- **THEN** le demandeur reçoit `E_SCHEMA` « Fait indisponible. » dans tous les cas

#### Scenario: AC: concurrence et débit
<!-- openspec-guard:test="published facts (T4.4) > keeps a retire made while a fact is being served, and limits fact requests per peer" -->
- **WHEN** le propriétaire retire un fait pendant qu'il est servi, un retrait et une modification partent ensemble, puis un pair demande onze faits en une minute
- **THEN** le retrait tient, une seule des deux actions gagne, et la onzième demande reçoit `E_RATE`

#### Scenario: AC: stockage illisible
<!-- openspec-guard:test="published facts (T4.4) > serves no fact from an unreadable store, keeps the catalog, and mints no capped key for a fact" -->
- **WHEN** `facts.json` devient illisible, et qu'un demandeur qui paie demande un fait
- **THEN** aucun fait n'est servi mais les capacités restent au catalogue, et aucune clé plafonnée n'est créée pour un fait

### Requirement: Contrôle d'un fait reçu
Le Node demandeur MUST vérifier qu'un fait reçu est signé par l'exécuteur, qu'il correspond à la carte demandée et qu'il n'est pas expiré, et refuser l'empreinte d'un fait pour une capacité qui n'en est pas un ; sinon il MUST le rejeter avec `E_OUTPUT_INVALID`.

#### Scenario: AC: fait reçu invalide
<!-- openspec-guard:test="published facts (T4.4) > rejects at the requester a fact whose signature or validity does not hold" -->
- **WHEN** un exécuteur renvoie un fait mal signé ou expiré
- **THEN** le demandeur n'en garde aucun résultat et enregistre `E_OUTPUT_INVALID`

### Requirement: Fait servi par ask_team
« Demander à mon équipe » SHALL demander d'abord, trois au plus, les faits en ligne dont un mot-clé ou le sujet d'au moins trois lettres figure dans la question, sans modèle ; sinon le routage habituel s'applique. Les routes locales SHALL permettre de lister, publier, modifier et retirer.

#### Scenario: AC: question servie par un fait
<!-- openspec-guard:test="published facts (T4.4) > answers ask_team with a fact whose keyword appears in the question, before any capability" -->
- **WHEN** une question contient un mot-clé d'un fait visible
- **THEN** ce fait est demandé et servi sans décision, avant toute capacité

#### Scenario: AC: termes de routage ignorés
<!-- openspec-guard:test="published facts (T4.4) > ignores routing terms too short or in another script, and offline facts" -->
- **WHEN** un fait n'a que des mots-clés d'une ou deux lettres, en emoji ou dans une autre écriture, ou que son propriétaire est hors ligne
- **THEN** il ne capte pas la question

#### Scenario: AC: routes locales des faits
<!-- openspec-guard:test="published facts (T4.4) > manages facts through the panel routes" -->
- **WHEN** le panneau liste, publie, modifie puis retire un fait par les routes locales
- **THEN** chaque action aboutit et un refus porte son code

### Requirement: Treize clients MCP détectés sans modèle
Le Node SHALL reconnaître les treize clients de D55 par leurs emplacements documentés, en JSON, JSONC, TOML ou YAML, et lister pour chacun s'il est installé, si drop y est raccordé et quels serveurs MCP il déclare, sans jamais afficher de valeur secrète. Un client MUST être dit installé par son application, son binaire ou son extension, jamais par un dossier de configuration seul.

#### Scenario: AC: lecture des treize clients
<!-- openspec-guard:test="mcp clients (T4.5) > reads each client's documented global configuration, including JSONC, TOML and YAML, without any secret value" -->
- **WHEN** chaque client a sa configuration globale avec un serveur portant un secret
- **THEN** l'analyse liste le serveur pour chacun, avec seulement des noms et des hôtes

#### Scenario: AC: installation prouvée
<!-- openspec-guard:test="mcp clients (T4.5) > tells an installed client by its app or binary, never by a configuration folder alone" -->
- **WHEN** seuls les dossiers de configuration de Zed, goose, Devin et Gemini existent
- **THEN** ces clients sont dits absents, et présents dès que leur application ou leur binaire existe

### Requirement: Configurations par projet
Le Node SHALL lire les configurations par projet seulement dans les projets que Claude Code et Codex connaissent déjà et dans les dossiers ajoutés depuis le panneau (50 au plus, ni la racine ni le dossier personnel), sans jamais parcourir le disque, et MUST ne lire que des fichiers réguliers de 1 Mio au plus.

#### Scenario: AC: projets connus ou ajoutés
<!-- openspec-guard:test="mcp clients (T4.5) > lists project configurations only for known or added projects, never by scanning the disk" -->
- **WHEN** un projet connu de Claude Code, un projet connu de Codex, un dossier ajouté et un dossier inconnu portent des configurations, l'une étant un lien vers `/dev/zero`
- **THEN** seuls les trois premiers apparaissent, le lien est ignoré sans attente, et le dossier personnel n'est jamais un projet

### Requirement: Raccordement par outil officiel ou à la main
Le Node SHALL raccorder Gemini CLI et VS Code par leurs commandes officielles, et Cline par son fichier JSON, avec relecture, empreinte et sauvegarde comme en T3.3. Pour OpenCode, Devin Desktop, Zed, goose, Roo Code et JetBrains AI, il MUST ne rien écrire et fournir une configuration à copier au format du client avec la marche à suivre.

#### Scenario: AC: raccordement automatique vérifié
<!-- openspec-guard:test="mcp clients (T4.5) > connects Gemini CLI and VS Code through their official commands and Cline through its file, then verifies" -->
- **WHEN** le propriétaire raccorde Gemini CLI, VS Code et Cline
- **THEN** les commandes officielles sont lancées, le fichier de Cline est écrit, et chaque résultat est relu ; une commande sans effet donne `E_CLI_UNVERIFIED`

#### Scenario: AC: configuration à copier
<!-- openspec-guard:test="mcp clients (T4.5) > offers a client-specific copyable configuration where no safe automatic connection exists" -->
- **WHEN** l'analyse trouve OpenCode, Zed, goose ou JetBrains AI
- **THEN** leur état est `manual`, rien n'est écrit, et l'extrait suit le format du client

### Requirement: Inviteur trouvable pendant l'invitation
Tant qu'une invitation court, le Node SHALL ajouter à son annonce un jeton tiré du code à usage unique, que seul le détenteur du code reconnaît ; ce jeton MUST disparaître quand l'invitation expire ou est utilisée.

#### Scenario: AC: invitation reconnue puis oubliée
<!-- openspec-guard:test="local network privacy (T4.2c) > lets the invitee find the inviter through the invite only while it is live" -->
- **WHEN** l'invité cherche l'inviteur pendant puis après l'invitation
- **THEN** il le trouve pendant, plus après

### Requirement: Clé de découverte partagée avec les pairs
Le Node SHALL tirer une clé de découverte de 32 octets, la garder sous `DROP_HOME` en mode `0600` et l'envoyer chiffrée, par `lan_key`, à chaque pair à l'appairage, aux pairs présentés par l'équipe et à chaque démarrage. Il MUST n'accepter une clé que d'un pair connu, pour lui-même, et garder les clés des pairs à part, en `0600`.

#### Scenario: AC: clé partagée et privée
<!-- openspec-guard:test="local network privacy (T4.2c) > shares its discovery key with each paired peer and keeps it private on disk" -->
- **WHEN** deux nœuds s'appairent, puis qu'un inconnu envoie une clé
- **THEN** chacun garde la clé de l'autre dans un fichier `0600`, et la clé de l'inconnu est ignorée

### Requirement: Reprise après un refus passager
Après un refus de la découverte ou de l'écoute locale, le Node SHALL réessayer à 30 s, 1 min, 2 min puis toutes les 5 min, repasser à `on` dès que ça marche et journaliser chaque changement d'état.

#### Scenario: AC: reprise
<!-- openspec-guard:test="local network privacy (T4.2c) > recovers from a passing refusal with growing delays" -->
- **WHEN** la découverte échoue deux fois puis réussit
- **THEN** l'état passe de `denied` à `on`, après des délais croissants

### Requirement: Silence envers une connexion sans secret
Sur une session locale, le Node qui se connecte SHALL d'abord prouver qu'il détient la clé de découverte du nœud visé ou le jeton d'une invitation en cours ; le nœud joint MUST ne rien envoyer, ni identifiant ni raison de fermeture, tant que cette preuve manque, et le nœud qui se connecte MUST ne dire qui il est qu'après une réponse prouvant le même secret.

#### Scenario: AC: rien pour un inconnu
<!-- openspec-guard:test="local network privacy (T4.2c) > says nothing to a connection that cannot knock with a key it holds" -->
- **WHEN** une connexion se tait, frappe avec un mauvais secret ou dit bonjour d'emblée, puis qu'un nœud rejoue le jeton d'un pair à sa propre adresse
- **THEN** la connexion ne reçoit rien, et le nœud qui appelle ce faux pair n'envoie jamais son identifiant

### Requirement: Voie Internet par iroh
Le Node SHALL pouvoir joindre un pair par iroh quand le mode Internet est actif : programme `drop-iroh` avec la même clé que l'identité drop, sans annuaire ni relais n0 sauf choix explicite. Une enveloppe ne MUST compter comme remise qu'après un accusé signé par la clé du destinataire. Le programme MUST refuser la connexion d'un nœud qui n'est ni pair ni en appairage, sauf pendant une invitation vivante (D60).

#### Scenario: AC: identité iroh issue de drop
<!-- openspec-guard:test="internet (T4.2b) > derives the iroh identity from the drop key, so the iroh id is the drop node id" -->
- **WHEN** le programme démarre avec la graine d'une identité drop
- **THEN** son identifiant iroh est l'identifiant drop

#### Scenario: AC: échange direct avec accusé
<!-- openspec-guard:test="internet (T4.2b) > delivers an envelope directly between two nodes with no relay, with a signed acknowledgement" -->
- **WHEN** deux pairs connaissent leurs adresses directes et qu'aucun relais n'est configuré
- **THEN** une enveloppe passe par iroh et compte comme remise après l'accusé signé

#### Scenario: AC: non-pair refusé
<!-- openspec-guard:test="internet (T4.2b) > refuses a connection from a node that is not a paired peer" -->
- **WHEN** un nœud qui n'est pas un pair se connecte sans invitation vivante et envoie une enveloppe, ou qu'un pair envoie une enveloppe signée par un autre
- **THEN** rien n'est transmis au moteur et l'envoi échoue chez lui

#### Scenario: AC: échec expliqué
<!-- openspec-guard:test="internet (T4.2b) > explains the failure when no path exists without a relay" -->
- **WHEN** aucun chemin direct n'existe et aucun relais n'est configuré
- **THEN** l'envoi iroh échoue avec `E_IROH_NO_PATH`, la voie suivante est essayée et l'état explique qu'il faut un relais

### Requirement: Adresses iroh partagées entre pairs
Le Node SHALL envoyer à chaque pair, chiffrées, ses adresses iroh au démarrage et à chaque changement, et les mettre dans ses invitations. Il MUST n'accepter que celles d'un pair connu pour lui-même, relais en https (http seulement en boucle locale), 8 adresses directes au plus, gardées en `0600`.

#### Scenario: AC: adresses partagées
<!-- openspec-guard:test="internet (T4.2b) > shares its iroh addresses with each paired peer and keeps only valid ones" -->
- **WHEN** un pair envoie ses adresses, un autre un relais en http public, et qu'une invitation est utilisée
- **THEN** l'adresse valide est gardée, celle en http public refusée, et l'invité connaît les adresses de l'hôte avant tout relais drop

### Requirement: Retour de connexion OAuth sur l'API locale
L'API locale SHALL accepter `GET /oauth/callback?state=…&code=…` sans jeton mais seulement avec son en-tête `Host`, et MUST n'échanger le code que pour une connexion en cours dont le `state`, à usage unique, a moins de 10 min (T2.17, D74). La page de réponse n'autorise aucune ressource. `POST /ui/admin/connect { agent, server }`, derrière le jeton, ouvre la connexion dans le navigateur (macOS, https seulement). Un refus de partage pour OAuth porte `E_SHARE_OAUTH`.

#### Scenario: Retour du navigateur
<!-- openspec-guard:test="remote MCP servers behind OAuth (T2.17) > takes the sign-in callback on the local API without its token, for a pending state only" -->
- **WHEN** le navigateur revient avec un `state` en cours, un `state` inconnu, sans code, avec un refus, ou par un autre hôte
- **THEN** seul le premier échange le code ; les autres reçoivent une page d'erreur ou 401, et `/ui/admin/connect` exige le jeton
