# Design

## Context

Le site est construit et testé dans T2.6a, commit `54654b1`. Le domaine sert déjà le relais sur `/v1` et `/health`, derrière un reverse proxy sur un VPS, déployé depuis un dépôt d'infrastructure privé. Un chantier voisin sur l'admission du relais reste en lecture seule pour cette tâche.

## Decisions

Créer un service de site indépendant dans le dépôt d'infrastructure privé, sur une branche distincte. Suivre le modèle des sites statiques existants : contenu statique versionné, nginx derrière le reverse proxy, déploiement outillé. Fixer le digest de nginx. Le processus tourne sans privilèges, sans port hôte, avec des montages en lecture seule et un répertoire temporaire.

Le reverse proxy route le site uniquement hors `/v1` et `/health`. Le serveur n'accepte que les dix fichiers publics exacts ; aucune racine du dépôt ni répertoire privé monté. Pas de connexion aux Nodes, clé, formulaire, JavaScript, compte ou base de données.

La source éditoriale reste le dépôt drop. Le dépôt d'infrastructure contient un export daté avec un manifeste SHA-256, jamais une seconde source à éditer. Les mises à jour reconstruisent puis recopient l'export complet.

## Requirements and acceptance

| Exigence | Critère | Preuve attendue |
| --- | --- | --- |
| REQ-PUB-1 : site public | AC-PUB-1 : HTTPS valide, trois pages et dix fichiers identiques à l'export, HTTP redirigé | Requêtes HTTP et manifeste |
| REQ-PUB-2 : confidentialité | AC-PUB-2 : fichiers privés et inconnus refusés, pas de script, CSP conservée, conteneur sans privilèges | Configuration, HTTP, inspection |
| REQ-PUB-3 : coexistence | AC-PUB-3 : /health répond et /v1 fournit encore le challenge WebSocket ; le relais n'a pas redémarré | État distant et connexion sans authentification |
| REQ-PUB-4 : reproductibilité | AC-PUB-4 : service versionné, précontrôles et déploiement passés, source et retrait documentés | Historique, déploiement, guide d'exploitation |
| REQ-PUB-5 : qualité | AC-PUB-5 : tests du dépôt et guard verts, revue indépendante, rendu HTTPS vérifié | Commandes, revue, navigateur |

## Risks

| ID | Risque / impact | Mesure | Statut |
| --- | --- | --- | --- |
| R1 | Prendre une route du relais / élevé | Exclusions explicites, relais non redémarré et challenge avant/après | À vérifier |
| R2 | Publier des données privées / élevé | Export exact de dix fichiers et allowlist nginx | À vérifier |
| R3 | Écraser le chantier voisin / élevé | Deux branches dédiées, PR, aucun changement au service du relais | À vérifier |
| R4 | Export périmé / moyen | Révision et manifeste, procédure de rafraîchissement | Accepté avec mesure |

## Coverage

Applicables : comportement HTTP, UX publique, intégrité des fichiers, sécurité, confidentialité, accessibilité déjà vérifiée en local et contrôle public, réseau/TLS, cache, diagnostic, tests d'intégration, build, packaging, déploiement, retrait, documentation et expérience développeur.

Inchangés : contrats des capacités, authentification et autorisation des agents, protocoles et intégrations du produit.

Non applicables : chargement dynamique, formulaires et leurs erreurs, état vide, annulation, retries applicatifs, persistance métier, restauration de données, concurrence métier, idempotence métier, migrations et migration utilisateur. Le site ne crée aucun état utilisateur. La concurrence de déploiement utilise le verrou existant de l'outillage. Aucun port public additionnel. Hors ligne : les fichiers téléchargés restent utilisables.

## Verification plan

Avant publication : syntaxe nginx, allowlist et méthodes dans un conteneur de test non routé ; lint, types, tests et guard ; revue. Ensuite contrôle à blanc et déploiement ciblé du seul site, hash des dix fichiers via HTTPS, contrôles de refus, routes du relais, rendu réel. Vérifier que seuls les fichiers prévus apparaissent dans chaque diff. Retrait : arrêter uniquement le service du site et retirer sa déclaration ; le relais reste indépendant.
