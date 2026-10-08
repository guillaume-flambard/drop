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
L'API locale MUST exiger un jeton aléatoire, écrit dans `DROP_HOME/local-token` en mode `0600` et présenté dans l'en-tête `Authorization: Bearer`. Toute requête sans jeton valide MUST être refusée.

#### Scenario: AC: requête sans jeton refusée
- **WHEN** une requête arrive sur l'API locale sans en-tête `Authorization: Bearer <jeton>` valide
- **THEN** elle est refusée (test)

#### Scenario: Fichier du jeton
- **WHEN** `drop serve` crée le jeton
- **THEN** `DROP_HOME/local-token` existe en mode `0600`

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
Sur macOS, le Node SHALL émettre une notification via `osascript` avec le titre « {Nom} a besoin d'aide » et pour sous-titre le titre de la capacité ; un clic SHALL ouvrir l'UI locale.

#### Scenario: Notification émise
- **WHEN** une demande de Julie pour « Résumer les erreurs de production » arrive sur macOS
- **THEN** une notification « Julie a besoin d'aide » s'affiche avec ce sous-titre, et un clic ouvre l'UI locale

### Requirement: Pas de notification sous Linux
Sous Linux, le Node SHALL ne pas émettre de notification ; `drop pending` suffit.

#### Scenario: Linux
- **WHEN** une demande arrive sur un Node Linux
- **THEN** aucune notification n'est émise et la demande est visible par `drop pending`

### Requirement: Contenu exact de la carte de consentement
La carte SHALL afficher exactement ce contenu, dans cet ordre (ligne « Sensibilité haute » seulement si `high`) :

```text
{requestedBy.displayName} a besoin d'aide            via {agent}
{card.title}
« {inputPreview} »

Pourquoi : {purpose}

{displayName} recevra :            {receives[]}
{displayName} ne recevra jamais :  {neverReceives[]}
Sensibilité haute : vous relirez le résultat avant envoi.   (si high)

Expire dans {mm:ss}

[ Pas maintenant ]   [ Refuser ]   [ Autoriser une fois ]
```

#### Scenario: Ordre des éléments
- **WHEN** la carte d'une demande est rendue
- **THEN** les éléments apparaissent dans l'ordre : demandeur et agent, titre, aperçu de l'entrée, « Pourquoi », « recevra », « ne recevra jamais », sensibilité haute éventuelle, « Expire dans », puis les boutons « Pas maintenant », « Refuser », « Autoriser une fois »

#### Scenario: Ligne de sensibilité haute
- **WHEN** la capacité est `low`
- **THEN** la ligne « Sensibilité haute : vous relirez le résultat avant envoi. » est absente

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
