## Context

Voir proposal.md, section Why. Le kit d'origine est une prose française de 686 lignes, réparties en neuf fichiers. Le
dépôt n'a encore aucun code.

## Goals / Non-Goals

**Goals :** aucune perte normative, des scénarios testables, et un contexte descriptif disponible pour chaque change.

**Non-Goals :** reformuler la vision, et découper les specs plus finement que l'index des tâches ne l'exige.

## Decisions

- **Specs remplies d'avance, changes par tâche.** Les dix capacités sont créées par cette migration. Une change de
  tâche (ex. `t1-3-relay`) implémente des exigences existantes. Elle porte `skip_specs: true` si le contrat ne change
  pas, et un delta MODIFIED/ADDED si l'implémentation révèle un manque. L'autre option, créer chaque capacité au fil des
  tâches, a été écartée : la moitié du kit serait restée en prose hors d'OpenSpec pendant toute l'étape 1, avec deux
  sources de vérité.
- **Vision et architecture hors des specs.** Elles décrivent le pourquoi et la forme, pas un comportement vérifiable.
  Elles vivent dans `openspec/project/` et la config OpenSpec les cite dans son `context`.
- **Couverture des scénarios par `openspec-guard` en mode sélecteur.** Specs en français, tests en anglais : la
  similarité de mots ne traverse pas les langues. Le contrôle tourne avec `--require-selector`, et chaque scénario
  couvert porte `<!-- openspec-guard:test="..." -->`. Les scénarios « à vérifier » (lecture de doc) et les points de
  décision humaine portent `<!-- openspec-guard:non-testable reason="..." -->`.
- **Baseline.** Après la migration, `.openspec-guard-baseline.json` gèle les scénarios pas encore implémentés. Chaque
  change lie ses scénarios à des tests, puis régénère la baseline. Le diff ne doit contenir que des retraits.

## Risks / Trade-offs

- [Perte silencieuse à la conversion] : on compte les puces d'acceptation de chaque fichier source et on dresse un
  tableau de correspondance (section suivante). On relit avant de supprimer `docs/specs/`.
- [Paraphrase qui change le sens] : identifiants, codes d'erreur, limites et chaînes d'UI sont copiés mot pour mot. Le
  texte d'origine reste consultable avec `git show ecf96a8:docs/specs/<fichier>`.
- [Specs trop détaillées pour le format] : une exigence dont la description dépasse 500 caractères est découpée.

## Migration Plan

1. Commit `ecf96a8` avec le kit d'origine (point de retour).
2. Conversion, `openspec validate --strict`, contrôle anti-perte.
3. Archive de la change : `openspec/specs/` est rempli par `openspec archive`.
4. Suppression de `docs/specs/`. Retour arrière : `git revert`.

## Coverage table

Rempli après conversion, voir `coverage.md` dans ce dossier.
