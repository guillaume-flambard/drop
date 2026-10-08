## Why

Le kit de specs d'origine (`docs/specs/00` à `08`) était en prose, avec les critères d'acceptation en fin de fichier et
le détail de chaque tâche dispersé entre `docs/TASKS.md` et les specs. Le projet adopte OpenSpec (D12) : les exigences
deviennent des contrats testables (Requirement + Scenario) dans une source unique, et chaque tâche T* devient une change
qu'on propose, applique puis archive.

## What Changes

- Les exigences normatives de `docs/specs/02` à `08` deviennent dix capacités OpenSpec. On y ajoute le modèle de données,
  le cycle de vie et la configuration locale de `01`.
- Chaque puce « Critères d'acceptation » devient un scénario préfixé `AC:`.
- Chaque « à vérifier » reste une exigence marquée `<!-- à vérifier -->`.
- Le texte descriptif (`00` vision et `01` architecture) passe tel quel dans `openspec/project/`.
- `docs/specs/` est supprimé une fois la couverture vérifiée. Le texte d'origine reste dans le commit `ecf96a8`.
- `docs/TASKS.md` devient un index : ID, change, dépendances, statut.

## Capabilities

### New Capabilities

- `monorepo-tooling` : socle pnpm, TypeScript strict, lint, format, tests, fichiers ignorés (AGENTS.md, T0.0).
- `blocked-observer` : mesure des blocages, étape 0 (spec 02).
- `protocol` : identité, enveloppe, messages, reçus, modèle de données (spec 03 et 01).
- `relay` : routage WebSocket des enveloppes chiffrées (spec 04).
- `node` : daemon et CLI `drop`, API locale, consentement (spec 05 et 01).
- `runner` : cadre d'exécution des capacités, validation, scan de secrets (spec 06).
- `capability-error-summary` : capacité `production.error_summary` (spec 06).
- `capability-repo-answer` : capacité `repo.answer` (spec 06).
- `requester-mcp` : serveur MCP stdio du demandeur (spec 07).
- `deploy-mac-vps` : déploiement de test et scénario de démo (spec 08).

### Modified Capabilities

Aucune (premier remplissage de `openspec/specs/`).

## Non-goals

- Aucun code produit. T0.0 est une change séparée.
- Aucune exigence nouvelle ni modifiée par rapport au kit d'origine : c'est une migration de forme.
- Aucune décision humaine en attente n'est tranchée ici (seuil go/no-go, nom de produit).

## Impact

- Les agents lisent `openspec/specs/<capacité>/spec.md` au lieu de `docs/specs/NN-*.md`.
- AGENTS.md, CLAUDE.md et README décrivent le cycle OpenSpec, avec les contrôles gstack et `grilling`.
