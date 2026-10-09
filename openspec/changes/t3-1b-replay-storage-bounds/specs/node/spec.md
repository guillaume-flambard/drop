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
