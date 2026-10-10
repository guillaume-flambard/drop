## ADDED Requirements

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
