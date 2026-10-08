# Où en est drop ?

**Bilan du 8 octobre 2026.** Référence analysée : commit `cacf1cc`. Les chiffres produit ci-dessous excluent T2.6a, la présente documentation. Ce document décrit les preuves du dépôt ; il ne certifie pas l'état actuel du serveur distant.

**Le cœur fonctionne et a été démontré. Le produit reste un prototype destiné aux développeurs.** L’annuaire d’équipe et l’installation locale des connecteurs sont maintenant implémentés. L’app Mac et la distribution publique restent à construire. La mesure qui doit justifier un pilote n'est pas encore démontrée comme concluante.

![Avancement : mesure outillée, prototype démontré, app Mac et distribution publique à construire](diagrams/roadmap.svg)

## Les chiffres, avec leur sens

| Mesure actualisée après les nouveaux commits | Résultat | Ce que cela prouve |
| --- | --- | --- |
| Tâches produit de l'index | 25 `done`, 2 `doing`, 4 `todo`, 1 `blocked`, sur 32 | État déclaré de la feuille de route, pas pourcentage d'effort |
| Tests exécutés | 229 réussis dans 20 fichiers | Les cas automatisés passent sur ce poste, dont trois nouveaux tests du site |
| Lint et types | Réussite | Les contrôles statiques du dépôt passent |
| Critères OpenSpec | 327, dont 313 testables | Taille du contrat suivi par le garde |
| Critères reliés à un test | 54 sur 313, soit 17,3 % | Traçabilité explicite des specs, pas couverture du code |
| Critères gelés dans la baseline | 259 | Dette connue non bloquante pour le garde, pas preuve de conformité |

Sources : [index](TASKS.md), [tests](../packages/), [baseline](../.openspec-guard-baseline.json). `openspec-guard` trouve 197 titres statiques et signale trois titres non lisibles statiquement ; Vitest exécute davantage de cas, notamment paramétrés.

## Ce qui existe

| Partie | État observé | Preuves dans le dépôt |
| --- | --- | --- |
| Mesure des blocages | MCP, hook Claude Code, import Codex, classification, export et agrégation implémentés | [Guide observer](../packages/blocked-observer/README.md), [tests](../packages/blocked-observer/test/) |
| Protocole | Identités, signature, chiffrement, schémas et protection contre le rejeu | [Sources](../packages/protocol/src/), [tests](../packages/protocol/test/protocol.test.ts) |
| Relais | Routage WebSocket et admission ; invitations implémentées et testées | [Relais](../packages/relay/src/), [test d'admission](../packages/node/test/admission.test.ts) |
| Node et consentement | CLI, API locale, notification, autorisation et relecture web | [Node](../packages/node/src/), [test complet](../packages/node/test/e2e.test.ts) |
| Exécution et filtres | Validation, budget, répertoire temporaire et scanner de secrets | [Runner](../packages/runner/src/), [tests](../packages/runner/test/) |
| Trois familles de capacités | Résumé d'erreurs, question sur un dépôt, question via un serveur MCP | [Registre](../packages/capabilities/src/index.ts), [tests](../packages/capabilities/test/) |
| Agent demandeur | Trois outils MCP, validation locale et résultat présenté comme une donnée | [Guide](../packages/requester-mcp/README.md), [tests](../packages/requester-mcp/test/tools.test.ts) |
| Paiement par le demandeur | Création et transmission d'une clé plafonnée, cycle de révocation testé | [Implémentation](../packages/node/src/funding.ts), [tests](../packages/node/test/funding.test.ts) |
| Détection des outils | Configurations Claude Code, Codex, Cursor et Claude Desktop lues ; partage via CLI | [Détection](../packages/node/src/detect.ts), [tests](../packages/node/test/detect.test.ts) |
| Annuaire d’équipe | Adhésion par invitation, propagation des membres, appairage et catalogue | [Tests à quatre Nodes](../packages/node/test/team.test.ts), commit `9765ad1` |
| Installation locale | `drop install`, fichiers assemblés et génération `.mcpb` | [Installation](../packages/node/src/install.ts), [tests](../packages/node/test/install.test.ts), [bundle](../scripts/bundle.ts), commit `cacf1cc` |

Le support générique d'un serveur MCP ne prouve pas qu'une intégration métier réelle fonctionne chez chaque utilisateur. Les tests de `mcp.answer` utilisent notamment un serveur factice et un fournisseur de modèle simulé.

## Ce qui a été montré en conditions réelles

La [démo conservée dans le dépôt](demo/README.md) rapporte deux passages, avec Claude Code puis Codex, via le relais du lab :

- Une question sur les erreurs de Traefik, exécutée sur le VPS et autorisée depuis le Mac.
- Une question sur le mode sombre du dépôt de démonstration de Julie, suivie d'une relecture avant envoi.
- Des captures du consentement et des reçus des deux côtés.

Le Node nommé Julie et son dépôt de démonstration tournaient sur le Mac de Guillaume. Ce n'est pas un déploiement chez Julie. Le test de compréhension auprès d'une personne extérieure n'a pas été fait : la démo le dit explicitement. T1.14 reste donc `doing`.

## Ce qui reste à livrer

| Tâche | Ce qu'il manque | Condition ou dépendance |
| --- | --- | --- |
| T1.14 | Test humain de compréhension en 30 secondes | Une personne extérieure à la construction |
| T2.1 | Clôture de l'admission par invitation | Code et tests présents, index encore `doing` ; preuve de clôture à réconcilier |
| T2.4 | App Mac de barre de menus et distribution signée | T2.1, T2.2, T2.8 et T2.9 |
| T2.6 | Vidéo, parcours d’installation final et site public | T2.4, T2.5 ; mise en ligne soumise à accord |
| T2.11 | Publication npm utilisable sans chemin local | `blocked` : nom du produit et accord de publication attendus |
| T2.10 | Une question adressée à plusieurs personnes | T2.9 |
| T2.7 | Essais réels chez Julie et Natha | T2.3, T2.4, T2.5 et T2.10 |

T2.6a ajoute une vitrine et la documentation en prévisualisation. Elle ne publie pas les installateurs et ne remplace pas les essais utilisateurs.

## Les quatre points à garder visibles

**1. Le besoin n'est pas encore validé.** D24 exige au moins trois développeurs et dix jours actifs chacun. Le GO demande au moins 0,5 blocage qualifié par développeur-jour et une médiane d'au moins dix minutes perdues. Le dépôt ne fournit pas ici d'agrégat qualifié satisfaisant ces conditions. Les 62 événements mentionnés en D25 sont un signal brut sur un poste, pas une validation de marché.

**2. Les tests ne couvrent pas formellement tout le contrat.** Les 259 critères gelés doivent être reliés à une preuve, ou corrigés si le contrat est devenu obsolète. Un garde vert avec baseline signifie absence de régression par rapport à cette baseline.

**3. La documentation historique a pris du retard sur le code.** L'architecture parle encore de Caddy, d'un TTL fixe de dix minutes et de `get_result`. D22 documente Traefik ; le relais utilise l'expiration de l'enveloppe ; l'outil s'appelle `get_drop_result`. D26 étend le périmètre à l'app Mac et aux outils MCP, contrairement aux exclusions initiales de la vision. Le présent guide cite le code et les décisions applicables, sans réécrire les contrats.

**4. La confidentialité doit être formulée précisément.** Le demandeur reçoit une sortie bornée et les accès du propriétaire ne lui sont pas transmis. Mais si le modèle est distant, les résultats des outils utilisés par ce modèle sont envoyés à ce fournisseur. Le scanner de secrets est un filtre, pas une preuve qu'aucune information sensible ne peut sortir. Voir le [guide de confidentialité](GUIDE.md#ce-qui-circule-et-ce-qui-reste-chez-soi).

## Le prochain chemin utile

L'ordre et les dépendances restent ceux de [TASKS.md](TASKS.md). Pour rendre le prototype utilisable par quelqu'un d'autre, le chemin passe par la clôture de l’admission, l’app Mac et la distribution publique. L’annuaire et l’installation locale ont été ajoutés pendant cette analyse et sont inclus dans ce bilan. Les essais chez les testeurs viennent ensuite. La mesure du besoin peut continuer pendant ces travaux, sans présumer le GO.

## Reproduire le bilan

Depuis la racine du dépôt, avec les dépendances installées :

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
```

Puis comparer l'index, les derniers commits et les preuves de démonstration. Ce bilan est une photographie datée ; il n'est pas recalculé à chaque ouverture du site.
