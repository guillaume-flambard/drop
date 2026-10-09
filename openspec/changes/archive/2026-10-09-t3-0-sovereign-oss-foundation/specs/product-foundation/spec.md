## Purpose

Définir le contrat de la documentation produit et des chantiers du tournant souverain. Ces critères vérifient la conception et sa présentation ; les scénarios d'exécution futurs sont suivis dans l'index et ne sont pas déclarés couverts par cette spec documentaire.

## ADDED Requirements

### Requirement: Positionnement et offre explicites

La documentation et la landing SHALL définir drop comme collaboration A2A/MCP entre propriétaires, exploitable dans l'infrastructure du client. Elles MUST distinguer Community gratuite, accompagnement payant et administration d'organisation future. La sécurité essentielle et les modèles internes restent dans le socle gratuit.

#### Scenario: AC: offre compréhensible sans cloud imposé

<!-- openspec-guard:non-testable reason="Critère éditorial : inspection croisée de la vision, du README et de la landing, consignée dans les preuves T3.0. Ne valide aucun parcours logiciel futur." -->

- **WHEN** un lecteur consulte le README, la vision et la landing
- **THEN** il retrouve la même cible, la même frontière gratuit/payant et l'absence de compte Memo Labs obligatoire dans la cible
- **AND** le statut prototype et les fonctions restant à livrer sont visibles

### Requirement: Contrat privé et frontière de données documentés

Le plan produit SHALL spécifier le déploiement privé, les destinations autorisées et la différence entre exécution locale et traitement entièrement interne. Il MUST couvrir modèle, connecteurs, financement, télémétrie, licences, mises à jour et agents A2A joints, sans promettre zéro fuite.

#### Scenario: AC: souveraineté vérifiable dans le plan

<!-- openspec-guard:non-testable reason="Revue de conception documentaire T3.0 ; les tests réseau, de politiques et de panne appartiennent aux chantiers d'exécution T3.1 et T3.5." -->

- **WHEN** un contributeur prépare le profil privé depuis la documentation
- **THEN** il trouve les critères de refus des destinations externes, l'absence de repli cloud et le test avec Internet bloqué
- **AND** les décisions héritées de relais public et de fournisseur distant sont identifiées comme incompatibles avec ce profil cible

### Requirement: Parcours de connexion borné et réversible spécifié

La conception SHALL décrire deux confirmations pour raccorder les agents compatibles détectés, après installation et sélection d'un environnement prêt. Elle MUST distinguer raccordement et publication d'une capacité, limiter l'inventaire aux adaptateurs documentés et prévoir aperçu, sauvegarde, idempotence, restauration et résultats par agent.

#### Scenario: AC: deux confirmations sans partage implicite

<!-- openspec-guard:non-testable reason="Inspection du parcours et des états spécifiés ; aucune preuve d'onboarding exécuté. Implémentation et tests affectés à T3.3." -->

- **WHEN** on lit le parcours cible
- **THEN** les deux confirmations, leurs prérequis, les erreurs partielles et la déconnexion sont décrits
- **AND** la détection n'exécute aucun serveur découvert, ne publie aucun outil et ne transmet aucune valeur de secret
- **AND** le document ne promet pas la détection universelle de tous les agents

### Requirement: Application et modèles avec limites explicites

La documentation SHALL décider l'approche desktop, l'ordre des plateformes et la stratégie de modèle local. Elle MUST distinguer les candidats des modèles mesurés, annoncer le téléchargement et les coûts matériels, garder le modèle existant prioritaire et ne pas présenter une offre cloud gratuite comme un traitement local.

#### Scenario: AC: choix techniques sourcés et qualification prévue

<!-- openspec-guard:non-testable reason="Décision d'architecture et choix de candidats, relus contre les sources officielles T3.0. Mesures modèles affectées à T3.2, packaging à T3.4." -->

- **WHEN** un contributeur lit l'architecture et le guide des modèles
- **THEN** il connaît l'app Mac de barre de menus, la voie Windows puis Linux, les alternatives comparées et les limites d'intégration
- **AND** il trouve les conditions de sélection, de téléchargement consenti et d'évaluation des modèles sans benchmark inventé

### Requirement: Entrée open source et publication préparées

Le dépôt SHALL fournir une licence explicite, un guide de contribution, une procédure de signalement privé et des modèles d'issue et de PR. La documentation MUST distinguer ce kit local d'une publication et identifier les contrôles de secrets, licences tierces, CI et distribution requis avant ouverture publique.

#### Scenario: AC: contribution possible sans accès au lab

<!-- openspec-guard:non-testable reason="Inspection documentaire et vérification des liens de contribution. La publication, les secrets de l'historique et les binaires signés sont un chantier distinct T3.6." -->

- **WHEN** une personne autorisée à lire le dépôt prépare une contribution
- **THEN** elle trouve les prérequis, les tests sans clé cloud, la licence et le périmètre de contribution
- **AND** aucune instruction n'exige l'accès au lab ou promet un installateur public inexistant

### Requirement: Avancement et ordre traçables

L'index SHALL être la source unique de l'ordre des chantiers et de leurs dépendances. Les documents MUST distinguer preuve historique, résultat vérifié pendant T3.0 et objectif futur. Chaque critère d'exécution privé ou d'onboarding MUST avoir un chantier responsable, sans être présenté comme livré par cette mise à jour documentaire.

#### Scenario: AC: reste à faire retrouvable

<!-- openspec-guard:non-testable reason="Revue de l'index, de la matrice d'acceptation et du bilan daté ; contrôle structurel du graphe et des liens, preuves T3.0." -->

- **WHEN** un contributeur choisit le prochain chantier
- **THEN** il trouve une seule priorité active, les dépendances, les critères, les risques et les preuves manquantes
- **AND** la passerelle cloud facultative ne bloque pas le parcours privé
