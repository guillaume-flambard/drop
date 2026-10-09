## MODIFIED Requirements

### Requirement: App de la barre de menus
L’app SHALL embarquer Node et `drop.mjs`, créer une identité au premier lancement avec un relais local ou explicitement configuré, lancer le daemon et l’arrêter en quittant. Le panneau et les liens d’appairage restent locaux. Le bootstrap MUST NOT sélectionner le relais public. Seule la version finale s’inscrit au démarrage de session.

#### Scenario: Premier lancement
<!-- openspec-guard:test="private bundled bootstrap > initializes a fresh private home without starting the imported MCP executable" -->
- **WHEN** l’utilisateur ouvre l’app sur une installation vierge
- **THEN** le bootstrap choisit le profil privé et une destination locale, sans connexion imposée au lab
