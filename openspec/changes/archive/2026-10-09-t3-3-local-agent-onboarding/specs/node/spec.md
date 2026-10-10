## ADDED Requirements

### Requirement: Raccordement local contrôlé des agents
Le Node SHALL analyser uniquement les configurations des quatre adaptateurs connus et proposer, par agent, un état et l'ajout précis du connecteur MCP drop. Cette analyse MUST NOT exécuter un serveur MCP, scanner le disque ou contacter le réseau. L'aperçu MUST exclure les valeurs de secrets, arguments et en-têtes existants. Une configuration illisible ou invalide produit une erreur pour cet agent, jamais une configuration vide de remplacement.

#### Scenario: AC-CONNECT-01 — analyse bornée et expurgée
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-01 analyzes known adapters without exposing secret values" -->
- **WHEN** les quatre adaptateurs déclarent des serveurs avec des valeurs secrètes
- **THEN** l'analyse lit seulement leurs emplacements connus, n'exécute aucun serveur et ne renvoie aucune valeur sensible

#### Scenario: AC-CONNECT-04 — erreur par agent sans écrasement
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-04 and AC-CONNECT-05 refuses malformed and changed files without overwriting" -->
- **WHEN** une configuration est invalide, une CLI manque ou l'accès est refusé
- **THEN** cet agent reçoit une erreur explicite et sa configuration reste intacte

Le Node MUST exiger une empreinte correspondant à l'aperçu confirmé avant chaque modification. Une entrée drop identique est sans effet ; une entrée différente est un conflit visible. Il MUST ne modifier que l'entrée drop annoncée et ne publier aucune capacité. Les écritures de fichiers MUST préserver les autres entrées et utiliser une sauvegarde locale privée bornée ; la déconnexion MUST retirer seulement l'entrée drop qu'il a installée.

#### Scenario: AC-CONNECT-02 — sélection confirmée sans publication
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-02 and AC-CONNECT-03 changes only the selected entry, then becomes idempotent" -->
- **WHEN** le propriétaire confirme une sélection d'agents après l'aperçu
- **THEN** seules les entrées drop annoncées pour cette sélection changent et aucune capacité n'est publiée

#### Scenario: AC-CONNECT-03 — répétition et conflit
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-03 refuses an existing entry with different settings" -->
- **WHEN** l'installation est répétée, puis rencontre une entrée drop différente
- **THEN** la répétition n'écrit rien et l'entrée différente n'est pas remplacée silencieusement

#### Scenario: AC-CONNECT-05 — modification concurrente ou interruption
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-05 preserves a competing write during the JSON transaction" -->
- **WHEN** une configuration change après l'aperçu ou une écriture s'interrompt
- **THEN** le Node arrête l'action de cet agent et conserve le contenu tiers, avec une sauvegarde privée exploitable

#### Scenario: AC-CONNECT-06 — déconnexion sélective
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-06 removes only the owned entry after a third-party addition" -->
- **WHEN** un tiers ajoute une autre entrée après le raccordement
- **THEN** la déconnexion retire seulement drop et conserve l'ajout tiers
