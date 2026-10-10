## MODIFIED Requirements

### Requirement: Positionnement et offre explicites

La documentation et la landing SHALL définir drop comme une couche de consentement au-dessus d'A2A et MCP : un agent pose une question bornée, le propriétaire de la source décide, et seule la réponse validée revient (« la réponse, pas l'accès »), dans l'infrastructure du client. Elles MUST présenter la promesse publique avec sa limite (drop contrôle ce qui passe par drop, pas les flux propres d'un connecteur ou d'un modèle choisi par le propriétaire), la même cible (premiers essais techniques, conception selon une entreprise souveraine, adoption par les petites équipes) et la même frontière : socle gratuit sous Apache-2.0, rien de payant avant d'avoir des utilisateurs, sécurité essentielle jamais payante.

#### Scenario: AC: offre compréhensible sans cloud imposé

<!-- openspec-guard:non-testable reason="Critère éditorial : inspection croisée du PRD, de la vision, du README et de la landing, consignée dans les preuves T4.0a. Ne valide aucun parcours logiciel futur." -->

- **WHEN** un lecteur consulte le README, la vision, le PRD et la landing
- **THEN** il retrouve la même cible, la même promesse avec sa limite, la même frontière gratuit et payant et l'absence de compte Memo Labs ou de relais tiers obligatoire
- **AND** le statut prototype et les fonctions restant à livrer sont visibles, chacune avec sa tâche

## ADDED Requirements

### Requirement: Documents produit de référence

Le dépôt SHALL fournir dans `docs/product/` un PRD, un TRD, un parcours, un document UX/UI, un schéma backend et un plan d'implémentation. Chaque affirmation MUST porter un statut explicite : existant avec sa preuve, visé avec sa tâche, ou hypothèse avec son critère de validation. Ces documents MUST renvoyer aux specs pour les exigences et à l'index pour l'ordre, sans les recopier ; tout autre document produit qui les contredit est corrigé ou réduit à un renvoi.

#### Scenario: AC: aucune affirmation produit fausse ou sans statut

<!-- openspec-guard:non-testable reason="Revue documentaire adverse : vérification des affirmations existantes contre le code et les preuves, consignée dans les preuves T4.0 et T4.0a." -->

- **WHEN** un contributeur lit un document de `docs/product/` ou une page produit qui en dérive
- **THEN** chaque fonctionnalité citée est marquée existante avec une preuve, visée avec une tâche de l'index, ou hypothèse avec un critère
- **AND** aucune fonctionnalité visée n'est présentée comme livrée
