## ADDED Requirements

### Requirement: Politique revérifiée par le relais
Avec `policyPath` et `policyIssuer` dans sa config (l'un sans l'autre est refusé), le relais SHALL vérifier la politique au démarrage et refuser de démarrer si elle est invalide ou expirée. Il MUST fermer (4401) la connexion d'un nœud qui ne présente pas l'empreinte de cette politique dans sa trame `auth`, ou qui en présente une autre, refuser toute connexion quand elle a expiré et couper alors les nœuds déjà connectés.

#### Scenario: AC: nœud sans la politique refusé
<!-- openspec-guard:test="enterprise policy (T4.10) > lets in only nodes that present the relay's policy" -->
- **WHEN** un relais avec politique reçoit un nœud qui présente son empreinte, un nœud sans empreinte et un nœud avec une autre
- **THEN** seul le premier est admis ; une config à moitié, une politique falsifiée ou déjà expirée empêchent le démarrage ; à l'expiration, un nœud qui arrive est refusé et un nœud connecté est coupé

### Requirement: TLS natif du relais
Avec `tls { certPath, keyPath }`, le relais SHALL servir `wss` et `https` lui-même.

#### Scenario: AC: relais en TLS natif
<!-- openspec-guard:test="enterprise policy (T4.10) > serves wss itself when given a certificate" -->
- **WHEN** le relais démarre avec un certificat et qu'un nœud qui fait confiance à ce certificat se connecte en `wss`
- **THEN** la connexion aboutit et `/health` répond en HTTPS
