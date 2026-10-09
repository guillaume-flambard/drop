## ADDED Requirements

### Requirement: Profil privé explicite
Le Node SHALL proposer un profil privé sans compte externe, passerelle cloud, financement distant automatique, télémétrie, activation de licence ni téléchargement au démarrage. Le relais et les destinations sont choisis localement.

#### Scenario: AC: installation et cycle sans Internet
<!-- openspec-guard:test="private system > runs two private nodes with internal MCP and model through consent failure and restart" -->
- **WHEN** deux Nodes privés utilisent leur relais et leur modèle internes, Internet bloqué
- **THEN** le consentement et la réponse fonctionnent après arrêt et relance, sans connexion externe ; la recette conserve les observations réseau.

### Requirement: Migration privée réversible
La migration SHALL être explicite, sauvegarder la configuration en mode privé, préserver identité, jeton, pairs et publications, et proposer un retour arrière sans écraser une modification concurrente.

#### Scenario: AC: migration et restauration
<!-- openspec-guard:test="private configuration > backs up migrates and restores configuration without changing identity or publications" -->
- **WHEN** une configuration historique est migrée puis restaurée
- **THEN** les autres fichiers restent identiques et une modification concurrente empêche la restauration.


### Requirement: Demandes reçues persistantes
Le Node MUST conserver les identifiants des demandes reçues sans leur contenu, afin qu’un redémarrage ne permette pas de réutiliser une ancienne demande et son accord. Une demande interrompue nécessite un nouvel identifiant et un nouvel accord.

#### Scenario: AC: ancien consentement après redémarrage
<!-- openspec-guard:test="private restart > rejects a previously received drop after restart before any consent can be reused" -->
- **WHEN** une demande reçue avant arrêt est présentée au Node redémarré
- **THEN** elle est refusée sans nouvelle exécution ni remise en attente d’un ancien consentement
