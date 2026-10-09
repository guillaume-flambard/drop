# READY FOR MANUAL ACCEPTANCE — T3.1

## Résultat et périmètre

Un profil privé configurable, un relais interne assemblé, des sorties réseau en allowlist, une migration réversible et des reprises sans réutilisation d’accord sont implémentés. Les preuves sont dans evidence.md. Les étapes DISCOVER → MODEL → SPECIFY → DECOMPOSE → IMPLEMENT → VERIFY sont conservées dans proposal/design/specs/tasks ; CLOSE archive cette change. L’intention est satisfaite quand AC-PRIVATE-01 à 08 sont vérifiés dans ce périmètre, avec les limites visibles.

P0 ouverts : 0. P1 ouverts : 0. Critères techniques en attente/échoués : 0/0. Aucun défaut critique/élevé courant établi après correction et revue native. État contrôlé par l’agent : READY_FOR_MANUAL_ACCEPTANCE, pas DONE produit. L’audit CSO reste partiel et son finding historique non clos par l’outil.

## Couverture et risques

| Catégories | Classement et preuve |
| --- | --- |
| Comportement, états vides/chargement/erreur, refus/annulation, reprises, idempotence | Applicables : init sans publication ; tests système/replay, refus sans accès ; état relais et erreurs stables. UI générale inchangée. |
| Persistance, intégrité, restauration, concurrence, migration, compatibilité | Applicables : sauvegarde exclusive 0600, verrou, conflit, remplacement atomique ; migration hors ligne. Config legacy conservée explicitement, modèle désormais obligatoire. |
| Authentification, autorisation, sécurité, vie privée | Applicables : admission/révocation, TLS, destinations et financement ; tests de non-envoi, schémas/scanner existants régressés. Risque de source tierce réduit par refus des processus et isolation opérateur documentée. |
| Réseau, hors ligne, intégrations | Applicables : capture Docker et tests MCP/A2A. Limite IP sans DNS explicite ; aucun nouveau SDK. Les vrais agents/modèles sont hors preuve. |
| Performance, stockage | Applicables : suite et scénarios bornés, aucune boucle de repli ; tombstones sans contenu conservés avec les reçus pour l’anti-rejeu. Pas de benchmark de modèle dans T3.1. |
| Logs, diagnostic, métriques | Applicables : codes stables et métadonnées ; aucune télémétrie ajoutée. Diagnostic manuel expurgé dans le guide. |
| Build, packaging, déploiement, rollback | Applicables : bundles, smoke relais, compilation Rust, recette conteneur ; aucun déploiement distant. Distribution signée distincte T3.4. |
| Tests unitaires/intégration/système/runtime, docs, expérience développeur | Applicables : EV-01 à 09 ; 262 tests, guide et liens du site. |
| Accessibilité | Pas de nouveau contrôle UI interactif ; liens/sémantique existants conservés. Recette VoiceOver complète réservée à T3.4. |
| Cache, jobs, métriques de production | Aucun nouveau mécanisme : non applicable à cette change. |
| Nettoyage d’ancien comportement | Bootstrap lab et défaut OpenRouter retirés ; démo historique explicitement legacy ; exports MCP sans effet de bord. |

Risques résiduels bornés : compatibilité des sources tierces et politiques réseau réelles à qualifier chez le client ; couverture CSO automatique partielle (revue native compensatoire, aucune clôture formelle du finding par l’outil). Pas de garantie universelle de non-fuite. La clé du modèle ne doit jamais être jointe au diagnostic.

## Graphe exécuté

1.1 (politique/financement, P0) → 1.2 (adaptateurs, P0) → 3.1 (système, P0) → 3.2 (capture, P1).
2.1 (migration, P1), 2.2 (exploitation, P1) et 2.3 (bootstrap, P1) alimentent 3.1.
4.1 (checks, P1) et 4.2 (revues, P1) suivent 3.2 ; 4.3 (preuves/docs/clôture, P1) suit les deux. Chaque tâche renvoie aux EV et AC dans evidence.md. Défauts découverts HTTP 600 et import executable : corrigés dans 1.2/3.1, régressions dédiées. Preuve TLS ajoutée dans 4.1, sans nouvelle dépendance runtime.

## Acceptation manuelle courte

1. Lire les limites du guide PRIVATE_PROFILE et confirmer qu’elles conviennent à cette première version.
2. Sur une installation de test, suivre le démarrage du relais et des deux Nodes ; accepter puis refuser une demande interne.
3. Constater la conservation de l’identité après migration/retour arrière et l’absence de repli en cas de panne du modèle.

Les tests ont déjà exercé ces chemins ; cette acceptation vérifie leur adéquation au besoin. Le modèle réel, le raccordement groupé et l’installateur public ne sont pas requis pour accepter T3.1 : ils restent explicitement dans T3.2 à T3.6. Prochaine ligne disponible : T3.1a, évaluation Hermes.
