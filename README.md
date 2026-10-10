# drop

**Faire collaborer vos agents dans votre infrastructure. Obtenir la réponse, garder la maîtrise des accès.**

Votre agent a besoin d'une information chez un collègue. Il pose une question précise ; le propriétaire autorise une fois ; une capacité s'exécute dans son environnement ; seule la réponse autorisée revient.

`drop` est un nom de code (D57). Positionnement adopté le 10 octobre 2026 (D47 à D58) : « la réponse, pas l'accès ». drop fait valider par le propriétaire la réponse qui sort et se place comme couche de consentement humain au-dessus d'A2A, sans le concurrencer. La référence produit est [`docs/product/`](docs/product/) : [PRD](docs/product/PRD.md), [TRD](docs/product/TRD.md), [parcours](docs/product/APP_FLOW.md), [UX/UI](docs/product/UX_UI.md), [schéma backend](docs/product/BACKEND_SCHEMA.md) et [plan d'implémentation](docs/product/IMPLEMENTATION_PLAN.md). Cible (D48) : premiers essais avec des amis techniques, conception selon les exigences d'une entreprise souveraine, adoption par les petites équipes. Promesse (D52) : vos données restent sur votre machine et seule une réponse que vous avez approuvée en sort, chiffrée ; limite : drop contrôle ce qui passe par drop, pas les flux propres d'un connecteur ou d'un modèle que vous choisissez. Aucun compte Memo Labs ni relais tiers n'est obligatoire. En cas d'écart avec un autre document descriptif, ces documents et D47 à D58 font foi ; les contrats restent dans `openspec/specs`.

Ce qui existe : le profil privé avec relais interne et politique réseau explicite (T3.1, `packages/node/src/private-config.ts`), le niveau « capacité » de l'échelle des échanges (`packages/runner`, `packages/capabilities`), le raccordement en deux confirmations de quatre agents (T3.3, `packages/node/src/onboarding.ts`, vérifié sur fixtures, recette humaine sur un Mac de test à faire) et une app Mac de barre de menus sous Tauri 2 en paquet de développement (`apps/mac`). Ce qui est visé : distribution Mac signée et notarisée (T3.4), connexion directe sans relais par défaut (T4.2), réponse à la main du propriétaire (T4.3), faits publiés (T4.4), treize clients MCP (T4.5), essai avec deux amis (T4.6), puis Windows (T3.7) et Linux (T3.8). Rien n'a encore été validé avec de vrais utilisateurs. Le [bilan daté](docs/AVANCEMENT.md) distingue le code, les tests, les démonstrations et le travail restant.

## Le socle et son modèle

Le code du projet est sous [Apache-2.0](LICENSE). Rien n'est payant avant d'avoir des utilisateurs (D57) et la sécurité n'est jamais une option payante (D38). Des contrats d'installation et de support, puis un pack entreprise, restent des hypothèses sans tarif (PRD, hypothèse H6). Le dépôt est encore privé, sans installateur public annoncé. Voir [le cadre open source](docs/OPEN_SOURCE.md).

Le profil privé (existant, T3.1) utilise un relais local ou interne choisi par le propriétaire. Les destinations modèle, MCP HTTP et A2A sont limitées à des origines privées explicites, sans redirection ni repli cloud. Le modèle doit être choisi ; aucun poids n'est téléchargé automatiquement. Le financement ne remplace plus son endpoint. Voir le [démarrage et les limites du profil privé](docs/PRIVATE_PROFILE.md), notamment le refus du DNS et des serveurs source MCP stdio non isolés. Les trois modes de connexion de D53 (réseau local, Internet par iroh, relais d'entreprise) sont visés en T4.2 et T4.10 ; aujourd'hui, les Nodes passent par un relais WebSocket configuré (`packages/relay`).

## Commencer par comprendre

- [Les documents produit](docs/product/PRD.md) : problème, cible, échelle des échanges, statuts existant, visé et hypothèse.
- [Le guide illustré](docs/GUIDE.md) : l'exemple joué par la démo, le parcours, l'architecture et la confidentialité.
- [L'avancement du projet](docs/AVANCEMENT.md) : preuves, limites et prochaines étapes.
- [Le raccordement en deux confirmations](docs/ONBOARDING.md) (quatre agents livrés en T3.3) et [les modèles locaux candidats](docs/MODELS.md).
- [Les critères futurs](docs/ACCEPTANCE.md) et [les chantiers ordonnés](docs/TASKS.md).
- [Les démonstrations conservées](docs/demo/README.md) : captures et résultats de Claude Code et Codex.

![Le trajet d'une réponse autorisée](docs/diagrams/journey.svg)

## Ouvrir le site

Depuis un clone du dépôt, avec Node **22.18 ou supérieur** et pnpm **11.27.0** :

```bash
pnpm install --frozen-lockfile
pnpm site:preview
```

Ouvrir l'adresse locale affichée. Le site comprend une simulation pédagogique, le guide et le bilan. Il ne se connecte pas aux Nodes. `pnpm site:build` crée les fichiers statiques dans `dist/site/`, sans dépendance supplémentaire. Relancer la prévisualisation après une modification. Si `node scripts/bundle.ts` est exécuté ensuite, reconstruire le site : le bundle du produit nettoie `dist/`.

## Vérifier le prototype

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
```

Les tests utilisent des sources locales et des fournisseurs simulés ; ils ne demandent aucune clé LLM.

## Rejouer la démonstration

```bash
bash scripts/demo-local.sh
```

Le script démarre un relais et trois Nodes temporaires (VPS, Guillaume et Julie) sur `127.0.0.1`, ports **7790 à 7793**. Il joue un résumé d'erreurs, puis la question de Guillaume sur le mode sombre dans le dépôt de Julie (`repo.answer`) avec relecture. Il arrête ses processus en quittant et conserve le dossier temporaire. Ses trois Nodes sont initialisés en profil historique (`--profile legacy`, `scripts/demo-local.sh`) : cette démo ne prouve pas le profil privé, dont la preuve d'ensemble est visée en T3.5.

**La partie dépôt utilise OpenRouter et le réseau.** Elle attend `OPENROUTER_API_KEY`, ou une entrée du trousseau macOS nommée `OpenRouter API Key`. Sa durée dépend du fournisseur. Ne jamais placer la clé dans le dépôt. Le [guide](docs/GUIDE.md#essayer-le-prototype) explique les prérequis et la différence entre exécution locale et modèle distant.

## Brancher un agent

Un Node initialisé, admis sur un relais et lancé avec `serve` est nécessaire. Dans le panneau local, l'onglet « Mes outils » propose « 1. Analyser ce Mac » puis « 2. Connecter les agents sélectionnés » (existant, T3.3, `packages/node/src/panel.ts`). En ligne de commande, l'installation locale du connecteur se fait après assemblage :

```bash
node scripts/bundle.ts
node packages/node/src/cli.ts install codex
```

Les autres identifiants sont `claude_code`, `cursor` et `claude_desktop` : ce sont les quatre adaptateurs existants (`packages/capabilities/src/agents.ts`). La commande passe par les mêmes contrôles d'aperçu, de conflit et de sauvegarde que le panneau, puis écrit la configuration de l'agent choisi. `uninstall <agent>` retire le connecteur. Les neuf autres clients de D55 sont visés en T4.5 ; d'ici là, une entrée MCP stdio se copie à la main. Le paquet npm public reste une tâche distincte ; ne pas supposer qu'un `npx drop` est disponible.

Voir [les configurations manuelles](packages/requester-mcp/README.md) et `node packages/node/src/cli.ts help` pour les commandes du prototype.

## Où trouver les sources

| Chemin                                 | Rôle                                                      |
| -------------------------------------- | --------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                 | Méthode de contribution, stack et règles de sécurité      |
| [openspec/specs/](openspec/specs/)     | Contrats normatifs des capacités                          |
| [docs/product/](docs/product/)         | Référence produit descriptive (D58)                       |
| [openspec/project/](openspec/project/) | Vision et architecture ; le PRD et le TRD font foi        |
| [docs/TASKS.md](docs/TASKS.md)         | Ordre, dépendances et statuts du travail                  |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Décisions et évolutions du périmètre                      |
| [packages/](packages/)                 | Protocole, relais, Node, runner, capacités et connecteurs |
| [site/](site/)                         | Sources de la vitrine statique                            |

## Contribuer

Lire [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) et [AGENTS.md](AGENTS.md), puis la première tâche disponible dans l'index ou celle désignée par l'humain. Une change OpenSpec porte le travail, ses critères et ses preuves. Les contrôles incluent lint, types, tests, liens aux scénarios, revue, puis archivage.

```bash
openspec list --specs
openspec validate --all --strict
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
```

Le seuil de validation du besoin est fixé en D24 et sera mesuré pendant l'essai avec deux amis (T4.6). Rien n'a encore été validé avec de vrais utilisateurs ; un prototype qui fonctionne ne suffit pas à conclure que le besoin est validé.
