## ADDED Requirements

### Requirement: Codes d'erreur stables partagés
`ERROR_CODES` SHALL lister chaque code stable qu'un package peut produire ou recevoir, dont `E_QUEUE_FULL`, que le relais renvoie quand la file différée d'un destinataire est pleine.

#### Scenario: AC: file pleine dans la liste
<!-- openspec-guard:test="configuration hygiene (T4.15) > lists E_QUEUE_FULL among the stable error codes" -->
- **WHEN** on lit `ERROR_CODES`
- **THEN** la liste contient `E_QUEUE_FULL`
