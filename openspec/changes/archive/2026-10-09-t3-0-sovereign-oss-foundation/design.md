# Design

## Context

Base inspectée : `d759029`. Le dépôt privé dispose d'A2A entrant/sortant, d'un Node configurable, d'un shell Tauri 2 Mac et d'une détection de quatre agents. Le bootstrap Mac pointe sur le lab, le fournisseur par défaut est OpenRouter, le financement peut changer l'endpoint modèle et la passerelle grand public voit le clair. Les notes de recherche datées du 9 octobre constituent les sources externes. Voir `proposal.md` pour le périmètre autorisé.

## Goals / Non-Goals

Livrer un terrain cohérent pour contribuer et implémenter la cible, avec une landing locale honnête. Les critères documentaires du delta `product-foundation` sont les critères de T3.0. La matrice des critères d'exécution à construire vivra dans `docs/ACCEPTANCE.md`, reliée aux tâches T3.1 à T3.8. Aucun de ces critères futurs n'est artificiellement marqué couvert dans OpenSpec Guard.

Les specs de runtime continuent de décrire le prototype tant que leur tâche d'implémentation ne les remplace pas. Leur portée historique est explicite. La nouvelle fondation contraint la conception et la présentation, pas une fonction prétendument implémentée.

## Decisions

- Conserver Tauri 2, son panneau web local et le cœur Node partagé. Mac en barre de menus d'abord ; adaptateurs et packaging Windows puis Linux. Éviter une réécriture Electron ou trois interfaces natives. Sources officielles dans la recherche desktop.
- Deux confirmations après installation et environnement prêt : « Analyser ce Mac » puis « Connecter les agents sélectionnés ». Aucun outil publié par le raccordement. Les permissions système, téléchargements, accès administrés et acceptation d'invitation restent explicitement hors du compte de deux confirmations.
- Gratuit local : réutiliser l'endpoint existant choisi par l'owner ; capacité déterministe sans modèle quand possible ; Ollama avec Qwen3.5 4B/9B candidats à mesurer, téléchargement consenti. Aucun fallback distant.
- Apache-2.0 pour le socle détenu par le projet ; pas de publication ni d'affirmation de droits sur les dépendances ou poids. Kit CONTRIBUTING, SECURITY, templates et checklist de publication. GitHub est privé au début de la change.
- Nouveau chemin T3.* avant les tâches historiques ouvertes. Conserver les éléments prouvés ; reprendre les anciens `doing` en `todo` avec justification, sans les déclarer terminés. D24 reste un gate de pilote.
- Source documentaire canonique : vision/architecture et specs pour le contrat, TASKS pour ordre, ACCEPTANCE pour critères futurs, DECISIONS pour choix, GUIDE pour lecture utilisateur. Les notes de recherche restent datées et signalent leur adoption.
- Site : conserver l'identité cobalt/blanc existante, la typographie locale et la simulation d'échange. Ajouter un aperçu clairement simulé des deux confirmations et de la frontière privée. Palette `#f5f8ff`, `#15234b`, `#2548ed`, `#e7efff`, `#226655`. Composition : promesse et consentement en tête, parcours laptop, réseau privé, gratuit/accompagnement, état réel. Pas de CDN, statistiques inventées ou faux bouton d'installation.

## Requirements and acceptance

Six exigences et six critères éditoriaux : `specs/product-foundation/spec.md`. Vérification par inspection sourcée, revue indépendante, liens locaux et navigateur. La sécurité du serveur de prévisualisation reste testée par les tests HTTP existants ; toute modification de son export est testée contre les chemins publics et les liens.

## Risks / Trade-offs

| ID  | Risque                                               | Niveau initial | Réponse / preuve attendue                                                             |
| --- | ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| R1  | Faire passer une cible pour un produit prêt          | Élevé          | Statuts explicites partout ; revue de chaque promesse de la landing                   |
| R2  | Deux clics qui publient ou exécutent des outils      | Élevé          | Parcours séparant découverte, raccordement et partage ; critères négatifs             |
| R3  | Modèle dit gratuit ou local sans preuve              | Élevé          | Sources, tailles distinguées de RAM, protocole de qualification, aucun téléchargement |
| R4  | Ouverture du dépôt avec CI du lab ou données privées | Élevé          | Dépôt maintenu privé ; gate de publication avec inventaire et tests requis            |
| R5  | Ordre des tâches et liens incohérents                | Moyen          | Contrôle de références et dépendances, revue indépendante                             |
| R6  | Documentation et pages divergentes                   | Moyen          | Inspection croisée, actualisation du constructeur du site si nécessaire               |

## Coverage and verification plan

Applicables : contenu, UX de landing, navigation, accessibilité, performance statique, intégrité documentaire, descriptions sécurité/privacy, liens, build, packaging public des docs, roadmap et expérience contributeur. Revue du diff et des contrats documentaires.

Sans modification de comportement : données d'identité, consentement réel, concurrence, idempotence métier, retries, recovery, provider, réseau Node, outils, autorisation, persistance, journaux. Leurs critères futurs sont modélisés, sans validation d'exécution dans T3.0.

Non applicables au livrable : migration de données, déploiement de serveur, publication, signatures et mises à jour d'app, téléchargement de modèle. Ces actions ont des tâches distinctes. Rollback local : revenir au commit précédent ; aucun état distant n'est créé.

Ordre : validation OpenSpec, format/lint, types, tests, guard puis baseline (retraits seuls), build du site, liens et navigateur bureau/mobile/clavier, revue contradictoire. Les chiffres de tests sont relevés après exécution, jamais copiés de l'ancien bilan.
