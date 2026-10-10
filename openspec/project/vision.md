# Vision et périmètre

Cap adopté le 9 octobre 2026 à la demande du propriétaire (D34 à D38). Ce document décrit le produit visé. Le [bilan](../../docs/AVANCEMENT.md) sépare le prototype vérifié de ce qui reste à construire. Les contrats normatifs vivent dans `openspec/specs/`.

## Le produit

**Faire collaborer les agents d’une équipe, dans son infrastructure, en ne transmettant que les réponses autorisées.** Un agent pose une question bornée, le propriétaire de la source autorise son exécution, puis seul le résultat validé revient. **Get the answer, not the access.**

Nous fournissons l’outillage de consentement, les capacités typées, les connecteurs MCP et l’interopérabilité A2A. A2A est un standard existant que nous implémentons, pas un protocole propriétaire à imposer. Notre valeur réside dans le raccordement simple et la maîtrise de ce qui peut être demandé, exécuté et retourné.

## Pour qui

Première cible : petites équipes techniques qui ont déjà plusieurs agents et des informations réparties entre collègues, avec un responsable capable de gérer leur environnement. Le critère est un besoin récurrent de réponse entre propriétaires. Les entreprises peuvent utiliser leurs modèles, agents A2A et connecteurs internes sur le même socle.

Un développeur installe l’app, raccorde ses agents, rejoint son équipe, puis demande une réponse sans demander l’accès à la source. Le propriétaire garde la décision. Une organisation doit pouvoir installer le relais chez elle et travailler sans compte Memo Labs ni service de licence externe obligatoire.

## Expérience cible

- Mac d’abord : une icône discrète de barre de menus, les consentements et les demandes en cours.
- Deux confirmations après installation : analyser les configurations compatibles, puis connecter les agents sélectionnés. Aucun partage implicite. Voir [le parcours](../../docs/ONBOARDING.md).
- Tauri 2 et le moteur Node existant ; Windows puis Linux avec adaptation et vérification par plateforme.
- Le modèle déjà disponible chez le client passe en premier. Les capacités déterministes ne demandent aucun modèle. Ollama avec Qwen3.5 est une option à qualifier, pas un prérequis universel.

## Principes

1. Une capacité fixe entrée, sortie, outils, budget et approbateur avant la demande. Le LLM ne décide jamais des permissions.
2. Une requête distante est une donnée non fiable. Autorisation et contrôles de sortie restent déterministes.
3. Le profil privé fonctionne dans le périmètre du client. Il peut comprendre un service HTTP ou WebSocket local ou interne : sans serveur externe imposé ne signifie pas sans serveur.
4. Aucune sortie réseau non autorisée ni repli cloud silencieux dans ce profil cible. Le payeur ne change pas la destination des données du propriétaire.
5. Le chiffrement et le scanner de secrets ne prouvent pas l’absence de toute fuite. Connecteurs, modèles et agents joints font partie de la frontière à vérifier.
6. Sécurité essentielle, auto-hébergement et modèles internes appartiennent au socle gratuit.

## Gratuit et payant

**Community sous Apache-2.0** : protocole et capacités, A2A/MCP, relais privé, application, consentement, filtrage et reçus locaux. Pas de taxe par requête ni de service propriétaire obligatoire. Les fonctions encore absentes suivent l’index.

**Accompagnement payant** : installation, intégration, maintenance et support contractualisés. **Administration d’organisation envisagée** : politiques administrées, gestion de parc et preuves d’audit, également installables chez le client. Ce futur produit payant n’est ni livré ni tarifé. Identité, chiffrement et contrôle des sorties ne deviennent pas des options payantes.

Les dons peuvent aider ; ils ne constituent pas un revenu prévisible. La recherche commerciale reste une hypothèse à valider, sans lancement d’offre pendant la phase HARNESS FIRST. Voir [le cadre open source](../../docs/OPEN_SOURCE.md).

## Ordre et limites

L’ordre unique est [TASKS](../../docs/TASKS.md). T3.0 prépare les documents, le contrat documentaire et la présentation. T3.1 à T3.8 construisent et vérifient le profil privé, les modèles, le raccordement, la distribution et les ports. La passerelle cloud grand public est séparée du parcours privé. D24 conditionne toujours le pilote à une mesure du besoin.

Hors cible actuelle : conversation libre entre agents, délégation ouverte de tâches longues, partage d’identifiants, remplacement des agents existants, RAG d’entreprise et console payante complète. Le dépôt reste privé tant que la préparation de publication n’est pas validée.

## Vocabulaire

| Terme      | Sens                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| Owner      | Propriétaire d’une capacité : personne, équipe, machine ou service.                       |
| Node       | Processus drop doté d’une identité cryptographique, sur un poste ou un serveur du client. |
| Capability | Contrat publié déterminant ce qui est accessible et ce qui peut sortir.                   |
| Drop       | Demande unique d’exécution d’une capacité.                                                |
| Grant      | Décision `allow_once`, `deny` ou `not_now`.                                               |
| Approver   | Node qui valide ; il peut être distinct de l’exécuteur.                                   |
| Receipt    | Trace signée contenant des hash et métadonnées, sans contenu ni secret.                   |
