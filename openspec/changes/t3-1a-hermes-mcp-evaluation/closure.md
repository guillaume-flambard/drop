# Acceptation T3.1a — évaluation Hermes

## Résultat attendu et décision

Cette tâche est satisfaite quand le raccordement Hermes réel a été exercé, ses limites réseau/modèle sont explicites et une décision de maintenance/retrait existe. D42 retient la recette manuelle, diffère l’adaptateur automatique. Aucun changement du runtime Drop ni contrat nouveau. DISCOVER → MODEL → SPECIFY → DECOMPOSE sont dans proposal/design/tasks ; IMPLEMENT et VERIFY dans scripts/hermes-proof et evidence.md. L’archivage réalise CLOSE après revue.

## Couverture et risques

| Catégories | Traitement |
| --- | --- |
| Comportement, API, intégration, autorisation, intégrité | Applicables : EV-02, trois outils réels, pas de résultat sans accord. |
| Attente, refus, expiration, erreurs, retries, annulation | Applicables : pending puis décision ; horloge injectée ; 503 borné, timeout et suppression du conteneur. Pas de nouvelle UI d’annulation. |
| Persistance, restauration, migration, concurrence, idempotence, compatibilité | Aucun comportement produit changé ; suite existante régressée. Profil d’essai jetable, pas de migration utilisateur. Compatibilité limitée au commit amont consigné. |
| Sécurité, vie privée, authentification, réseau, hors ligne | Applicables : API Drop authentifiée, profil isolé, aucune clé réelle, réseau none et observation. Diagnostic local Hermes connu et documenté. |
| Chargement/état vide, UX, accessibilité | Pas de nouvelle interface interactive. Liens du site et guide testés ; catalogue non vide de fixture. Parcours utilisateur réel différé à T3.3/T3.5. |
| Performance, cache, métriques | Aucun benchmark modèle ni nouveau cache/métrique produit. Timeout d’essai 120 s, mémoire et installation Hermes non optimisées ; image de preuve distincte du produit. |
| Logs, diagnostics, observabilité | Métadonnées réseau et résultats synthétiques ; avertissement sur le diagnostic local Hermes, aucune télémétrie ajoutée par Drop. |
| Tests unitaires/intégration/système/runtime | Suite existante et recette externe réelle. Pas de faux client Hermes substitué ; fournisseur simulé explicitement. |
| Build, packaging, déploiement, rollback | Bundle de preuve et site ; Docker jetable, retrait documenté. Aucun installateur ou déploiement externe. |
| Documentation, expérience développeur, nettoyage | Guide rejouable, pin, relevé dépendances, index/bilan/site mis à jour. Aucun ancien comportement supprimé. |

Risques de départ : sorties réseau implicites et faux succès client (élevés) réduits par EV-02/03 et périmètre de preuve explicite ; aucun feu vert général pour une configuration Hermes personnelle. Compatibilité amont et installation lourde (moyens) contenues par absence de dépendance runtime et pin. Attente indéfinie (moyen) bornée par timeout. Modèle réel absent : écart documenté conformément à AC-HERMES-02, prochaine tâche T3.2, pas une validation implicite. La revue de la branche complète a découvert un risque élevé ancien dans la persistance anti-rejeu de T3.1. Il est ouvert en T3.1b, avant pilote ; cette évaluation Hermes n’est pas une attestation de sécurité globale du runtime.

## Acceptation manuelle

1. Lire docs/HERMES.md et confirmer que la recette facultative, sans installation automatique, convient à cette étape.
2. Sur la page locale d’avancement, ouvrir la recette et constater la séparation entre MCP éprouvé et vrai modèle encore à qualifier.
3. Si souhaité, rejouer la commande Docker et obtenir `status: PASS` sans toucher aux profils personnels.

Les tests techniques sont exécutés par l’agent ; l’acceptation porte sur la décision produit. Aucun modèle payant ou téléchargement de poids n’est nécessaire pour cette recette. Prochaine tâche de l’index : T3.2. Cette clôture ne termine pas le chantier global d’onboarding ou de distribution Mac.

La revue contradictoire propre au delta T3.1a n’a trouvé aucun défaut P1/P2. La revue gstack formelle de la branche complète a conclu `issues_found` avec un CRITICAL hérité de T3.1, ouvert en T3.1b. Son rapport et sa QA partielle sont dans EV-05. P0 T3.1a ouverts : 0 ; P1 de clôture T3.1a ouverts : 2 (verdict non clean et état final) ; critères Hermes vérifiés : 3/3 avec l’écart de vrai modèle déclaré ; risque critique de branche : 1. Statut : **VERIFYING**. Ne pas archiver ni marquer cette tâche done tant que le risque critique et la revue ne sont pas résolus.
