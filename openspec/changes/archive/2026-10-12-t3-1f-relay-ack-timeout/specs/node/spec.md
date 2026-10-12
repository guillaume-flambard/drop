## MODIFIED Requirements

### Requirement: Reconnexion exponentielle au relais
`drop serve` MUST se reconnecter seul au relais après une coupure, avec un délai exponentiel de 1 s à 30 s. Une connexion morte ou à moitié ouverte, détectée par le client relais (spec `relay`, « Battement de cœur du client relais » et les exigences du client relais qui la suivent), MUST compter comme une coupure. Une enveloppe restée sans acquittement MUST revenir dans la file d'envoi et repartir à la reconnexion.

#### Scenario: AC: drop serve se reconnecte seul après coupure du relais
- **WHEN** le relais coupe la connexion puis redevient disponible
- **THEN** `drop serve` se reconnecte sans intervention

#### Scenario: Délais bornés
- **WHEN** le relais reste indisponible
- **THEN** les délais entre tentatives croissent exponentiellement depuis 1 s sans dépasser 30 s

#### Scenario: AC: envoi repris après une connexion à moitié ouverte
<!-- openspec-guard:test="relay liveness (T3.1f) > sends a pairing request again after the relay connection went half-open, and the pairing completes" -->
- **WHEN** la connexion au relais cesse de transmettre sans se fermer pendant qu'une demande d'appairage part
- **THEN** l'envoi revient dans la file, le Node se reconnecte, la demande repart et l'appairage aboutit
