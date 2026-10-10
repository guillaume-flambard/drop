## MODIFIED Requirements

### Requirement: App de la barre de menus

Pour le prototype historique Mac + lab, l'app SHALL embarquer Node et `drop.mjs` (D29), créer au premier lancement une identité au nom de l'utilisateur du Mac sur le relais public, lancer `drop serve` et l'arrêter en quittant, afficher le panneau sous son icône, et ouvrir les liens `drop://pair?code=…` dans le panneau, qui accepte l'invitation. Seule la version finale s'inscrit au démarrage de la session.

#### Scenario: Premier lancement

<!-- openspec-guard:non-testable reason="Preuve historique seulement : app de debug avec daemon embarqué connectée au relais du lab le 2026-10-08. Ne valide pas le parcours privé cible T3.3/T3.4." -->

- **WHEN** l'utilisateur ouvre l'app du prototype historique
- **THEN** le Node démarre avec le Node embarqué, se connecte au relais du lab, et le panneau s'affiche au clic sur l'icône
