# Proposal

## Why

T3.1 rend exécutable le cap privé adopté : le prototype impose encore le relais du lab et peut substituer un fournisseur lors du financement. La demande humaine « attaques les chantiers » autorise cette réalisation.

## What Changes

- Profil privé explicite, relais interne et destinations autorisées, erreurs sans repli.
- **BREAKING** : le financement ne remplace plus le fournisseur ni le modèle du propriétaire.
- Migration et retour arrière explicites ; aucun changement d’identité ou de publication.
- Admission persistante et révocation ; recette interne reproductible sans Internet.
- Bootstrap Mac local ; pas de connexion au lab sur installation vierge.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `node` : profil privé, migration, usage sans services externes.
- `relay` : déploiement interne et révocation persistante.
- `capability-repo-answer` : modèle explicite et endpoint local proposé.
- `runner` : frontières réseau et erreurs sans repli.
- `protocol` : financement sans substitution.
- `owner-app` : bootstrap local.
- `capability-mcp-answer` : réseau contrôlé et financement.
- `capability-a2a-answer` : destinations secondaires contrôlées.

## Impact

Node, capacités, relais, schémas et shell Mac ; aucune dépendance ajoutée. Les anciennes configs restent disponibles pour retour arrière. Les processus tiers nécessitent un contrôle réseau de l’hôte ; ils ne peuvent être déclarés confinés par un filtre HTTP.

## Non-goals

Hermes (T3.1a), qualification des modèles (T3.2), raccordement groupé (T3.3), distribution signée (T3.4), preuve produit complète (T3.5), publication publique (T3.6).
