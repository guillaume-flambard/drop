# Positionnement proposé pour drop

> Statut : recherche datée. Le cap privé et open source a été adopté le 9 octobre 2026 (D34 à D38). Les prix restent des hypothèses et les modèles des candidats non mesurés. Les décisions et chantiers actuels sont dans `docs/DECISIONS.md` et `docs/TASKS.md`.

Date : 9 octobre 2026. Cette recommandation a précédé la décision D34. Le cap privé est désormais adopté ; ciblage précis, prix et validation commerciale restent des hypothèses.

Cette note répond à un retour rapporté à Guillaume : un ingénieur d'un grand compte industriel rapporte que son entreprise utilise un protocole entre agents et refuse une dépendance à un serveur externe supplémentaire. J'interprète ici le terme employé comme Agent2Agent (A2A). Le protocole exact, le déploiement et le pouvoir d'achat de cet interlocuteur restent à confirmer. Ce témoignage révèle une objection ; il ne prouve ni une politique générale de son entreprise, ni une volonté de payer.

## Recommandation

Construire un outil open source de collaboration entre agents, compatible A2A et MCP, exploitable dans l'infrastructure du client. Commencer par les équipes techniques de PME qui doivent obtenir des réponses à partir de ressources auxquelles elles n'ont pas accès. Vendre d'abord une installation accompagnée et une maintenance au périmètre précis. Ajouter une édition d'administration d'entreprise quand plusieurs clients demandent les mêmes fonctions.

Positionnement proposé : **Vos agents obtiennent les réponses autorisées par vos collègues. Les accès restent chez leurs propriétaires. Vous exploitez drop dans votre infrastructure.**

La différenciation à démontrer est le parcours complet : demande bornée, décision lisible du propriétaire, exécution encadrée, résultat relu quand nécessaire, trace de la décision. A2A est le standard d'interopérabilité à utiliser. Le protocole drop peut documenter les contrats de capacité, les autorisations et les reçus qui rendent ce parcours vérifiable.

## Cible initiale et acheteur

Hypothèse de départ : éditeurs B2B et sociétés de développement de 20 à 200 personnes, avec une équipe de 5 à 30 utilisateurs d'agents, des dépôts, journaux ou outils internes détenus par des personnes différentes, et un responsable technique capable d'exploiter un petit service interne.

| Rôle                              | Besoin à vérifier                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Développeur, tech lead            | Débloquer son agent avec une réponse fiable sans multiplier les interruptions ni attendre un accès permanent |
| Propriétaire de la ressource      | Voir ce qui est demandé, ce qui sera consulté et ce qui sera transmis                                        |
| CTO ou responsable ingénierie     | Réduire une perte de temps mesurable et garder la maîtrise du déploiement et des données                     |
| Responsable sécurité, s'il existe | Examiner les frontières de confiance, les droits et les preuves avant l'adoption                             |

Cas d'entrée proposé : un développeur demande une synthèse bornée d'erreurs de production à un propriétaire qui conserve les accès. Une sortie structurée et déterministe constitue une première preuve plus étroite qu'une réponse libre sur tout le système d'information. Le raccordement à un agent A2A interne est un second parcours, avec des limites de contrôle explicites.

Exclusions commerciales initiales : particuliers, petites structures sans administrateur ni problème de droits distincts, entreprises cherchant un orchestrateur universel, achats exigeant dès le départ une couverture mondiale ou une astreinte permanente. Un contact grand compte reste utile pour tester les exigences et obtenir un sponsor technique ; cela ne remplace pas une première cible resserrée.

Les tailles ci-dessus servent à recruter les premiers évaluateurs. Ce ne sont pas des segments validés par une étude de marché. Le vrai filtre est la fréquence du problème, son coût et l'existence d'un acheteur.

## Ce que signifie fonctionner chez le client

Il faut distinguer trois profils de déploiement.

| Profil proposé       | Installation                                                                                                             | Frontière réelle                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Démonstration locale | Plusieurs agents et un relais sur une machine, sources de test, modèle local ou capacité déterministe                    | Aucun service distant nécessaire au scénario après installation                                               |
| Équipe privée        | Un petit relais sur une machine ou VM du client, Nodes sur les postes, accès via réseau interne ou VPN existant          | Aucune infrastructure Memo Labs requise ; chaque connecteur et fournisseur reste un choix explicite du client |
| Organisation isolée  | Même socle, modèles et sources internes, distributions transférables hors ligne, exploitation et administration internes | Pas de sortie Internet à l'exécution ; ce profil doit être prouvé par observation réseau et essais de panne   |

Un serveur HTTP interne, une interface locale et un relais interne peuvent rester utiles. Le critère produit est l'absence de dépendance obligatoire à notre service. Supprimer tout serveur obligerait à concevoir un autre transport, sa découverte et son fonctionnement entre réseaux. Le pair-à-pair direct peut devenir une optimisation si la mesure révèle un besoin ; il n'est pas nécessaire pour retirer la dépendance à Memo Labs.

A2A utilise des interfaces client/serveur et laisse l'autorisation concrète à l'implémentation. Sa spécification n'impose pas un cloud central du fournisseur. [Spécification officielle A2A](https://a2a-protocol.org/v1.0.1/specification/)

Un agent lancé sur un poste peut envoyer ses données à un modèle distant. Une offre sans cloud Memo Labs reste différente d'une offre sans aucun traitement externe : cette dernière doit couvrir le modèle du demandeur, celui de l'exécuteur, les agents A2A joints, les sources MCP, la télémétrie, la licence et les mises à jour. Une intégration à une application conversationnelle hébergée appartient à un profil qui autorise ce traitement externe.

## Frontière gratuite et payante

Découpage proposé, à valider par des usages et des achats réels.

| Offre                                                          | Ce qu'elle fournit                                                                                                                                                                                                                                             | Raison de l'achat                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Community, gratuite                                            | Code et contrats ouverts ; installation locale et auto-hébergement ; A2A/MCP ; modèle choisi par le propriétaire ; capacités bornées ; contrôles de sécurité essentiels ; consentement et relecture ; reçus locaux et export ; documentation                   | Adoption autonome, inspection, usage durable sans compte chez nous                                  |
| Installation et maintenance, payantes dès les premiers clients | Déploiement dans un environnement défini ; raccordement d'une ou deux capacités ; validation convenue avec le client ; formation ; correctifs et assistance pendant une durée définie                                                                          | Obtenir un usage opérationnel sans consacrer une équipe à intégrer et maintenir drop                |
| Organisation, payante plus tard                                | Administration de plusieurs équipes, intégration à l'annuaire, cycle de vie des identités, politiques centralisées, approbations à plusieurs niveaux, recherche et export d'audit vers les outils internes, mises à jour administrées, maintenance de versions | Exploiter à plusieurs équipes avec moins de travail administratif et des engagements de maintenance |

Le chiffrement, l'autorisation, la validation des sorties, les correctifs de sécurité et l'usage d'un modèle interne restent dans le socle gratuit. La version gratuite doit permettre une collaboration réelle entre collègues. L'édition payante reste déployable chez le client, y compris son administration. Un mécanisme de licence éventuel doit fonctionner hors ligne ; il ne doit pas affaiblir les protections à l'expiration du contrat.

LiteLLM fournit un précédent explicite : cœur auto-hébergé gratuit et édition Enterprise annuelle avec gouvernance et support, dont un mode isolé. Cela prouve l'existence de cette forme d'offre, pas sa rentabilité pour drop. [Tarification officielle LiteLLM](https://www.litellm.ai/pricing)

Hypothèses de prix à tester : une installation cadrée à **2 000 à 5 000 €**, puis un contrat annuel de maintenance ou une future édition Organisation à **6 000 à 12 000 €**, selon le périmètre. Ces montants sont des propositions de test, sans preuve actuelle de consentement à payer. Ne pas publier une grille avant d'avoir vérifié les coûts d'intégration et les besoins récurrents. Privilégier un forfait d'organisation ou de déploiement, sans commission sur chaque question ou jeton.

Dix contrats annuels à 6 000 € représenteraient 60 000 € de chiffre d'affaires annuel, avant charges et coût du support. Ce calcul n'est pas une prévision. Le temps consacré à chaque client détermine si l'activité reste viable pour une personne. Un support aux heures ouvrées et un périmètre contractuel limité sont plus crédibles au départ qu'une promesse de disponibilité permanente.

Un modèle entièrement open source avec prestations et support peut suffire si les clients achètent cela. Il conserve cependant une dépendance au temps du fondateur. La communication peut apporter des utilisateurs et des clients ; les téléchargements et les dons ne constituent pas, seuls, un revenu prévisible. L'édition payante doit naître de besoins administratifs répétés, pas d'une longue liste de fonctions imaginées à l'avance.

## Concurrence et alternative à battre

| Alternative                           | Ce qu'elle couvre d'après ses sources officielles                                                         | Conséquence pour drop                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A2A intégré en interne                | Interopérabilité et responsabilités d'authentification et d'autorisation                                  | Le protocole seul ne justifie pas un achat                                             |
| agentgateway / Solo                   | Passerelle pour trafic A2A, MCP et modèles ; politiques et offre Enterprise sur plusieurs infrastructures | La connectivité, la vitesse et le contrôle d'accès génériques sont déjà disputés       |
| agentdesktop                          | Gouvernance des outils sur les postes, configuration locale puis gestion d'un parc                        | Une app locale et une console d'administration ne sont pas des différences suffisantes |
| IBM ContextForge                      | Registre et proxy MCP/A2A, contrôles et gestion                                                           | Le client peut déjà assembler une infrastructure ouverte                               |
| Message à un collègue, réponse copiée | Résout immédiatement de nombreux besoins sans nouvelle installation                                       | drop doit gagner assez de temps pour justifier l'installation et les confirmations     |

Sources : [agentgateway](https://agentgateway.dev/), [Solo Enterprise](https://www.solo.io/blog/introducing-solo-enterprise-for-agentgateway-on-any-infrastructure), [agentdesktop](https://agentdesktop.dev/), [ContextForge](https://github.com/IBM/mcp-context-forge). Détails et limites dans la [note de sources](2026-10-09-a2a-market-sources.md).

L'hypothèse de distinction reste la simplicité d'un échange borné entre propriétaires. Les docs consultées ne prouvent pas qu'un concurrent ne puisse reproduire ce parcours. Une alternative raisonnable serait de fournir cette couche sur une infrastructure existante, si réutiliser une passerelle réduit le travail sans modifier les garanties.

## Sécurité : promesse démontrable

Promesse proposée : chaque demande précise qui sollicite quelle capacité, pour quel résultat ; le propriétaire contrôle l'exécution et la remise de la réponse ; les destinations réseau suivent la politique du client.

Une réponse autorisée transmet nécessairement de l'information. L'objectif est de borner cette divulgation et de bloquer les sorties interdites. Un schéma valide et un scanner de secrets n'empêchent pas toutes les révélations d'informations sensibles : une réponse en langage naturel peut contenir un secret métier sans ressembler à une clé API. Le chiffrement protège le transport, pas le jugement de l'agent destinataire.

L'évaluation doit couvrir notamment les demandes piégées, les réponses invalides, les secrets connus et métier, les demandes répétées permettant d'inférer une information, les droits révoqués, les sorties réseau et les journaux. La relecture humaine est une protection complémentaire ; elle peut aussi créer une friction et une fatigue d'approbation à mesurer.

Le cas d'un agent A2A existant exige une frontière séparée : drop contrôle ce qu'il envoie et ce qu'il remet au demandeur, mais n'obtient pas automatiquement le contrôle des outils, du modèle ou du réseau de cet agent. Un connecteur compatible ne constitue donc pas une preuve d'exécution confinée.

Le premier test de souveraineté devrait installer les composants, bloquer les sorties Internet, puis exécuter le scénario complet avec un modèle interne et des sources internes. Observer les tentatives de connexion et vérifier le comportement quand relais, modèle ou approbateur sont indisponibles. Aucune garantie « zéro fuite » ne découle de cette recherche documentaire.

## Écart avec le dépôt inspecté

Inspection statique seulement ; aucun test d'exécution ou audit de sécurité effectué pendant cette recherche.

| Constat vérifiable                                                                                                | Preuve locale                                                                                                   | Conséquence                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A2A entrant et sortant existent ; SDK officiel 1.3.0, protocole ciblé 1.0                                         | `packages/a2a/package.json`, `packages/node/src/a2a-inbound.ts`, `packages/capabilities/src/a2a-answer.ts`, D33 | Mettre A2A en évidence relève déjà en partie du positionnement ; l'interopérabilité avec l'agent du client reste à tester |
| Le Node utilise un relais dont l'URL est configurable par la CLI                                                  | `packages/node/src/home.ts`, `packages/node/src/cli.ts`, `packages/node/src/daemon.ts`                          | Un relais exploité par le client est une base existante ; un parcours sans relais n'est pas établi                        |
| L'app Mac initialise le Node avec `wss://drop.memolabs.dev/v1`                                                    | `apps/desktop/src-tauri/src/main.rs`, constante `RELAY` et fonction d'initialisation                                | Le parcours simple ne matérialise pas encore le choix d'infrastructure du client                                          |
| Le fournisseur par défaut est OpenRouter ; son endpoint est configurable                                          | `packages/capabilities/src/llm.ts`, D20                                                                         | Une exécution du daemon sur un poste ne prouve pas que le traitement reste local                                          |
| Le financement fourni par le demandeur peut remplacer l'endpoint du modèle ; `payer: owner` écarte ce financement | `packages/capabilities/src/llm.ts`, `packages/node/src/engine.ts`, `packages/node/src/home.ts`                  | Le profil privé doit fixer les destinations autorisées indépendamment de qui paie                                         |
| La passerelle grand public prévue voit questions et réponses en clair                                             | `docs/DECISIONS.md`, D31                                                                                        | Ce parcours doit être distingué de celui sans traitement externe                                                          |
| Le scénario nommé local utilise OpenRouter pour la partie dépôt                                                   | `scripts/demo-local.sh`, `README.md`                                                                            | Cette démo n'est pas une preuve de fonctionnement isolé                                                                   |
| Aucun fichier LICENSE ou COPYING versionné trouvé                                                                 | `git ls-files '*LICENSE*' '*COPYING*'`, sortie vide                                                             | Choisir et publier explicitement la licence avant de distribuer le socle comme open source                                |

La vision et certaines décisions décrivent un relais privilégié, un fournisseur distant par défaut et une passerelle hébergée. La proposition ci-dessus introduirait un profil privé prioritaire. Elle nécessiterait une change OpenSpec approuvée pour modifier les contrats, les parcours et les critères d'acceptation concernés. La présente note ne les remplace pas.

## Validation avant d'élargir le produit

1. Confirmer le retour de cet ingénieur : A2A exact, scénario déjà déployé, objection au traitement externe, à la dépendance de disponibilité, au coût ou à l'installation d'un service supplémentaire. Demander qui peut autoriser l'essai et qui achèterait la maintenance.
2. Examiner trois situations récentes dans la cible proposée : ressource inaccessible, contournement employé, temps perdu, réponse minimale utile, personne autorisée à la transmettre. Une réponse copiée manuellement est le point de comparaison.
3. Conserver le seuil de besoin déjà décidé en D24 : au moins trois développeurs et dix jours actifs chacun ; GO à partir de 0,5 blocage YES par dev-jour et une médiane d'au moins dix minutes perdues. Cette note n'en constate pas le franchissement.
4. Préparer une preuve technique privée reproductible : installation cible inférieure à quinze minutes hors téléchargement du modèle, sources synthétiques, refus et relecture, modèle interne, aucune sortie Internet et reprise après panne. C'est un objectif de vérification, pas une performance mesurée.
5. Après les conditions de pilote prévues par le projet, tester une installation payante à périmètre fermé. Un accord budgétaire puis un paiement apportent une preuve commerciale que les marques d'intérêt ne fournissent pas.
6. Construire l'administration payante seulement lorsqu'au moins deux organisations réclament le même besoin récurrent et acceptent d'en financer la maintenance. Ce seuil est proposé, pas adopté.

Risque décisif : le client peut refuser un cloud supplémentaire tout en n'ayant aucun besoin de drop. Si le blocage est rare, si tous les utilisateurs possèdent déjà les mêmes accès, si les approbations annulent le gain de temps ou si l'existant suffit, ne pas élargir la plateforme pour masquer l'absence de demande.

## Messages à tester

- Trois mots : **Réponses sous contrôle.**
- Une phrase : **Vos agents obtiennent les réponses autorisées par vos collègues, dans votre infrastructure.**
- Trois lignes : Connectez les agents existants via A2A ou MCP. Chaque propriétaire contrôle les demandes et les résultats transmis. Les accès et l'exploitation restent chez vous.
- Trente secondes : Quand un agent a besoin d'une information détenue par un collègue, drop lui permet de demander une réponse bornée. Le propriétaire accepte, l'exécution utilise la capacité qu'il a définie, et le résultat peut être relu avant transmission. L'équipe exploite le système sur ses machines ou son infrastructure privée.
- Deux minutes : Partir d'un incident où un développeur attend une synthèse de production. Montrer la demande, le refus possible, l'accord unique, le résultat autorisé et le reçu. Montrer ensuite quels fichiers et outils ont été accessibles, quel modèle a traité les données et où le réseau a circulé. Terminer par la différence entre installation autonome gratuite et maintenance accompagnée payante. Le scénario doit fournir les preuves ; le discours seul ne les remplace pas.
- Technique : A2A expose et consomme des agents ; MCP relie les outils existants. drop ajoute une capacité déclarée, une décision du propriétaire, des contrôles déterministes et une trace. Les composants, destinations et fournisseurs sont choisis dans une politique de déploiement privée. La version actuelle ne démontre pas encore l'ensemble de ce profil.

## Vérification de cette note

Périmètre : recherche et recommandation, sans implémentation, publication, contact commercial ou décision irréversible.

- Intention et critères : proposer une cible, un déploiement sans dépendance Memo Labs, une frontière gratuit/payant et un moyen de les invalider.
- Travail réalisé : lecture de la vision et des décisions ; inspection des chemins concernés ; consultation de sources primaires ; comparaison des offres ; rédaction de la recommandation.
- Preuves : chemins locaux ci-dessus, liens officiels et note de sources liée.
- Contrôle contradictoire : alternatives gratuites et manuelles incluses ; souveraineté distinguée de l'auto-hébergement ; compatibilité distinguée du confinement ; absence de preuve d'achat explicitée.
- Vérification documentaire effectuée : relecture indépendante contre les sources officielles, sans correction factuelle demandée ; `pnpm exec prettier --check` sur les deux notes, réussi ; liens locaux et ponctuation interdite vérifiés par script, réussis.
- Vérification logicielle, build et déploiement : non applicables à cette note documentaire ; aucune validation du produit n'en est déduite.
- Suite humaine : choisir ou rejeter ce positionnement avant de modifier les contrats et le périmètre produit. Les prix, la cible et la différenciation restent des hypothèses.
