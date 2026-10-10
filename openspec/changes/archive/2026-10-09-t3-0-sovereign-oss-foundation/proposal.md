# Proposal

## Why

T3.0 : le 9 octobre 2026, Guillaume adopte le positionnement auto-hébergé proposé et demande de mettre à jour la documentation, les specs, les chantiers, la landing et la préparation open source. La présentation héritée privilégie le relais Memo Labs et confond plusieurs états du prototype avec la cible produit.

## What Changes

- Vision et architecture orientées infrastructure du client ; A2A et MCP au centre ; Community gratuite, installation et maintenance payantes, administration d'organisation ultérieure.
- Contrat documentaire de la cible : profil privé, app Tauri en barre de menus, raccordement en deux confirmations, détection bornée aux adaptateurs, modèle local facultatif et sélectionné explicitement.
- Qualification des contrats hérités comme prototype ; aucune promesse que les futurs parcours sont déjà exécutables.
- Index des tâches réordonné, preuves conservées, travaux dépendants du cloud dépriorisés, chantiers privés découpés avec critères.
- Landing, guide, bilan et illustrations alignés ; préparation de la contribution, licence Apache-2.0, sécurité et publication.

## Capabilities

### New Capabilities

- `product-foundation` : contrat de la documentation et du plan produit adopté, incluant les frontières gratuit/payant, le parcours prévu et les preuves nécessaires avant de déclarer une fonction livrée.

### Modified Capabilities

- `owner-app` : limiter explicitement le premier lancement sur relais public au prototype historique ; documenter la cible Tauri privée dans le contrat de fondation. Le comportement livré reste inchangé.

## Impact

README, AGENTS, documentation, specs et contexte OpenSpec, site statique, kit open source et métadonnées de licence. Le constructeur du site pourra être ajusté pour livrer les documents publics et leurs liens. Aucune modification de l'exécution des Nodes, du transport, de la politique de sécurité ou des installateurs.

## Non-goals

Implémenter maintenant l'onboarding, le profil privé ou un runtime de modèle ; télécharger un modèle ; signer ou distribuer une app ; publier le dépôt, npm ou le site ; modifier le serveur du lab. Ces implémentations sont des chantiers T3.* explicites, pas des TODO cachés de T3.0. L'accord de réalisation documentaire est la demande de Guillaume ; il n'est pas nécessaire de le redemander.
