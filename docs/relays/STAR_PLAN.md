# Relais STAR — plan d'exécution (13 octobre 2026)

**Situation** : Le backlog canonical `docs/TASKS.md` comporte des tâches terminées, à faire, bloquées et dépendantes d'autres tâches. Les comptes rendus de relais sont dispersés ; ne pas prendre une ligne `todo` pour une preuve d'absence de code. Les PR #104 et #105 sont en vérification et dépendent l'une de l'autre.

**Tâche** : Formaliser toutes les tâches **ouvertes** (`todo`/`doing`/`blocked`) dans un registre STAR dérivé de `docs/TASKS.md`, avec références OpenSpec, dépendances, action concrète et preuve manquante. Faciliter une loop qui choisit une seule tranche réalisable et ne proclame jamais `DONE` par simple génération de documentation.

**Actions prévues** :
1. Générer le registre depuis l'index canonique, compléter un objectif d'action et une validation par tâche ; ne pas recopier des statuts manuellement.
2. Ajouter des tests qui garantissent la couverture intégrale des tâches ouvertes et des quatre étapes STAR ; bloquer les revendications de réussite sans preuves.
3. Exécuter la génération, lint, typecheck, tests, inspection GitHub, puis livrer ce relais en PR normale.
4. Suivre les PR #104 et #105 sans contourner la merge queue ; préparer le prochain cycle autonome seulement si ses dépendances sont satisfaites.

**Résultat attendu** : registre complet, contrôlé, reproductible et utilisable par chaque agent comme handoff ; PR vérifiable. Aucun test physique, aucune release stable, aucun secret utilisé.

## Résultat de ce relais

- Le parseur correct lit **120** tâches, même lorsqu'une ligne comporte un `|` dans une description ou se poursuit sur plusieurs lignes. Au lieu de l'inventaire incomplet des premiers scripts, il a identifié **43** chantiers ouverts (`28 todo`, `11 doing`, `4 blocked`) et **13** chantiers de préqualification possibles selon les dépendances formelles.
- Les 43 boucles S/T/A/R sont produites dans [STAR_BACKLOG](STAR_BACKLOG.md), avec une action et une preuve de sortie spécifiques à chaque chantier, et liens vers les changes OpenSpec localisées. Les archives recensent les 70 done, 2 deferred et 5 superseded.
- `AGENTS.md` impose désormais la même méthode à chaque relais, sans prétendre qu'une tâche est faite tant qu'elle n'a pas passé ses critères.
- **Preuves :** `node scripts/star-backlog.ts --check` PASS ; `pnpm exec vitest run test/star-backlog.test.ts` **5/5 PASS** ; `pnpm -r lint` PASS ; `pnpm -r typecheck` PASS ; `openspec-guard@0.3.0 --fail-on fail` PASS (aucun nouveau critère non lié) ; `git diff --check` PASS.
- Le test complet du monorepo et les contrôles hébergés GitHub restent des preuves supplémentaires de la PR. La production et les releases ne sont pas modifiées.

**Prochaine boucle candidate :** T4.20 pour relier des scénarios OpenSpec à des tests existants, ou l'un des chantiers prioritaires T3.1d/T3.1e/T4.39 non pris par un agent. Sélectionner via `docs/TASKS.md` et vérifier les PR/branches avant de coder ; **une seule tranche par relais**.
