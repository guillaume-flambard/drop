# Recherche marché A2A pour drop

> Statut : recherche datée. Le cap privé et open source a été adopté le 9 octobre 2026 (D34 à D38). Les prix restent des hypothèses et les modèles des candidats non mesurés. Les décisions et chantiers actuels sont dans `docs/DECISIONS.md` et `docs/TASKS.md`.

Date de consultation : 9 octobre 2026. Note non normative issue de sources officielles. Les fonctions sont documentées ou annoncées par leurs éditeurs, pas auditées indépendamment.

## Limite du protocole

A2A standardise la découverte via Agent Card et les échanges de messages et de tâches entre agents, indépendamment de leur framework. La spécification 1.0.1 demande TLS en production et l’authentification de chaque requête par le serveur. Après authentification, le serveur applique ses propres règles d’autorisation, qui sont spécifiques à l’implémentation. Une tâche peut passer en `AUTH_REQUIRED` pour demander une autorisation au client, sans imposer pour autant une validation humaine à chaque action. [Présentation A2A](https://a2a-protocol.org/latest/topics/what-is-a2a/), [spécification 1.0.1, §7](https://a2a-protocol.org/v1.0.1/specification/)

Donc A2A ne garantit ni où l’agent tourne, quelles données il lit, si son fournisseur reçoit ces données, ni si elles sont journalisées. Un agent local peut appeler des services distants. « Compatible A2A » ou « auto-hébergé » ne prouve pas zéro exfiltration. Cette dernière conclusion est une inférence de la portée de la spécification.

## Recouvrement concurrentiel

### Agentdesktop, concurrent le plus proche côté poste de travail

Agentdesktop, créé par Solo.io, est un produit open source sous Apache-2.0 pour inventorier, configurer et gouverner les outils IA sur un poste ou une flotte. En mode autonome, le daemon lit un YAML local, applique une configuration aux outils et peut s’authentifier directement auprès d’une passerelle, sans contrôleur ni identité d’appareil. En mode flotte, un contrôleur distribue la configuration, gère l’inventaire et certaines télémétries, et peut émettre des JWT de courte durée. Les outils parlent directement à la passerelle : le contrôleur ne relaie pas le trafic modèle. [Site et modes](https://agentdesktop.dev/), [docs standalone](https://agentdesktop.dev/docs/getting-started/standalone/), [docs architecture](https://agentdesktop.dev/docs/)

**Recouvrement avec drop :** fort sur le poste local, la configuration et la gouvernance des outils agents, avec chemin vers la flotte. **Différence à vérifier :** Agentdesktop gouverne l’inventaire et la configuration des outils du poste ; son site ne décrit pas le flux drop « poser une question bornée à un environnement tiers, faire autoriser la demande par son propriétaire, puis ne renvoyer que le résultat autorisé ». Cela identifie un angle différenciant à tester, pas une absence absolue de fonctions extensibles. Le site annonce 100 % open source ; les sources consultées ne montrent pas de palier payant ou de prix Agentdesktop.

### agentgateway et Solo Enterprise

Le projet agentgateway est une passerelle proxy Apache-2.0. Son README annonce un proxy A2A, la découverte et la collaboration sur tâches, ainsi que JWT, clés API, OAuth, RBAC/CEL, limites et OpenTelemetry. La documentation montre des politiques d’autorisation applicables au trafic vers les agents. [Dépôt officiel](https://github.com/agentgateway/agentgateway), [architecture](https://agentgateway.dev/docs/kubernetes/latest/documentation/about/architecture/), [autorisation](https://agentgateway.dev/docs/kubernetes/latest/documentation/security/authorization/)

Solo vend aussi Solo Enterprise for agentgateway, en mode Kubernetes ou autonome sur VM, ECS ou bare metal. L’offre ajoute une UI de gestion, configuration et inspection des traces, ainsi que des fonctions MCP comme composition, code mode et search mode. Le tarif n’est pas public dans les sources consultées. [Annonce Solo Enterprise du 10 septembre 2026](https://www.solo.io/blog/introducing-solo-enterprise-for-agentgateway-on-any-infrastructure), [page produit](https://www.solo.io/products/agentgateway-enterprise/demo)

**Recouvrement :** très fort pour la passerelle et la gouvernance A2A, surtout en environnement entreprise. La proposition drop devrait se définir par l’unité de demande, le propriétaire qui autorise et la frontière d’exécution, plutôt que par la seule connectivité ou les politiques de proxy.

### IBM ContextForge

ContextForge est un registre et proxy open source Apache-2.0 qui fédère MCP, A2A et API REST/gRPC. Les docs décrivent enregistrement et invocation d’agents, passthrough JSON-RPC, exposition des agents comme outils MCP, RBAC avec portée de jeton, métriques et fédération. [Dépôt officiel](https://github.com/IBM/mcp-context-forge), [docs A2A](https://ibm.github.io/mcp-context-forge/latest/using/agents/a2a/)

La politique de sécurité recommande de désactiver l’UI et l’API admin en production, de bâtir sa propre UI de production et d’intégrer d’autres composants IAM, proxy, gestion de secrets et surveillance. Elle mentionne l’absence de correctifs rétroportés, de branche LTS et de support commercial officiel. La doc de terminologie indique que les actions A2A ne figurent pas dans le flux d’audit comme les actions MCP. [Politique de sécurité](https://github.com/IBM/mcp-context-forge/blob/main/SECURITY.md), [limite d’audit documentée](https://ibm.github.io/mcp-context-forge/latest/overview/terminology/)

**Recouvrement :** très fort sur l’enregistrement, l’invocation, la fédération et le contrôle d’accès A2A. Une UI de consentement lisible et une preuve d’autorisation pourraient différencier drop, mais les sources ne prouvent pas que ContextForge ne puisse être adapté.

### LiteLLM, précédent open-core auto-hébergé

LiteLLM est surtout une passerelle LLM auto-hébergée, avec interfaces MCP et agents. OSS annonce clés virtuelles, équipes, budgets, limites, logs et métriques. Enterprise ajoute SSO/SCIM, OIDC/JWT, audit, gestion des secrets, rôles d’organisation et support ; auto-hébergement et air-gap sont proposés. Le prix Enterprise est sur devis, suivant capacité de requêtes, architecture et support. LiteLLM déclare le cœur MIT et une licence payante pour les fonctions Enterprise. [Tarifs](https://www.litellm.ai/pricing), [docs Enterprise](https://docs.litellm.ai/docs/enterprise), [licence et déploiement déclarés](https://www.litellm.ai/about)

**Recouvrement :** moyen, car sa proposition principale est le routage et la gestion de consommation LLM, même si elle englobe agents et outils. **Implication :** précédent concret d’un cœur auto-hébergé ouvert avec gouvernance, sécurité et support payants. Cela ne prouve ni la disposition à payer pour drop, ni un tarif adapté.

## Références adjacentes

- **Infisical** n’est pas un concurrent A2A. Son plan Enterprise sur devis inclut auto-hébergement ou infrastructure dédiée, approbations d’accès, groupes, audit/SIEM et SLA. Précédent adjacent pour la vente de gouvernance et de déploiement privé, sans extrapolation de prix au marché des agents. [Tarifs officiels](https://infisical.com/pricing)
- **Microsoft Entra Agent ID** fournit des identités d’agents sous forme de principaux de service d’un tenant Entra, avec blueprints, jetons et contrôles d’administration. C’est une brique IAM cloud, pas une solution locale de collaboration ou d’exécution A2A. [Documentation Microsoft](https://learn.microsoft.com/en-us/entra/agent-id/agent-identities)

## Implications et hypothèses à tester

1. L’étiquette A2A ou agent gateway ne différencie pas drop : agentdesktop, agentgateway et ContextForge documentent déjà des fonctions proches sur poste, passerelle ou registre.
2. Tester une promesse centrée sur une requête bornée, l’autorisation explicite par le propriétaire de l’environnement, une exécution limitée et le retour du seul résultat approuvé. C’est le contraste produit potentiel avec la gouvernance d’inventaire ou de trafic, pas encore une preuve de supériorité.
3. Définir « souveraineté » par des paramètres vérifiables : emplacement du runner, fichiers et outils autorisés, destinations réseau, fournisseur LLM, logs, rétention et preuve du consentement. Un relais ou un gateway auto-hébergé ne garantit pas que les données restent locales.
4. Un cœur local et ouvert avec installation/support payants est un premier modèle moins risqué à tester ; administration d’équipe, politiques, audit et déploiement isolé peuvent devenir des offres entreprise si la demande est démontrée. LiteLLM et Solo sont des précédents, pas une validation de prix ou de demande pour drop.

Inconnues : qui paie pour un contrôle d’autorisation entre propriétaires d’agents ; quelle valeur les petites équipes donnent à l’installation locale ; quels journaux et preuves l’entreprise exige ; et si l’implémentation drop rend le consentement fiable et vérifiable. Cette note ne valide pas l’implémentation de drop. Les prix de Solo Enterprise et LiteLLM Enterprise ne sont pas publics. Toutes les capacités ci-dessus sont rapportées d’après les sources officielles au 9 octobre 2026, sans essai d’exécution indépendant.
