# Spec Delta

## MODIFIED Requirements

### Requirement: Workspaces pnpm
Le dépôt MUST être un monorepo pnpm workspaces dont les packages vivent sous `packages/*`. Le `package.json` racine
MUST être `private`, déclarer `packageManager` (pnpm) et `engines.node` à `>=22.13`, le plancher réel de l'outillage
(eslint 10 et vitest 5).

#### Scenario: AC: déclaration du gestionnaire et de Node
<!-- openspec-guard:test="monorepo tooling > root package.json pins pnpm, Node >=22.13 and packages/* workspaces" -->
- **WHEN** on lit le `package.json` racine
- **THEN** `private` vaut `true`, `packageManager` commence par `pnpm@` et `engines.node` vaut `>=22.13`
- **AND** `pnpm-workspace.yaml` déclare `packages/*`

### Requirement: Scripts racine lint, typecheck et test
La racine MUST exposer les scripts `lint`, `typecheck` et `test`. Chacun MUST couvrir la racine et tous les packages
du workspace, et MUST sortir en code non nul dès qu'une vérification échoue. `pnpm -r <script>` MUST exécuter les
scripts racine.

#### Scenario: AC: contrôles de fin de tâche
<!-- openspec-guard:test="monorepo tooling > recursive and root lint and typecheck run the root scripts and exit 0 when clean" -->
- **WHEN** on lance `pnpm -r lint && pnpm -r typecheck && pnpm -r test` puis `pnpm lint && pnpm typecheck && pnpm test` à la racine
- **THEN** toutes les commandes sortent en code 0 sur un dépôt propre
- **AND** `pnpm -r typecheck` exécute bien le script racine

#### Scenario: Échec propagé
<!-- openspec-guard:test="monorepo tooling > typecheck exits non-zero on a type error and zero on valid code" -->
- **WHEN** un fichier TypeScript contient une erreur de type
- **THEN** la vérification de types sort en code non nul en signalant cette erreur
- **AND** la même configuration sur du code valide sort en code 0

### Requirement: Interdiction de any
Le lint MUST refuser tout `any` explicite en erreur, pas en avertissement, y compris derrière un commentaire de
désactivation en ligne : les commentaires `eslint-disable` sont ignorés, et une exception passe par la configuration.

#### Scenario: AC: any rejeté par le lint
<!-- openspec-guard:test="monorepo tooling > lint reports explicit any as an error, even behind an inline disable" -->
- **WHEN** le lint analyse un fichier TypeScript qui déclare une variable de type `any`, avec ou sans `/* eslint-disable */`
- **THEN** il signale une erreur et sort en code non nul

### Requirement: Format vérifiable
Le dépôt MUST avoir une configuration Prettier et un script qui vérifie le format sans réécrire les fichiers. Le script
`lint` MUST inclure cette vérification, pour que le contrôle de fin de tâche bloque un écart de format.

#### Scenario: Format vérifié
<!-- openspec-guard:test="monorepo tooling > format check uses the repo Prettier config and flags an unformatted file" -->
- **WHEN** un fichier suivi par Prettier n'est pas formaté
- **THEN** le script de vérification du format, et donc `pnpm lint`, sort en code non nul

### Requirement: Fichiers ignorés
Le `.gitignore` MUST exclure au minimum `node_modules`, les sorties de build, la couverture, tout fichier ou répertoire
`.drop*`, tous les fichiers `.env*` (y compris `.env.example`), les clés (`*.pem`, `*.key`, `id_ed25519*`) et `.npmrc`, pour
qu'aucune identité locale, clé ni jeton ne puisse être commité par erreur.

#### Scenario: AC: secrets et identités ignorés
<!-- openspec-guard:test="monorepo tooling > gitignore excludes drop identities, keys and env files" -->
- **WHEN** on crée `.drop-test/identity.json`, `.drop-key`, `.env.local`, `secret.pem`, `id_ed25519` et `.npmrc` à la racine
- **THEN** `git check-ignore` les reconnaît tous comme ignorés
- **AND** `.env.example` est ignoré lui aussi, à la racine comme dans un package

### Requirement: Dépendances hors stack consignées
Toute dépendance hors de la stack imposée par AGENTS.md MUST être consignée dans `docs/DECISIONS.md` avec sa raison
avant d'être ajoutée.

#### Scenario: Nouvelle dépendance
<!-- openspec-guard:test="monorepo tooling > every dependency outside the imposed stack is recorded in DECISIONS" -->
- **WHEN** une change ajoute une dépendance absente de la stack imposée
- **THEN** une entrée `D<n>` de `docs/DECISIONS.md` nomme cette dépendance et sa raison

#### Scenario: Dépendance non consignée détectée
<!-- openspec-guard:test="monorepo tooling > dependency check reports a dependency missing from the decision entries" -->
- **WHEN** une dépendance hors stack n'est citée dans aucune entrée `D<n>`, même si elle apparaît ailleurs dans le fichier
- **THEN** le contrôle la signale
- **AND** une dépendance nommée `@drop/*` n'est exemptée que si sa version utilise le protocole `workspace:`

## ADDED Requirements

### Requirement: Couverture complète des contrôles
La vérification de types MUST couvrir tout fichier `.ts`, `.tsx`, `.mts` et `.cts` du dépôt hors dépendances, sorties
et outillage OpenSpec. Les tests MUST collecter tout fichier `*.test.*` et `*.spec.*` de ces extensions, où qu'il soit.

#### Scenario: AC: aucun fichier hors contrôle
<!-- openspec-guard:test="monorepo tooling > every TypeScript file is typechecked and every test file is collected" -->
- **WHEN** on liste les fichiers TypeScript et de test suivis par git
- **THEN** chacun figure dans la liste des fichiers vérifiés et dans la liste des tests collectés

### Requirement: Tests focalisés refusés
Un test focalisé (`it.only`, `describe.only`) MUST faire échouer `pnpm test`, en local comme en CI, au lieu d'ignorer
silencieusement les autres tests.

#### Scenario: it.only fait échouer le contrôle
<!-- openspec-guard:test="monorepo tooling > a focused test fails the run instead of skipping the others" -->
- **WHEN** un fichier de test contient `it.only`
- **THEN** `pnpm test` sort en code non nul

### Requirement: Pas de scripts par package
Les packages du workspace MUST NOT définir leurs propres scripts `lint`, `typecheck` ou `test` : l'outillage racine les
couvre, et un script local ferait tourner deux configurations différentes.

#### Scenario: Script local refusé
<!-- openspec-guard:test="monorepo tooling > workspace packages define no lint, typecheck or test script of their own" -->
- **WHEN** un `packages/*/package.json` déclare `lint`, `typecheck` ou `test`
- **THEN** les tests de l'outillage échouent

### Requirement: Lint typé
Le lint MUST utiliser les règles qui exigent les types (`no-unsafe-*`, `no-floating-promises`, `no-misused-promises`)
sur tout fichier TypeScript, pour bloquer un `any` implicite et une promesse non gérée.

#### Scenario: Promesse flottante refusée
<!-- openspec-guard:test="monorepo tooling > lint rejects a floating promise and an unsafe any from JSON.parse" -->
- **WHEN** un fichier TypeScript appelle une fonction asynchrone sans gérer sa promesse, ou affecte le résultat de `JSON.parse` à une valeur typée
- **THEN** le lint signale une erreur
