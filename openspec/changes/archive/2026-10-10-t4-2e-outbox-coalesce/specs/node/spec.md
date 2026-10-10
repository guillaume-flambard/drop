## ADDED Requirements

### Requirement: Messages d'état fusionnés dans la file d'envoi
Pour un même pair, la file d'envoi SHALL ne garder que le dernier message de chacun des types `lan_key`, `iroh_addr`, `team_roster` et `catalog` : un nouveau remplace l'ancien. Un message plus ancien que le dernier envoyé à ce pair, en file ou déjà livré, MUST ne jamais partir après lui. Les autres messages ne sont jamais fusionnés.

#### Scenario: AC: les annonces n'évincent pas une demande
<!-- openspec-guard:test="outbox coalescing (T4.2e) > keeps one state message per peer and type, so announcements never evict a real request" -->
- **WHEN** un pair absent a une demande en file et que le nœud annonce 1 500 adresses successives et plusieurs clés
- **THEN** la file garde la demande, une seule adresse et une seule clé ; au retour du pair, il reçoit la demande et la dernière adresse

#### Scenario: AC: un ancien message ne part pas après un plus récent livré
<!-- openspec-guard:test="outbox coalescing (T4.2e) > never lets an older queued state message overwrite a newer one already delivered live" -->
- **WHEN** une adresse attend en file, puis une nouvelle adresse est livrée directement au retour du pair
- **THEN** l'ancienne n'est jamais envoyée et le pair garde la nouvelle

#### Scenario: AC: annonces qui se chevauchent
<!-- openspec-guard:test="outbox coalescing (T4.2e) > stops announcing an address once a newer one is being announced" -->
- **WHEN** l'annonce d'une adresse est en cours quand une nouvelle adresse est annoncée
- **THEN** l'ancienne annonce s'arrête et chaque pair finit avec la nouvelle adresse

#### Scenario: AC: un envoi raté ne remplace pas plus récent
<!-- openspec-guard:test="outbox coalescing (T4.2e) > never lets an older state message, re-queued after a failed send, replace a newer one" -->
- **WHEN** une adresse est en cours d'envoi, qu'une nouvelle adresse est mise en file, puis que le premier envoi échoue
- **THEN** seule la nouvelle adresse reste en file
