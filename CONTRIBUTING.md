# Contribuer à drop

Bienvenue. drop permet de demander une réponse autorisée à l'environnement d'un autre agent. Le cap est un socle A2A/MCP privé, simple à raccorder, sous [Apache-2.0](LICENSE). Le dépôt est encore privé ; ce guide prépare son ouverture.

## Démarrer sans le lab

Prérequis : Node 22.18 ou ultérieur et pnpm 11.27.0. Depuis un clone auquel vous avez accès :

```bash
pnpm install --frozen-lockfile
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm site:preview
```

Les tests utilisent des fixtures et fournisseurs simulés, sans clé LLM ni accès au lab. La prévisualisation sert uniquement l'allowlist du site sur `127.0.0.1:4173`. Le script de démo historique utilise un fournisseur distant : il n'est pas requis pour contribuer.

## Choisir une contribution

Lire [la vision](openspec/project/vision.md), [l'architecture](openspec/project/architecture.md), puis [TASKS](docs/TASKS.md). Une tâche correspond à une change OpenSpec. Les règles de travail détaillées sont dans [AGENTS.md](AGENTS.md). Le mainteneur valide le périmètre avant une nouvelle capacité ou dépendance. Les petites corrections de documentation peuvent rester proportionnées.

Le [parcours de connexion](docs/ONBOARDING.md) définit les quatre adaptateurs initiaux. Les futurs adaptateurs doivent déclarer leurs chemins et versions, éviter l'exécution à la découverte, préserver la configuration et fournir des fixtures sans données personnelles. Ne pas confondre découverte, raccordement et publication d'outil.

Pour une contribution de logique : contrats et scénarios avant implémentation, tests d'échec compris. Code et commits en anglais ; docs et specs en français. Pas de `any`, crypto maison, clé dans un log, ou décision d'autorisation confiée au LLM.

## Avant une pull request

Exécuter lint, types et tests ci-dessus. Pour les specs, installer/utiliser OpenSpec CLI compatible avec le dépôt (1.14.1 utilisé lors de T3.0), puis :

```bash
openspec validate --all --strict
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
```

Lier chaque nouveau scénario testable à son test exact. Une baseline existante n'autorise pas à ajouter des trous de couverture. Décrire le problème, le comportement obtenu, les preuves et limites. Ne pas inclure de configuration réelle, conversation, identifiant ou capture sensible. Une faille se signale selon [SECURITY.md](SECURITY.md), jamais dans une issue publique.

La CI du lab et les déploiements ne sont pas nécessaires à une contribution et restent réservés au mainteneur. Les contrôles d'ouverture publique sont dans [OPEN_SOURCE](docs/OPEN_SOURCE.md). Les contributions sont proposées sous la licence du projet ; conserver les attributions tierces applicables.
