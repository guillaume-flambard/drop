# Vision et périmètre

Résumé de la vision. La référence descriptive complète est le [PRD](../../docs/product/PRD.md), avec ses statuts existant, visé et hypothèse. Cap adopté le 9 octobre 2026 (D34 à D38), précisé le 10 octobre (D47 à D58). Le [bilan](../../docs/AVANCEMENT.md) sépare le prototype vérifié de ce qui reste à construire. Les contrats normatifs vivent dans `openspec/specs/`.

## Le produit

**La réponse, pas l'accès.** Un agent pose une question bornée, le propriétaire de la source décide, puis seule la réponse validée revient, dans l'infrastructure du client. drop implémente A2A et MCP et s'y place comme couche de consentement humain ; A2A est un standard existant, pas un protocole à remplacer.

Promesse publique (D52), toujours avec sa limite : les données restent sur la machine du propriétaire, seule une réponse approuvée en sort, chiffrée, vers la personne qui l'a demandée. drop contrôle ce qui passe par drop ; un connecteur ou un modèle choisi par le propriétaire peut avoir ses propres flux.

## Pour qui

Décision D48. Premiers essais : Guillaume puis deux amis techniques dans des contextes différents. Conception selon les exigences d'une entreprise souveraine (A2A, aucune dépendance externe). Adoption visée par les petites équipes et les PME. Le demandeur est technique ; le propriétaire de la donnée peut ne pas l'être, et peut ne pas avoir d'agent (D49). Rien n'est encore validé avec de vrais utilisateurs ; D24 conditionne toujours le pilote.

## Expérience cible

- Mac d'abord : une icône discrète de barre de menus, les consentements et les demandes en cours ; Windows puis Linux.
- Deux confirmations pour raccorder ses agents ; quatre adaptateurs livrés, treize clients visés (D55). Aucun partage implicite.
- Une échelle d'échanges (D50) : fait publié, petite question sur un contexte déclaré, capacité, tâche déléguée avec jalons. La conversation libre entre agents est exclue.
- Un contexte partagé décentralisé (D51) : chaque fait reste chez son propriétaire.
- Trois modes de connexion (D53) : réseau local, iroh sur Internet, relais d'entreprise ; aucun relais de secours par défaut.
- Le modèle déjà disponible chez le client passe en premier ; les capacités déterministes n'en demandent aucun.

## Principes

1. Une capacité fixe entrée, sortie, outils, budget et approbateur avant la demande. Le LLM ne décide jamais des permissions.
2. Une requête distante est une donnée non fiable. Autorisation et contrôles de sortie restent déterministes.
3. Le profil privé fonctionne dans le périmètre du client. Sans serveur externe imposé ne signifie pas sans serveur.
4. Aucune sortie réseau non autorisée ni repli cloud silencieux. Le payeur ne change pas la destination des données du propriétaire.
5. Le chiffrement et le scanner de secrets ne prouvent pas l'absence de toute fuite. Connecteurs, modèles et agents joints font partie de la frontière à vérifier.
6. Une petite question ne lit jamais la session vivante d'un agent ; aucun agent n'écrit chez un autre.
7. Sécurité essentielle, auto-hébergement et modèles internes appartiennent au socle gratuit.

## Gratuit et payant

**Socle libre sous Apache-2.0** : protocole et capacités, A2A et MCP, relais privé, application, consentement, filtrage et reçus locaux. Pas de taxe par requête ni de service propriétaire obligatoire.

Rien de payant avant d'avoir des utilisateurs (D57). Contrats d'installation et de support, puis un pack entreprise (politiques, SSO, export d'audit), restent des hypothèses sans tarif. Identité, chiffrement et contrôle des sorties ne deviennent jamais des options payantes. Voir [le cadre open source](../../docs/OPEN_SOURCE.md).

## Ordre et limites

L'ordre unique est [TASKS](../../docs/TASKS.md) ; les phases sont décrites dans le [plan](../../docs/product/IMPLEMENTATION_PLAN.md). La série T3 reste le chemin de sécurité avant tout pilote.

Hors cible : conversation libre entre agents, index central ou RAG d'entreprise, relais de secours actif par défaut, partage d'identifiants, remplacement des agents existants. Le dépôt reste privé tant que la préparation de publication n'est pas validée. Le nom du produit reste à choisir ; « drop » est un nom de code.

## Vocabulaire

| Terme      | Sens                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| Owner      | Propriétaire d'une capacité : personne, équipe, machine ou service.                       |
| Node       | Processus drop doté d'une identité cryptographique, sur un poste ou un serveur du client. |
| Capability | Contrat publié déterminant ce qui est accessible et ce qui peut sortir.                   |
| Drop       | Demande unique d'exécution d'une capacité.                                                |
| Grant      | Décision `allow_once`, `deny` ou `not_now`.                                               |
| Approver   | Node qui valide ; il peut être distinct de l'exécuteur.                                   |
| Receipt    | Trace signée contenant des hash et métadonnées, sans contenu ni secret.                   |
| Fait       | Information signée qu'un propriétaire marque partageable, avec sa validité (visé, D51).   |
