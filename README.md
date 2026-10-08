# drop

**Obtenir la réponse. Garder la maîtrise de ses accès.**

Votre agent a besoin d'une information chez un collègue. Il pose une question précise ; le propriétaire autorise une fois ; une capacité s'exécute dans son environnement ; seule la réponse autorisée revient.

`drop` est un nom de code. Le cœur du prototype est implémenté et démontré. L'app Mac et la distribution publique restent à livrer. Le [bilan daté](docs/AVANCEMENT.md) distingue le code, les tests, les démonstrations et le travail restant.

## Commencer par comprendre

- [Le guide illustré](docs/GUIDE.md) : un exemple, le parcours, l'architecture et la confidentialité.
- [L'avancement du projet](docs/AVANCEMENT.md) : preuves, limites et prochaines étapes.
- [Les démonstrations conservées](docs/demo/README.md) : captures et résultats de Claude Code et Codex.

![Le trajet d'une réponse autorisée](docs/diagrams/journey.svg)

## Ouvrir le site

La publication sur [drop.memolabs.dev](https://drop.memolabs.dev) est suivie dans le [guide d'exploitation du site](docs/SITE-DEPLOYMENT.md). Le site utilise une stack distincte du relais.

Depuis un clone du dépôt, avec Node **22.18 ou supérieur** et pnpm **11.27.0** :

```bash
pnpm install
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

Le script démarre un relais et trois Nodes temporaires (VPS, Guillaume et Julie) sur `127.0.0.1`, ports **7790 à 7793**. Il joue un résumé d'erreurs, puis une question sur un dépôt avec relecture. Il arrête ses processus en quittant et conserve le dossier temporaire.

**La partie dépôt utilise OpenRouter et le réseau.** Elle attend `OPENROUTER_API_KEY`, ou une entrée du trousseau macOS nommée `OpenRouter API Key`. Sa durée dépend du fournisseur. Ne jamais placer la clé dans le dépôt. Le [guide](docs/GUIDE.md#essayer-le-prototype) explique les prérequis et la différence entre exécution locale et modèle distant.

## Brancher un agent

Un Node initialisé, admis sur un relais et lancé avec `serve` est nécessaire. L'installation locale du connecteur se fait après assemblage :

```bash
node scripts/bundle.ts
node packages/node/src/cli.ts install codex
```

Les autres identifiants sont `claude_code`, `cursor` et `claude_desktop`. La commande écrit la configuration de l'agent choisi. `uninstall <agent>` retire le connecteur. Le paquet npm public reste une tâche distincte ; ne pas supposer qu'un `npx drop` est disponible.

Voir [les configurations manuelles](packages/requester-mcp/README.md) et `node packages/node/src/cli.ts help` pour les commandes du prototype.

## Où trouver les sources

| Chemin | Rôle |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Méthode de contribution, stack et règles de sécurité |
| [openspec/specs/](openspec/specs/) | Contrats normatifs des capacités |
| [openspec/project/](openspec/project/) | Vision et architecture descriptives |
| [docs/TASKS.md](docs/TASKS.md) | Ordre, dépendances et statuts du travail |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Décisions et évolutions du périmètre |
| [packages/](packages/) | Protocole, relais, Node, runner, capacités et connecteurs |
| [site/](site/) | Sources de la vitrine statique |

## Contribuer

Lire [AGENTS.md](AGENTS.md), puis la première tâche disponible dans l'index ou celle désignée par l'humain. Une change OpenSpec porte le travail, ses critères et ses preuves. Les contrôles incluent lint, types, tests, liens aux scénarios, revue, puis archivage.

```bash
openspec list --specs
openspec validate --all --strict
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
```

Le seuil de validation du besoin est fixé en D24. Le pilote attend ses résultats ; un prototype qui fonctionne ne suffit pas à conclure que le besoin est validé.
