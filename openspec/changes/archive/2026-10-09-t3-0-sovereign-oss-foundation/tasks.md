# Tasks

Graphe P1 : 1.1 → 1.2 ; 1.1 → 2.1 ; 1.1 → 2.2 ; puis tous → 3.1 → 3.2. Chaque tâche finit sur sa preuve dans `evidence.md`. Les six critères sont ceux de `product-foundation` ; l'état ne qualifie pas les implémentations T3.1+.

## 1. Contrat et documentation

- [x] 1.1 Aligner vision, architecture, décisions, contrat documentaire et spécification du prototype ; écrire les critères futurs pour déploiement, détection, raccordement, app et modèles. Vérifier par lecture croisée et liens aux tâches (AC 1 à 4 et 6).
- [x] 1.2 Réordonner l'index, actualiser README, guide, bilan et statut des recherches ; vérifier dépendances, commandes, preuve historique et travail non livré (AC 1 et 6).

## 2. Surfaces de contribution et présentation

- [x] 2.1 Ajouter licence, contribution, sécurité, modèles GitHub et préparation de publication ; vérifier la provenance de la licence, les liens et l'absence de modification des accès au lab (AC 5).
- [x] 2.2 Aligner les pages et schémas, ajouter le parcours simulé des deux confirmations ; vérifier desktop/mobile/clavier, liens et build. Si l'export de docs change, ajouter la vérification de ses liens aux tests HTTP avant le changement (AC 1 à 4).

## 3. Vérification

- [x] 3.1 Exécuter `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate t3-0-sovereign-oss-foundation --strict`, le contrôle `openspec-guard` puis sa mise à jour de baseline avec retraits seuls ; construire le site et enregistrer les sorties pertinentes.
- [x] 3.2 Effectuer `/review` gstack et une revue contradictoire des promesses et des frontières de données ; corriger les défauts du livrable, relire le diff, consigner preuves, risques et recette manuelle, puis passer l'état documentaire à `READY_FOR_MANUAL_ACCEPTANCE` si les six critères passent. `/cso` runtime non applicable : aucun package d'exécution modifié.

## Workflow follow-up

- Archiver la change documentaire et synchroniser ses deux deltas après vérification.
- Committer les fichiers de cette change, vérifier un arbre propre et présenter la prévisualisation locale.
- Les tâches runtime T3.1+ restent `todo` ; aucun résultat de T3.0 n'en constitue une preuve d'exécution.
