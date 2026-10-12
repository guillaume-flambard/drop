## MODIFIED Requirements

### Requirement: Refus explicite du relais côté demandeur
Le Node MUST traiter `E_RATE`, `E_QUEUE_FULL` ou l'indisponibilité du relais à la demande initiale comme une non-livraison. Il MUST retirer l'entrée locale active, demander la révocation de la clé plafonnée créée pour cette demande et exposer `E_RATE` à l'appelant ; une demande initiale non livrée MUST NOT rester dans la file volatile, et aucun résultat tardif ne doit recréer une demande effacée. Une demande initiale confiée au relais sans réponse (issue `unconfirmed`, spec `relay`) n'est pas une non-livraison : le Node MUST la garder active à l'état `proposed` avec `delivery: 'unconfirmed'`, garder sa clé plafonnée, remettre la même enveloppe dans la file d'envoi et répondre 201 avec `delivery: 'unconfirmed'`. `delivery` MUST disparaître dès qu'un renvoi est acquitté par le relais (`delivered` ou `queued`) ou qu'un message de l'exécuteur sur cette demande arrive (T4.39).

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

#### Scenario: AC: relais refuse une destination inconnue
<!-- openspec-guard:test="bounded requester memory > fails a drop at once, with E_SCHEMA, when the relay refuses its envelope for an owner it does not admit" -->
- **WHEN** le relais refuse définitivement la demande initiale avec `E_SCHEMA`, par exemple pour un propriétaire qu'il n'admet pas
- **THEN** la demande passe aussitôt à l'état `failed` avec `E_SCHEMA`, la clé plafonnée est libérée une fois et la demande n'attend pas son expiration

#### Scenario: AC: enveloppe initiale trop grande
<!-- openspec-guard:test="bounded requester memory > releases funding and active memory when the initial envelope is too large" -->
- **WHEN** la demande initiale dépasse la taille maximale de l'enveloppe avant envoi au relais
- **THEN** la demande locale est retirée, la révocation de la clé plafonnée est déclenchée et l'API locale répond `E_TOO_LARGE` sans fausse réussite ni place active immobilisée

#### Scenario: AC: enveloppe trop grande via /ask
<!-- openspec-guard:test="local API > reports requester capacity as E_RATE/429 for /drops and /ask" -->
- **WHEN** une demande routée par `/ask` dépasse la taille maximale de l'enveloppe
- **THEN** l'API locale répond HTTP 413 avec `E_TOO_LARGE` et indique les routes éventuellement déjà émises

#### Scenario: AC: demande initiale sans réponse du relais
<!-- openspec-guard:test="unconfirmed drop request (T4.39) > keeps a drop request the relay never answered, sends it again, and confirms it once the executor answers" -->
- **WHEN** la trame d'une demande initiale part vers le relais et la connexion disparaît avant sa réponse, alors que l'exécuteur a reçu la demande
- **THEN** la demande reste active à l'état `proposed` avec `delivery: 'unconfirmed'`, sa clé plafonnée n'est pas révoquée, la même enveloppe attend dans la file, et `delivery` disparaît quand l'exécuteur répond

#### Scenario: AC: réception confirmée par un renvoi
<!-- openspec-guard:test="unconfirmed drop request (T4.39) > clears the unconfirmed delivery once the relay acknowledges the resent request" -->
- **WHEN** la demande initiale s'est résolue en `unconfirmed`, puis le vidage de la file renvoie son enveloppe et le relais l'acquitte
- **THEN** `delivery` disparaît de la demande, et un second exemplaire reçu par l'exécuteur est écarté par l'anti-rejeu

#### Scenario: AC: réception non confirmée exposée par l'API locale
<!-- openspec-guard:test="unconfirmed drop request (T4.39) > answers 201 with delivery unconfirmed on POST /drops and keeps it on GET /drops/:id" -->
- **WHEN** `POST /drops` émet une demande dont la réception n'est pas confirmée
- **THEN** l'API locale répond 201 avec `delivery: 'unconfirmed'`, et `GET /drops/:id` rend le même champ tant qu'il tient
