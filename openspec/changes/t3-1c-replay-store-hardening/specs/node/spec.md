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
