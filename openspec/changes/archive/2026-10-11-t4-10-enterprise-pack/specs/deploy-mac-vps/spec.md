## ADDED Requirements

### Requirement: Relais d'entreprise en conteneur et chart Helm
Le dépôt SHALL fournir une image du seul relais (`docker/relay.Dockerfile`, utilisateur non root, système de fichiers en lecture seule, vérification `/health`) et un chart Helm (`deploy/helm/drop-relay`) à un réplica, avec volume persistant pour les admissions et révocations, politique en ConfigMap et `securityContext` sans privilège.

#### Scenario: AC: chart durci
<!-- openspec-guard:test="enterprise policy (T4.10) > renders a hardened single-replica Helm chart for the relay" -->
- **WHEN** le chart est rendu avec ses valeurs par défaut puis avec TLS et une politique
- **THEN** il a un seul réplica, tourne en non root sans élévation ni écriture sur la racine, monte config et politique, et expose le port TLS ; une politique sans émetteur ou un ingress sans secret TLS sont refusés, une nouvelle politique change le gabarit du pod pour redémarrer le relais, et l'ingress parle HTTPS à un relais en TLS natif
