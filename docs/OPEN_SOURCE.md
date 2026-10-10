# Socle ouvert et modèle économique

Cap adopté le 9 octobre 2026. Le code détenu par le projet est placé sous [Apache-2.0](../LICENSE). Le dépôt est encore privé ; ni l'ajout de licence ni cette page ne constituent une publication. Le nom drop reste provisoire.

## La frontière gratuit / payant

| Community gratuite, cible du socle                               | Accompagnement facturable                   | Organisation, offre future à valider                        |
| ---------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| App, CLI, relais auto-hébergé, A2A/MCP                           | Installation sur l'infrastructure du client | Administration d'un parc de Nodes                           |
| Consentement, chiffrement, politiques locales, filtrage et reçus | Intégration d'agents et sources internes    | Distribution centralisée de politiques et identités         |
| Modèles locaux ou internes, sans taxe par demande                | Maintenance et support contractualisés      | Consolidation des preuves d'audit et engagements de service |
| Adaptateurs ouverts et configuration manuelle                    | Formation et accompagnement                 | Fonctionnement également privé, licence hors ligne possible |

Les fonctions futures ne sont pas livrées par la présence dans cette table. La sécurité essentielle ne sert pas de verrou commercial. Aucun nombre artificiel de requêtes dans Community, aucun compte Memo Labs obligatoire et aucun cloud imposé. L'offre payante doit économiser du temps d'administration et apporter du support, tout en restant installable chez le client.

Commencer par l'accompagnement permet de valider ce que les équipes paient réellement avant de construire une console. Les prix de la [recherche](research/2026-10-09-positionnement.md) sont des hypothèses d'entretien, pas un tarif. Les dons ou sponsors sont un complément, pas une promesse de revenu. Aucun lancement commercial n'est décidé par cette préparation.

## Ce qui est préparé maintenant

- [Licence](../LICENSE), [contribution](../CONTRIBUTING.md), [signalement de sécurité](../SECURITY.md).
- Modèles GitHub de bug, proposition et pull request ; tests locaux sans clé cloud.
- [Vision](../openspec/project/vision.md), [architecture](../openspec/project/architecture.md), [critères futurs](ACCEPTANCE.md), [index](TASKS.md).

Apache-2.0 est choisi pour faciliter l'usage et les contributions, y compris commerciaux, sans imposer un hébergement propriétaire. La licence du dépôt ne remplace pas celles des dépendances, des poids ou des contenus tiers. Aucune cession de droits ni CLA supplémentaire n'est demandée ici ; contribuer signifie proposer sa contribution sous la même licence, avec les droits nécessaires.

## Avant toute ouverture publique : T3.6

1. Vérifier le nom, les droits sur le code et les contributions, la licence de chaque dépendance embarquée, les images et les modèles éventuellement distribués. Produire les attributions et l'inventaire des composants du paquet.
2. Scanner et relire tout l'historique, les fixtures, captures, archives, artefacts et métadonnées. Retirer les données tierces ; révoquer tout secret exposé avant de publier un historique corrigé.
3. Séparer la CI publique des automatisations du lab. `.github/workflows/build.yml` est généré et utilise actuellement une infrastructure privée : sa source doit être adaptée avant ouverture. Aucun job de contribution externe ne doit atteindre un runner interne, un déploiement ou un secret.
4. Tester une contribution depuis un clone propre sur runner hébergé, sans accès au lab ; vérifier les checks, le build et les liens. Documenter la création d'un adaptateur et un exemple borné.
5. Activer et tester le signalement privé GitHub avant la publication, définir le responsable et un délai de première réponse soutenable.
6. Préparer versions, provenance, signatures, notarisation Mac, mises à jour vérifiées et voie hors ligne. Publier seulement les plateformes réellement testées.
7. Relire la landing : aucun badge de certification, benchmark, disponibilité de binaire ou garantie de non-fuite non prouvés. Obtenir l'accord du propriétaire avant de changer la visibilité, publier npm, un binaire ou le site.

Le dépôt reste privé tant que ces points ne sont pas vérifiés. Le socle documentaire de T3.0 ne vaut pas audit de sécurité ni autorisation de publier. Voir les critères `AC-OSS-*` dans [ACCEPTANCE](ACCEPTANCE.md).
