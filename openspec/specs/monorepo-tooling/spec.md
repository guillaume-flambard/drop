# monorepo-tooling Specification

## Purpose
Fixe le socle commun du monorepo : gestionnaire de paquets, version de Node, rigueur TypeScript, lint, format, tests
et fichiers ignorés, pour que chaque tâche se termine sur les mêmes contrôles.

## Requirements

### Requirement: Workspaces pnpm
Le dépôt MUST être un monorepo pnpm workspaces dont les packages vivent sous `packages/*`. Le `package.json` racine
MUST être `private`, déclarer `packageManager` (pnpm) et `engines.node` à `>=22`.

#### Scenario: AC: déclaration du gestionnaire et de Node
<!-- openspec-guard:test="monorepo tooling > root package.json pins pnpm, Node >=22 and packages/* workspaces" -->
- **WHEN** on lit le `package.json` racine
- **THEN** `private` vaut `true`, `packageManager` commence par `pnpm@` et `engines.node` vaut `>=22`
- **AND** `pnpm-workspace.yaml` déclare `packages/*`

### Requirement: Scripts racine lint, typecheck et test
La racine MUST exposer les scripts `lint`, `typecheck` et `test`. Chacun MUST couvrir la racine et tous les packages
du workspace, et MUST sortir en code non nul dès qu'une vérification échoue.

#### Scenario: AC: contrôles de fin de tâche
<!-- openspec-guard:test="monorepo tooling > root lint and typecheck scripts cover the repo and exit 0 when clean" -->
- **WHEN** on lance `pnpm -r lint && pnpm -r typecheck && pnpm -r test` puis `pnpm lint && pnpm typecheck && pnpm test` à la racine
- **THEN** toutes les commandes sortent en code 0 sur un dépôt propre

#### Scenario: Échec propagé
<!-- openspec-guard:test="monorepo tooling > typecheck exits non-zero on a type error" -->
- **WHEN** un fichier TypeScript du dépôt contient une erreur de type
- **THEN** `pnpm typecheck` sort en code non nul

### Requirement: TypeScript strict
Tout code TypeScript MUST être compilé avec `strict`, `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes`
activés, via une configuration de base partagée que chaque package étend.

#### Scenario: AC: options strictes héritées
<!-- openspec-guard:test="monorepo tooling > base tsconfig enables strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes" -->
- **WHEN** on lit la configuration TypeScript de base
- **THEN** `strict`, `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes` valent `true`

### Requirement: Interdiction de any
Le lint MUST refuser tout `any` explicite en erreur, pas en avertissement.

#### Scenario: AC: any rejeté par le lint
<!-- openspec-guard:test="monorepo tooling > lint reports explicit any as an error" -->
- **WHEN** le lint analyse un fichier TypeScript qui déclare une variable de type `any`
- **THEN** il signale une erreur et sort en code non nul

### Requirement: Format vérifiable
Le dépôt MUST avoir une configuration Prettier et un script qui vérifie le format sans réécrire les fichiers.

#### Scenario: Format vérifié
<!-- openspec-guard:test="monorepo tooling > format check flags an unformatted file" -->
- **WHEN** un fichier suivi par Prettier n'est pas formaté
- **THEN** le script de vérification du format sort en code non nul

### Requirement: Fichiers ignorés
Le `.gitignore` MUST exclure au minimum `node_modules`, les sorties de build, la couverture, les répertoires `.drop*/`
et les fichiers `.env*`, pour qu'aucune identité locale ni aucun secret ne puisse être commité par erreur.

#### Scenario: AC: secrets et identités ignorés
<!-- openspec-guard:test="monorepo tooling > gitignore excludes drop identities and env files" -->
- **WHEN** on crée `.drop-test/identity.json` et `.env.local` à la racine
- **THEN** `git check-ignore` les reconnaît tous les deux comme ignorés

### Requirement: Dépendances hors stack consignées
Toute dépendance hors de la stack imposée par AGENTS.md MUST être consignée dans `docs/DECISIONS.md` avec sa raison
avant d'être ajoutée.

#### Scenario: Nouvelle dépendance
<!-- openspec-guard:test="monorepo tooling > every dependency outside the imposed stack is recorded in DECISIONS" -->
- **WHEN** une change ajoute une dépendance absente de la stack imposée
- **THEN** `docs/DECISIONS.md` contient une ligne qui nomme cette dépendance et sa raison
