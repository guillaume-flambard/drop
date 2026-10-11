# Spec Delta

## ADDED Requirements

### Requirement: Cache anti-rejeu des enveloppes borné
Le cache des identifiants d'enveloppe MUST avoir un plafond fini. Lorsque ce plafond est atteint par des identifiants non expirés, il MUST refuser un nouvel identifiant avant déchiffrement plutôt que d'oublier un identifiant encore protégé. Les entrées expirées MUST pouvoir être retirées à l'arrivée d'une nouvelle enveloppe.

#### Scenario: AC: saturation du cache d'enveloppes
<!-- openspec-guard:test="bounded envelope replay cache > refuses new ids at capacity without forgetting an unexpired id" -->
- **WHEN** le cache contient le nombre maximal d'identifiants non expirés
- **THEN** un nouvel identifiant est refusé et un identifiant déjà vu reste refusé

#### Scenario: AC: place retrouvée après expiration
<!-- openspec-guard:test="bounded envelope replay cache > admits another id after entries expire without reopening a live id" -->
- **WHEN** des identifiants expirent dans un cache saturé
- **THEN** le prochain identifiant peut être admis sans rouvrir le rejeu des identifiants encore valides
