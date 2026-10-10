## ADDED Requirements

### Requirement: Message iroh_addr
Le message `iroh_addr` SHALL porter `relay` facultatif (URL http ou https de 300 caractères au plus) et `direct`, au plus 8 adresses `ip:port`.

#### Scenario: AC: adresses iroh au bon format
<!-- openspec-guard:test="internet (T4.2b) > carries iroh addresses only in their documented shape" -->
- **WHEN** un `iroh_addr` porte un relais https et deux adresses, puis neuf adresses, puis une adresse sans port
- **THEN** seul le premier est valide
