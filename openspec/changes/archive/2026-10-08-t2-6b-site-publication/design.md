# Design

## Context

Le site est construit et testé dans T2.6a, commit `54654b1`. Le domaine sert déjà le relais par Traefik sur `/v1` et `/health`. La stack existante s'appelle `drop`. Un worktree `lab-infra/.worktrees/drop-admission` contient le chantier voisin : il reste en lecture seule pour cette tâche.

## Decisions

Créer `stacks/drop-site` dans un worktree lab-infra distinct, depuis origin/main. Suivre le modèle existant de `stacks/legal` : contenu statique versionné, nginx et Traefik, déploiement par Ansible. Fixer le digest de nginx déjà présent. Le processus tourne sans privilèges, sans port hôte, avec des montages en lecture seule et un répertoire temporaire.

Traefik route le site uniquement hors `PathPrefix(/v1)` et `Path(/health)`. Le serveur n'accepte que les dix fichiers publics exacts ; aucune racine du dépôt ni répertoire privé monté. Pas de connexion aux Nodes, clé, formulaire, JavaScript, compte ou base de données.

La source éditoriale reste le dépôt drop. Le répertoire public de lab-infra contient un export daté avec un manifeste SHA-256, jamais une seconde source à éditer. Les mises à jour reconstruisent puis recopient l'export complet.

## Requirements and acceptance

| Exigence | Critère | Preuve attendue |
| --- | --- | --- |
| REQ-PUB-1 : site public | AC-PUB-1 : HTTPS valide, trois pages et dix fichiers identiques à l'export, HTTP redirigé | Requêtes HTTP et manifeste |
| REQ-PUB-2 : confidentialité | AC-PUB-2 : fichiers privés et inconnus refusés, pas de script, CSP conservée, conteneur sans privilèges | Configuration, HTTP, inspection |
| REQ-PUB-3 : coexistence | AC-PUB-3 : /health répond et /v1 fournit encore le challenge WebSocket ; mêmes identifiants et démarrages des conteneurs drop avant/après | État distant et connexion sans authentification |
| REQ-PUB-4 : reproductibilité | AC-PUB-4 : stack versionnée, précontrôles et déploiement Ansible passés, source et retrait documentés | Git, Ansible, guide d'exploitation |
| REQ-PUB-5 : qualité | AC-PUB-5 : tests du dépôt et guard verts, revue indépendante, rendu HTTPS vérifié | Commandes, revue, navigateur |

## Risks

| ID | Risque / impact | Mesure | Statut |
| --- | --- | --- | --- |
| R1 | Prendre une route du relais / élevé | Exclusions explicites, comparaison des processus et challenge avant/après | À vérifier |
| R2 | Publier des données privées / élevé | Export exact de dix fichiers et allowlist nginx | À vérifier |
| R3 | Écraser le chantier voisin / élevé | Deux worktrees dédiés, PR, aucun changement dans stacks/drop | À vérifier |
| R4 | Export périmé / moyen | Révision et manifeste, procédure de rafraîchissement | Accepté avec mesure |

## Coverage

Applicables : comportement HTTP, UX publique, intégrité des fichiers, sécurité, confidentialité, accessibilité déjà vérifiée en local et contrôle public, réseau/TLS, cache, diagnostic, tests d'intégration, build, packaging, déploiement, retrait, documentation et expérience développeur.

Inchangés : contrats des capacités, authentification et autorisation des agents, protocoles et intégrations du produit.

Non applicables : chargement dynamique, formulaires et leurs erreurs, état vide, annulation, retries applicatifs, persistance métier, restauration de données, concurrence métier, idempotence métier, migrations et migration utilisateur. Le site ne crée aucun état utilisateur. La concurrence de déploiement utilise le verrou Ansible existant. Aucun port public additionnel. Hors ligne : les fichiers téléchargés restent utilisables.

## Verification plan

Avant publication : syntaxe nginx, allowlist et méthodes dans un conteneur de test sans route Traefik ; lint, types, tests et guard ; revue. Ensuite `make check`, déploiement ciblé `make deploy-stack app=drop-site`, hash des dix fichiers via HTTPS, contrôles de refus, routes du relais, rendu réel. Vérifier que seuls les fichiers prévus apparaissent dans chaque diff. Retrait : arrêter uniquement la stack drop-site et retirer sa déclaration ; le relais reste indépendant.
