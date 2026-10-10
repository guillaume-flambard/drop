## ADDED Requirements

### Requirement: Deux confirmations de raccordement
Le panneau SHALL d'abord montrer l'analyse locale expurgée des adaptateurs connus et laisser choisir ceux à raccorder. Une seconde action explicite SHALL appliquer cette sélection et afficher un résultat par agent. Il MUST distinguer configuration modifiée, relance de l'agent nécessaire et équipe joignable. Sans agent compatible, ou pour un agent non pris en charge, il SHALL montrer une voie de configuration manuelle sans demander de permission générale.

#### Scenario: AC-CONNECT-07 — états de relance et d'équipe distincts
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-07 reports agent restart independently of team connectivity" -->
- **WHEN** la configuration est raccordée mais l'agent doit redémarrer ou l'équipe est hors ligne
- **THEN** le panneau affiche ces états distincts sans annoncer que le parcours entier est terminé

#### Scenario: AC-CONNECT-08 — état vide et voie manuelle
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-08 offers a manual stdio entry without broad permissions" -->
- **WHEN** aucun des quatre adaptateurs n'est détecté, ou que l'agent de l'utilisateur n'est pas pris en charge
- **THEN** le panneau propose la configuration manuelle et n'élargit aucune permission
