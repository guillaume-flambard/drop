# Socle ouvert et modèle économique

Cap adopté le 9 octobre 2026. Le code détenu par le projet est placé sous [Apache-2.0](../LICENSE). Le dépôt [github.com/memolabs-dev/drop](https://github.com/memolabs-dev/drop) est public depuis le 11 octobre 2026. Rendre le code lisible n'est pas un lancement : aucun paquet, aucun binaire et aucune offre ne sont publiés. Le nom drop reste provisoire.

## La frontière gratuit / payant

| Community gratuite, cible du socle                               | Accompagnement facturable                   | Organisation, offre future à valider                        |
| ---------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| App, CLI, relais auto-hébergé, A2A/MCP                           | Installation sur l'infrastructure du client | Administration d'un parc de Nodes                           |
| Consentement, chiffrement, politiques locales, filtrage et reçus | Intégration d'agents et sources internes    | Distribution centralisée de politiques et identités         |
| Modèles locaux ou internes, sans taxe par demande                | Maintenance et support contractualisés      | Consolidation des preuves d'audit et engagements de service |
| Adaptateurs ouverts et configuration manuelle                    | Formation et accompagnement                 | Fonctionnement également privé, licence hors ligne possible |

Les fonctions futures ne sont pas livrées par la présence dans cette table. La sécurité essentielle ne sert pas de verrou commercial. Aucun nombre artificiel de requêtes dans Community, aucun compte Memo Labs obligatoire et aucun cloud imposé. L'offre payante doit économiser du temps d'administration et apporter du support, tout en restant installable chez le client.

Commencer par l'accompagnement permet de valider ce que les équipes paient réellement avant de construire une console. Les prix de la [recherche](research/2026-10-09-positionnement.md) sont des hypothèses d'entretien, pas un tarif. Les dons ou sponsors sont un complément, pas une promesse de revenu. Aucun lancement commercial n'est décidé par cette préparation.

## La page d'accueil et les fichiers de contribution

Décision D86 : la page d'accueil du dépôt et les fichiers destinés aux contributeurs sont en anglais, avec une version française du README. Les documents internes (specs, décisions, guides sous `docs/` et `openspec/`) restent en français. Aucune adresse e-mail n'est publiée.

- [README](../README.md) en anglais et [README.fr](../README.fr.md) en français : ce qu'est drop, la promesse et sa limite, l'état réel, le démarrage.
- [CONTRIBUTING](../CONTRIBUTING.md) : installation, méthode OpenSpec, conventions de branches et de commits, revue des pull requests, règles de sécurité.
- [CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md) : Contributor Covenant 2.1 ; signalement au mainteneur par GitHub.
- [SECURITY](../SECURITY.md) : signalement privé de GitHub, périmètre, délais sans engagement de service, limites connues.
- [SUPPORT](../SUPPORT.md) : les questions vont dans GitHub Discussions, les bugs dans les issues.
- Formulaires d'issue (bug, proposition), modèle de pull request et `CODEOWNERS` sous `.github/` ; les issues vierges sont désactivées.
- [Vision](../openspec/project/vision.md), [architecture](../openspec/project/architecture.md), [critères futurs](ACCEPTANCE.md), [index](TASKS.md). Les tests locaux ne demandent aucune clé cloud.

Apache-2.0 est choisi pour faciliter l'usage et les contributions, y compris commerciaux, sans imposer un hébergement propriétaire. La licence du dépôt ne remplace pas celles des dépendances, des poids ou des contenus tiers. Aucune cession de droits, aucun CLA et aucune signature DCO ne sont demandés : contribuer signifie proposer sa contribution sous la même licence (section 5 d'Apache-2.0), avec les droits nécessaires.

## Ce qui reste avant toute publication de paquet, de binaire ou de lancement : T3.6

1. Vérifier le nom, les droits sur le code et les contributions, la licence de chaque dépendance embarquée, les images et les modèles éventuellement distribués. Produire les attributions et l'inventaire des composants du paquet.
2. Relire tout l'historique, les fixtures, captures, archives, artefacts et métadonnées. Retirer les données tierces ; révoquer tout secret exposé.
3. Séparer la CI publique des automatisations du lab. Fait le 11 octobre 2026 : toute la CI tourne sur des runners hébergés par GitHub, `build.yml` construit l'image sans la pousser sur une pull request et ne publie sur GHCR (`ghcr.io/memolabs-dev/drop`) que depuis `main` ou un tag `v*`, avec SBOM et attestation de provenance. Actions épinglées par SHA, permissions minimales par job, workflows audités par zizmor, OpenSSF Scorecard et Dependabot. Aucun job de contribution externe ne doit atteindre un runner interne, un déploiement ou un secret.
4. Tester une contribution depuis un clone propre sur runner hébergé, sans accès au lab ; vérifier les checks, le build et les liens. Documenter la création d'un adaptateur et un exemple borné.
5. Le signalement privé de GitHub est activé et décrit dans [SECURITY](../SECURITY.md) (accusé de réception visé sous une semaine, sans engagement de service). Reste à le tester de bout en bout.
6. Préparer versions, provenance, signatures, notarisation Mac, mises à jour vérifiées et voie hors ligne. Publier seulement les plateformes réellement testées.
7. Relire la landing : aucun badge de certification, benchmark, disponibilité de binaire ou garantie de non-fuite non prouvés. Obtenir l'accord du propriétaire avant de publier npm, un binaire ou une nouvelle version du site.

Le socle documentaire ne vaut pas audit de sécurité ni autorisation de publier un paquet. Voir les critères `AC-OSS-*` dans [ACCEPTANCE](ACCEPTANCE.md).
