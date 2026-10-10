# Proposal

## Why

T3.4 transforme la coque Mac du prototype en application de barre de menus utilisable sans environnement de développement. Aujourd’hui, un port occupé peut être pris pour un démarrage réussi et une panne laisse une fenêtre bloquée sans récupération ; le parcours de consentement perd aussi le focus clavier après ses rafraîchissements.

## What Changes

- Piloter le Node embarqué avec un démarrage vérifié, un arrêt propre, une reprise bornée après veille ou panne et un état d’erreur actionnable.
- Rendre le panneau local navigable au clavier et avec VoiceOver, avec focus, libellés, annonces d’état et états vides/erreur cohérents.
- Qualifier le paquet Mac sans Node préinstallé : architecture, signature/notarisation, provenance et procédure d’installation testable.
- Définir un canal de mise à jour facultatif avec vérification du paquet et conservation de la version installée en cas de refus, de panne réseau ou de paquet invalide.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `owner-app` : cycle de vie, accessibilité du panneau, distribution Mac et mise à jour facultative.

## Impact

`apps/mac`, `packages/node/src/panel.ts`, les tests du panneau, le script de packaging et la documentation de distribution Mac. Aucun endpoint public ni service Memo Labs obligatoire n’est ajouté.

## Non-goals

La preuve privée d’ensemble MCP/A2A reste en T3.5 ; Windows et Linux restent en T3.7/T3.8 ; le choix et la qualification du modèle restent en T3.2. La publication open source reste soumise à T3.6.
