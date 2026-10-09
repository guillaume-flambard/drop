# Spec Delta

## ADDED Requirements

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
Le Node MUST conserver au plus 1 024 cartes d'approbation ou de relecture reçues. Il MUST refuser une carte dont l'expiration est passée ou avance de plus de 15 minutes, et ne MUST NOT évincer une carte encore valide pour accepter une autre carte. Une carte refusée MUST produire un diagnostic local sans contenu sensible.

#### Scenario: AC: saturation de la boîte d'approbation
<!-- openspec-guard:test="bounded transient node memory > refuses extra approval cards and excessive expiration without evicting a pending card" -->
- **WHEN** 1 024 cartes non expirées occupent la boîte d'approbation
- **THEN** une nouvelle carte est refusée sans effacer les cartes déjà visibles

#### Scenario: AC: expiration abusive d'une carte
<!-- openspec-guard:test="bounded transient node memory > refuses extra approval cards and excessive expiration without evicting a pending card" -->
- **WHEN** un pair envoie une carte dont `expiresAt` dépasse l'heure courante de plus de 15 minutes
- **THEN** le Node l'ignore sans l'ajouter à la boîte d'approbation

### Requirement: File hors ligne bornée
Le Node MUST conserver au plus 1 024 enveloppes en attente de reconnexion. Il MUST purger les enveloppes expirées avant une nouvelle mise en file ; à saturation il MUST abandonner l'enveloppe la plus ancienne et journaliser un code stable, sans laisser croître la mémoire. Une exception de transport MUST être traitée comme une panne hors ligne et diagnostiquée.

#### Scenario: AC: panne réseau prolongée
<!-- openspec-guard:test="bounded transient node memory > caps offline envelopes and logs the oldest envelope dropped at capacity" -->
- **WHEN** le relais reste indisponible pendant plus de 1 024 envois
- **THEN** la file reste sous son plafond et chaque perte par saturation est journalisée

#### Scenario: AC: transport qui échoue après accord
<!-- openspec-guard:test="replay admission through the engine > does not strand an approved request when transport throws on status" -->
- **WHEN** le transport rejette l'envoi d'un statut après une décision `allow_once`
- **THEN** le Node n'abandonne pas la demande dans un état intermédiaire retenu indéfiniment

### Requirement: Refus explicite du relais côté demandeur
Le Node MUST traiter `E_RATE`, `E_QUEUE_FULL` ou l'indisponibilité du relais à la demande initiale comme une non-livraison. Il MUST retirer l'entrée locale active, libérer la clé plafonnée créée pour cette demande et exposer `E_RATE` à l'appelant ; une demande initiale non livrée MUST NOT rester dans la file volatile, et aucun résultat tardif ne doit recréer une demande effacée.

#### Scenario: AC: relais refuse la demande initiale
<!-- openspec-guard:test="bounded requester memory > releases funding and active memory when the relay returns E_RATE" -->
- **WHEN** le relais refuse un `drop_request` avec `E_RATE` ou `E_QUEUE_FULL`
- **THEN** la demande n'occupe pas une place active, la clé plafonnée est libérée une fois et l'API locale répond 429

#### Scenario: AC: relais indisponible à la demande initiale
<!-- openspec-guard:test="bounded requester memory > does not leave an offline drop request in volatile memory" -->
- **WHEN** le relais est hors ligne au moment d'émettre une nouvelle demande
- **THEN** la demande et sa clé plafonnée sont libérées, l'API locale répond 429 et aucun `drop_request` volatile ne reste en file

#### Scenario: AC: refus temporaire au vidage de file
<!-- openspec-guard:test="bounded transient node memory > keeps a queued envelope after a temporary relay refusal on flush" -->
- **WHEN** le relais répond `E_RATE` ou `E_QUEUE_FULL` à une enveloppe déjà en file
- **THEN** le Node garde l'enveloppe jusqu'à son expiration et journalise le refus, sans la perdre silencieusement

#### Scenario: AC: enveloppe initiale trop grande
<!-- openspec-guard:test="bounded requester memory > releases funding and active memory when the initial envelope is too large" -->
- **WHEN** la demande initiale dépasse la taille maximale de l'enveloppe avant envoi au relais
- **THEN** la demande locale et la clé plafonnée sont libérées, et l'API locale répond `E_TOO_LARGE` sans fausse réussite ni place active immobilisée
