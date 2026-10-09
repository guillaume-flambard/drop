# Où en est drop ?

**Bilan du 9 octobre 2026.** Base runtime inspectée : `d759029`. T3.0 actualise documentation, contrat documentaire, kit open source et présentation locale. Ce bilan ne certifie ni un serveur distant ni une distribution publique.

**Le prototype possède le cœur des échanges et A2A dans les deux sens. Le profil privé complet et les deux confirmations restent à livrer.** Tauri existe déjà sur Mac ; signature, distribution, mises à jour et parcours privé doivent encore être vérifiés.

![Chantiers : fondation, profil privé, modèles, connexion, Mac et preuves, puis publication et ports](diagrams/roadmap.svg)

## Ce qui existe dans le code

| Partie                                           | Preuve inspectable                                                                           | Limite                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Identité, enveloppes, anti-rejeu                 | [Protocole et tests](../packages/protocol/)                                                  | Ne prouve pas toute la confidentialité applicative                                  |
| Relais, admission, équipes                       | [Relais](../packages/relay/), [tests Node](../packages/node/test/)                           | Clôture historique T2.1 à réconcilier en T3.1                                       |
| Consentement, relecture, budgets, sorties        | [Node](../packages/node/), [runner](../packages/runner/)                                     | Pas de garantie absolue de non-divulgation                                          |
| Résumé d'erreurs, dépôt, MCP et A2A sortant      | [Capacités](../packages/capabilities/)                                                       | Connecteurs et modèles réels à qualifier par environnement                          |
| A2A entrant                                      | [Adaptateur](../packages/a2a/), commit `0e9caa8`                                             | SDK 1.3.0 ciblant A2A 1.0 ; pas une certification de tout le standard               |
| Questions d'équipe et demandes multiples         | [Connecteur MCP](../packages/requester-mcp/)                                                 | Routage borné, pas un orchestrateur général                                         |
| Détection et installation individuelles          | [Détection](../packages/node/src/detect.ts), [installation](../packages/node/src/install.ts) | Quatre adaptateurs ; transaction groupée réversible à construire                    |
| Shell Mac de barre de menus                      | [Tauri](../apps/mac/)                                                                        | Bootstrap encore lié au lab                                                         |
| Financement demandeur et passerelle grand public | [Financement](../packages/node/src/funding.ts), [gateway](../packages/gateway/)              | Endpoint peut dépendre du financement ; passerelle voit le clair, hors profil privé |
| Mesure du besoin                                 | [Observer](../packages/blocked-observer/)                                                    | D24 attend toujours un agrégat qualifié concluant                                   |

Le défaut LLM actuel est OpenRouter. La cible impose un choix local/interne du propriétaire sans repli cloud. Aucun poids n'a été téléchargé ou benchmarké pendant T3.0.

## Ce que T3.0 prépare

- Vision et architecture privées, décisions D34 à D38, [critères d'exécution futurs](ACCEPTANCE.md).
- [Parcours deux confirmations](ONBOARDING.md), [modèles candidats](MODELS.md), index réordonné avec reprise des anciens restes.
- Licence Apache-2.0, contribution, signalement de sécurité et modèles GitHub.
- Landing et guide en prévisualisation locale, avec échanges simulés et limites explicites.

Vérification T3.0 : **245 tests réussis dans 26 fichiers**, lint/types et validation OpenSpec stricte verts. Le guard compte 355 critères : 75 liés à un test, 259 hérités gelés, 21 non testables (dont les six critères éditoriaux de T3.0). Baseline inchangée. Les [preuves et la revue](../openspec/changes/archive/2026-10-09-t3-0-sovereign-oss-foundation/evidence.md) sont conservées dans l’archive. Les critères documentaires ne comptent pas comme des tests du futur runtime. Un garde vert avec baseline signifie absence de nouvelle dette de traçabilité ; il ne signifie pas que chaque scénario hérité est couvert.

## Preuves historiques

La [démo conservée](demo/README.md) rapporte des passages Claude Code et Codex via le lab : résumé de logs du VPS et question sur un dépôt avec relecture. Le Node nommé Julie était sur le Mac de Guillaume, pas chez Julie. Le test humain de compréhension n'est pas prouvé. Ces captures ne démontrent pas le nouveau parcours privé.

L'ancien bilan `cacf1cc` est conservé dans l'historique Git. Ses chiffres de tests et tâches ne sont pas repris comme mesure actuelle.

## Ce qui reste

L'ordre unique est [TASKS](TASKS.md). Prochain chantier : T3.1, supprimer les dépendances externes imposées et prouver les frontières réseau du profil privé. Puis qualification de modèle et connexion, finition Mac, preuve d'ensemble, préparation de publication, Windows et Linux. Les anciennes tâches en cours ont été remises à `todo` avec leur reprise explicite ; elles ne sont pas déclarées terminées.

Deux évaluations complémentaires sont maintenant inscrites : **T3.1a**, Hermes comme agent demandeur via MCP, et **T3.2a**, adaptateurs AI SDK directs / passerelle LiteLLM privée. Aucun n’est installé ni intégré ; ils ne bloquent pas le parcours privé. Les critères incluent erreurs, destinations réseau et absence de dépendance cloud obligatoire. Le client actuel reste celui de la première preuve.

D24 exige au moins trois développeurs et dix jours actifs chacun. Le GO exige au moins 0,5 blocage YES par développeur-jour et une médiane de dix minutes perdues. Aucun agrégat qualifié concluant n'est apporté par cette documentation.

Le dépôt demeure privé. Avant ouverture : audit de l'historique et des artefacts, attributions tierces, séparation de la CI du lab, signalement privé opérationnel, paquets vérifiés et accord du propriétaire. Voir [OPEN_SOURCE](OPEN_SOURCE.md).

## Reproduire la vérification

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
openspec validate --all --strict
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
pnpm site:build
```

Ces tests ne requièrent ni clé modèle ni accès au lab. Le site est une présentation statique ; sa simulation ne connecte aucun agent et n'envoie aucune demande réelle.
