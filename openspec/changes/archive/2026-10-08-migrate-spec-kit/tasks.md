# Tasks

## 1. Conversion

- [x] 1.1 Écrire les dix delta specs sous `specs/<capacité>/spec.md` et vérifier que `openspec validate migrate-spec-kit --strict` passe
- [x] 1.2 Copier `00` et `01` dans `openspec/project/` et vérifier que la config OpenSpec les cite dans son `context`
- [x] 1.3 Annoter les scénarios « à vérifier » et de décision humaine en `openspec-guard:non-testable` avec une raison, et vérifier qu'aucun autre scénario n'en porte

## 2. Contrôle anti-perte

- [x] 2.1 Compter les puces « Critères d'acceptation » de `docs/specs/02` à `08` et les scénarios `AC:`, consigner le tableau de correspondance dans `coverage.md`, et vérifier que chaque puce a au moins un scénario
- [x] 2.2 Recenser chaque « à vérifier » des sources et vérifier qu'il a une exigence marquée `<!-- à vérifier -->`

## 3. Index et instructions

- [x] 3.1 Réécrire `docs/TASKS.md` en index (ID, change, capacités, dépendances, statut) et vérifier que les 20 tâches et leurs dépendances d'origine sont toutes présentes
- [x] 3.2 Ajouter D12 et D13 à `docs/DECISIONS.md`
- [x] 3.3 Mettre AGENTS.md, CLAUDE.md et README à jour avec le cycle OpenSpec, gstack et `grilling`, et vérifier qu'aucun chemin `docs/specs/` ne subsiste hors de l'historique

## 4. Vérification

- [x] 4.1 Lancer `openspec validate --all --strict` et vérifier qu'il sort en code 0

## Workflow follow-up

- Archiver la change (`openspec archive migrate-spec-kit`), puis vérifier que `openspec list --specs` affiche dix capacités.
- Créer `.openspec-guard-baseline.json` sur `openspec/specs/` avec `--require-selector`, puis vérifier que le contrôle passe avec `--baseline .openspec-guard-baseline.json --fail-on fail`.
- Supprimer `docs/specs/` et commiter.
