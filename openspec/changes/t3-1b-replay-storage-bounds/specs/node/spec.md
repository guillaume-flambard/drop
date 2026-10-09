## MODIFIED Requirements

### Requirement: Demandes reçues persistantes
Le Node MUST conserver au plus 16 384 identifiants de demandes reçues, sans leur contenu, pendant 30 minutes, avec un horodatage durable empêchant leur rejeu après redémarrage ou recul d'horloge. Il MUST refuser avant consentement les UUIDv7 trop vieux (>30 min) ou futurs (>5 min), les doublons et toute admission dont le stockage est saturé, verrouillé, illisible ou non durable. Une demande interrompue nécessite un nouvel identifiant et un nouvel accord.

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

## ADDED Requirements

### Requirement: Nettoyage des écritures anti-rejeu échouées
Le Node MUST supprimer le fichier temporaire d'une écriture durable échouée, afin qu'une panne répétée n'accumule pas de fichiers hors de la borne anti-rejeu.

#### Scenario: AC: échec répété de l'écriture durable
<!-- openspec-guard:test="replay clock write failures > does not accumulate temporary files when durable writes repeatedly fail" -->
- **WHEN** la synchronisation de l'horloge échoue plusieurs fois avant le renommage
- **THEN** le Node refuse chaque demande sans laisser de fichier temporaire supplémentaire
