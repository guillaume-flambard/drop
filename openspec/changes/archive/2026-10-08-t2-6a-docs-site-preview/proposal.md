# Proposal

## Why

T2.6a, demandée explicitement le 8 octobre 2026 : analyser l'avancement de drop, écrire une documentation compréhensible et illustrée, puis construire un beau site. Le code dépasse la présentation actuelle du README, tandis que plusieurs ambitions de l'étape 2 ne sont pas encore livrées.

## What Changes

- Un guide français, un bilan daté avec ses preuves et des schémas accessibles.
- Une vitrine statique avec démonstration pédagogique, guide et bilan consultables en local.
- Un README qui oriente vers ces documents et expose les vrais prérequis de la démo.
- Un suivi limité à ce livrable, distinct de l'achèvement du produit.

## Capabilities

### New Capabilities

Aucune capacité d'exécution. Le site est une documentation interactive, sans connexion aux Nodes.

### Modified Capabilities

Aucune. `skip_specs: true` : présentation et documentation uniquement, sans changement des contrats existants.

## Impact

`README.md`, `docs/`, `site/`, scripts de construction et de prévisualisation, commandes associées dans `package.json`. Aucune dépendance supplémentaire. Le site n'inclut ni identité privée ni donnée de configuration locale.

## Non-goals

T2.4 (app Mac), T2.5 (installateurs), T2.7 (essais chez les testeurs), T2.9 (annuaire), T2.10 (demandes multiples). T2.6 garde la vidéo, les boutons d'installation réellement disponibles et la mise en ligne sur le domaine prévu. L'autorisation de construire est donnée dans la demande ; la publication reste soumise au point d'arrêt de `docs/TASKS.md`. Les deux lignes déjà `doing` appartiennent à des travaux préexistants et ne sont pas requalifiées ici.
