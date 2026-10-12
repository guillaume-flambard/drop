## ADDED Requirements

### Requirement: Changement de relais du client
Le client du relais SHALL pouvoir passer à un autre relais sans redémarrage (`switchUrl`, T4.23). Une autorité de certification supplémentaire (`ca`, T4.10), qui remplace les autorités par défaut, MUST rester attachée au nom d'hôte du relais pour lequel elle a été donnée : elle MUST NOT servir à un relais d'un autre hôte, où le client revient aux autorités par défaut (T4.33).

#### Scenario: AC: autorité gardée pour le même hôte seulement
<!-- openspec-guard:test="relay client switch (T4.33) > keeps the extra certificate authority for the same host only, never for a relay on another host" -->
- **WHEN** un client connecté en `wss` à un relais grâce à son autorité passe à un autre relais du même hôte, puis à un relais d'un autre nom d'hôte servi par un certificat de cette même autorité
- **THEN** il se connecte au premier, et pas au second, qu'un client neuf muni de l'autorité atteint
