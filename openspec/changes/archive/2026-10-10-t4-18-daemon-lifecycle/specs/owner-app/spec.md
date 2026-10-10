## MODIFIED Requirements

### Requirement: App de la barre de menus
L’app SHALL embarquer Node et `drop.mjs`, créer une identité au premier lancement avec un relais local ou explicitement configuré, lancer le daemon et l’arrêter en quittant. Le daemon MUST aussi s’arrêter quand la coque disparaît sans quitter, y compris tuée par un signal. Le panneau et les liens d’appairage restent locaux. Le bootstrap MUST NOT sélectionner le relais public. Seule la version finale s’inscrit au démarrage de session.

#### Scenario: Premier lancement
<!-- openspec-guard:test="private bundled bootstrap > initializes a fresh private home without starting the imported MCP executable" -->
- **WHEN** l’utilisateur ouvre l’app sur une installation vierge
- **THEN** le bootstrap choisit le profil privé et une destination locale, sans connexion imposée au lab

#### Scenario: AC: pas de daemon orphelin
<!-- openspec-guard:test="daemon lifecycle (T4.18) > AC stops serving when the shell's stdin pipe closes, and only in that mode" -->
- **WHEN** la coque qui a lancé le daemon disparaît sans le quitter
- **THEN** le daemon s’arrête de lui-même et libère son port, alors qu’un `drop serve` lancé hors de l’app continue de tourner
