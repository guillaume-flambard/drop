## MODIFIED Requirements

### Requirement: Déploiement derrière Caddy
Le relais SHALL pouvoir tourner sur une machine interne choisie par le client, sans compte Memo Labs. Sur le réseau, un frontal TLS choisi par le client assure `wss` ; `ws` est réservé au loopback de test ou à un réseau isolé administré par le client. Caddy est une option, pas une dépendance obligatoire.

#### Scenario: Connexion chiffrée
<!-- openspec-guard:test="connects to the internal relay through trusted TLS and rejects an untrusted certificate" -->
- **WHEN** un Node se connecte au relais derrière le frontal TLS interne
- **THEN** la connexion utilise `wss` sans contacter le lab

## ADDED Requirements

### Requirement: Révocation persistante
L’opérateur SHALL pouvoir révoquer un Node au redémarrage du relais. Un Node révoqué MUST être refusé même avec une nouvelle invitation ; il MUST NOT parrainer de nouveaux Nodes. La procédure de sauvegarde et restauration SHALL préserver admissions et révocations.

#### Scenario: AC: admission révocation restauration
<!-- openspec-guard:test="relay > keeps revoked members and their sponsored invitations refused after restore" -->
- **WHEN** un membre admis est révoqué et le relais est redémarré depuis un état sauvegardé
- **THEN** le membre reste refusé et ne peut parrainer de nouveau membre ; la recette VM ou conteneur conserve cette preuve.
