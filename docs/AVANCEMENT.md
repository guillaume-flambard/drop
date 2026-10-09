# Où en est drop ?

**Bilan du 9 octobre 2026.** Référence analysée : commit `00fe39a` sur `main`. Ce document décrit les preuves du dépôt ; il ne certifie pas l'état actuel du serveur distant.

**Le cœur fonctionne et a été démontré ; l'étape 2 est construite, pas encore essayée.** L'app Mac, ses mises à jour signées, la passerelle pour Claude et ChatGPT, la connexion OAuth aux outils en ligne et le site existent dans le code et passent leurs tests. Aucune tâche n'est à faire sans un geste humain : signer l'app, déployer dans `lab-infra`, essayer chez Julie et Natha. La mesure qui doit justifier un pilote n'est pas encore démontrée comme concluante.

![Avancement : mesure outillée, prototype démontré, étape 2 construite, essais à faire](diagrams/roadmap.svg)

## Les chiffres, avec leur sens

| Mesure | Résultat | Ce que cela prouve |
| --- | --- | --- |
| Tâches produit de l'index | 33 `done`, 6 `doing`, 2 `blocked`, aucune `todo`, sur 41 | État déclaré de la feuille de route, pas pourcentage d'effort |
| Tests exécutés | 264 réussis dans 29 fichiers | Les cas automatisés passent sur ce poste et en CI |
| Lint et types | Réussite | Les contrôles statiques du dépôt passent |
| Critères OpenSpec | 370, dont 354 testables | Taille du contrat suivi par le garde |
| Critères reliés à un test | 96 sur 354, soit 27,1 % | Traçabilité explicite des specs, pas couverture du code |
| Critères gelés dans la baseline | 258 | Dette connue non bloquante pour le garde, pas preuve de conformité |

Sources : [index](TASKS.md), [tests](../packages/), [baseline](../.openspec-guard-baseline.json). `openspec-guard` trouve 232 titres statiques ; Vitest exécute davantage de cas.

## Ce qui existe

| Partie | État observé | Preuves dans le dépôt |
| --- | --- | --- |
| Mesure des blocages | MCP, hook Claude Code, import Codex, classification, export et agrégation | [Guide observer](../packages/blocked-observer/README.md), [tests](../packages/blocked-observer/test/) |
| Protocole | Identités, signature, chiffrement, schémas, rejeu, tickets d'admission bornés à 24 h | [Sources](../packages/protocol/src/), [tests](../packages/protocol/test/protocol.test.ts) |
| Relais | Routage, admission par invitation, révocation sans redémarrage, plafonds d'admission | [Relais](../packages/relay/src/), [tests](../packages/relay/test/relay.test.ts) |
| Node et consentement | CLI, API locale, notification, autorisation et relecture | [Node](../packages/node/src/), [test complet](../packages/node/test/e2e.test.ts) |
| Exécution et filtres | Validation, budget, répertoire temporaire et scanner de secrets | [Runner](../packages/runner/src/), [tests](../packages/runner/test/) |
| Capacités | Résumé d'erreurs, dépôt, serveur MCP, agent A2A | [Registre](../packages/capabilities/src/index.ts), [tests](../packages/capabilities/test/) |
| Outils en ligne | Partage vérifié ; connexion OAuth de drop, jetons gardés sur le poste | [Partage](../packages/node/src/share.ts), [OAuth](../packages/capabilities/src/mcp-oauth.ts), [tests](../packages/node/test/oauth.test.ts) |
| Équipe et demandes | Annuaire, demandes multiples, « demander à mon équipe » | [Tests d'équipe](../packages/node/test/team.test.ts), [outils](../packages/requester-mcp/src/) |
| Installation | `drop install`, fichiers assemblés vérifiés, `.mcpb` | [Installation](../packages/node/src/install.ts), [test du bundle](../test/bundle.test.ts) |
| App Mac | Barre de menus, panneau, liens `drop://`, mises à jour signées proposées dans le menu | [App](../apps/mac/), [manifeste](../scripts/mac-updates.ts) |
| Claude et ChatGPT | Passerelle OAuth, liaison confirmée dans l'app, durcie contre l'hameçonnage | [Passerelle](../packages/gateway/src/), [tests](../packages/gateway/test/gateway.test.ts) |
| Site | Accueil, démarrage, cas d'usage, sécurité ; mode bêta ; service public testé | [Site](../site/), [tests](../test/site.test.ts) |

Le code Rust de l'app compile pour macOS arm64 sans être lancé ici. Les intégrations en ligne (Notion, Linear, GitHub) sont testées contre des serveurs factices conformes, pas contre les vrais services.

## Ce qui a été montré en conditions réelles

La [démo conservée dans le dépôt](demo/README.md) rapporte deux passages, avec Claude Code puis Codex, via le relais du lab : une question sur les erreurs de Traefik exécutée sur le VPS, une question sur le dépôt de démonstration de Julie avec relecture avant envoi, et les reçus des deux côtés. Le Node nommé Julie tournait sur le Mac de Guillaume : ce n'est pas un déploiement chez Julie. Rien de l'étape 2 n'a encore été essayé en conditions réelles.

## Ce qui reste à livrer

| Tâche | Ce qu'il manque | Qui |
| --- | --- | --- |
| T1.14 | Test de compréhension en 30 secondes | Une personne extérieure |
| T2.4 | Signature, notarisation, clé de mise à jour, dessin du panneau de suivi | Guillaume (compte Apple) |
| T2.13 | Déploiement de la passerelle, premier lien avec Claude et ChatGPT | Guillaume, `lab-infra` (`docs/deploiement-lab.md`) |
| T2.6 | Mise en ligne, adresse de contact, vidéo | Guillaume (accord de publication) |
| T2.17 | Premier essai avec un vrai compte Notion | Guillaume |
| T2.7 | Essais chez Julie et Natha | Julie, Natha, [protocole](essais/README.md) |
| T2.11, T2.20 | Publication npm ; passerelle de confiance par défaut | `blocked` : nom du produit ; identifiant de la passerelle |

## Les quatre points à garder visibles

**1. Le besoin n'est pas encore validé.** D24 exige au moins trois développeurs et dix jours actifs chacun. Le GO demande au moins 0,5 blocage qualifié par développeur-jour et une médiane d'au moins dix minutes perdues. Le dépôt ne fournit pas d'agrégat qualifié satisfaisant ces conditions.

**2. Les tests ne couvrent pas formellement tout le contrat.** Les 258 critères gelés doivent être reliés à une preuve, ou corrigés si le contrat est devenu obsolète. Un garde vert avec baseline signifie absence de régression par rapport à cette baseline.

**3. Une partie des specs décrit encore le plan d'origine.** L'architecture est à jour depuis le 9 octobre, mais la spec `deploy-mac-vps` décrit Caddy et des unités systemd, quand le lab tourne avec Traefik et Docker (D22). Les décisions D26 à D40 étendent le périmètre initial (app Mac, outils MCP, assistants grand public).

**4. La confidentialité doit être formulée précisément.** Le demandeur reçoit une sortie bornée et les accès du propriétaire ne lui sont pas transmis. Mais un modèle distant reçoit les résultats des outils qu'il appelle, et la passerelle voit en clair les questions et réponses des utilisateurs de Claude et ChatGPT. Le scanner de secrets est un filtre, pas une preuve. Voir la [page Sécurité](../site/securite.html) et le [guide](GUIDE.md#ce-qui-circule-et-ce-qui-reste-chez-soi).

## Le prochain chemin utile

Tout ce qui reste passe par un geste humain : signer l'app et déployer dans `lab-infra` (liste complète dans `docs/deploiement-lab.md`), puis les essais chez Julie et Natha selon le [protocole](essais/README.md). La mesure du besoin peut continuer pendant ce temps, sans présumer le GO.

## Reproduire le bilan

Depuis la racine du dépôt, avec les dépendances installées :

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
```

Puis comparer l'index, les derniers commits et les preuves de démonstration. Ce bilan est une photographie datée ; il n'est pas recalculé à chaque ouverture du site.
