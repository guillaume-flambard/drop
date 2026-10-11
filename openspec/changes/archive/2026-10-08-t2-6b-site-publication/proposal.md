# Proposal

## Why

T2.6b poursuit la livraison de la documentation et du site. Après la présentation du site et la question de publication sur `drop.memolabs.dev`, Guillaume demande « Continues mais à côté de l’agent en cours ». La publication est autorisée ; l'isolation du chantier est une contrainte explicite.

## What Changes

- Publier les dix fichiers publics produits par T2.6a dans un service de site indépendant, géré par le dépôt d'infrastructure privé.
- Conserver les routes existantes du relais, ses processus, son stockage et le chantier d'admission.
- Documenter la révision publiée, le déploiement, les contrôles et le retrait du site.

## Capabilities

### New Capabilities

Aucune capacité d'agent. Hébergement de la documentation déjà validée.

### Modified Capabilities

Aucune. `skip_specs: true` : changement d'infrastructure, sans modification des contrats produit.

## Impact

Deux worktrees isolés : drop pour le suivi et la documentation ; le dépôt d'infrastructure pour le service et les fichiers publics. nginx avec digest fixe. Aucune dépendance npm ou modification du code d'exécution des agents.

## Non-goals

T2.6 reste ouverte pour la vidéo et la distribution finale. Aucun travail sur l'admission du relais, l'app Mac, npm, les clés, les pairs, les données des Nodes ou les chantiers des autres agents.
