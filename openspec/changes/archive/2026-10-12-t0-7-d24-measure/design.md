# Design : kit de mesure D24

## Context

Voir proposal.md, section Why. blocked-observer lui-même est complet et vérifié : la CLI, le hook, l'import Codex,
le seuil D24 et le rapprochement existent et sont couverts. Le manque est le kit, c'est-à-dire ce que Guillaume
donne à un collègue pour que celui-ci installe l'outil, travaille dix jours, et tienne un entretien.

Contrainte de départ : les 111 événements de Guillaume sont réels et doivent survivre à toute vérification.

## Goals / Non-Goals

- **Goal** : un document que suit un développeur recruté en cinq minutes, et une fiche dont Guillaume tient
  l'entretien sans inventer de procédure.
- **Non-Goal** : aucun code, aucune publication de paquet, aucun protocole d'essai (T4.6b), aucun recrutement.

## Decisions

1. **Le kit se scinde en deux, suivant qui le lit.** Le guide d'installation reste dans
   `packages/blocked-observer/README.md`, à côté de la CLI qu'il documente : c'est le fichier qu'un participant lit
   après le clone. La fiche d'entretien et les consignes d'export vivent dans `docs/kit-d24-entretien.md`, parce
   qu'elles appartiennent à Guillaume, pas au participant. Alternative écartée : un seul `docs/kit-d24.md` tenant
   tout. Il séparerait l'installation du code qu'elle installe, et le README resterait de toute façon le premier
   fichier trouvé.

2. **Route par clone, pas de publication npm.** Le paquet est `private: true`. Publier est un acte externe quasi
   irréversible et hors du périmètre de la ligne d'index. Node refuse par ailleurs les fichiers TypeScript sous
   `node_modules`, donc une route npm casserait le binaire quoi qu'il arrive. Un manque découvert devient une ligne
   `todo` séparée, pas une tâche élargie (règle du dépôt).

3. **Toute vérification tourne sur un `BLOCKED_OBSERVER_HOME` isolé.** Chaque commande du guide est exercée avec un
   répertoire jetable, pour que rien ne modifie `events.jsonl`, `activity.json` ni `errors.log` de Guillaume. C'est
   aussi la seule façon de tester `export` et `report` sur un état connu.

4. **Le consentement est une ligne de la fiche, pas un document à part.** La mesure lit les journaux de session
   locaux de collègues. D83 a déjà décidé de recruter des collègues ; la fiche enregistre le consentement, ce qui
   est collecté, et le fait que rien ne quitte la machine hors un export relu. Alternative écartée : un formulaire de
   consentement autonome. Plus lourd que la demande, et le consentement de drop est une fonction du produit, pas un
   outil de mesure.

5. **La fiche s'appuie sur `classify`, pas sur une seconde taxonomie.** `classify` pose déjà les questions et produit
   les codes, dont les `YES_*` que D24 compte. La fiche doit donc enregistrer les minutes perdues et le contexte
   autour des codes que la CLI attribue, sans recréer un classement parallèle qui divergerait.

## Risks / Trade-offs

- [Le clone suivi de `pnpm install` décourage un recruté] → La fiche donne le chemin de cinq minutes et le plancher
  Node vérifié. Si le frottement se confirme sur le terrain, une ligne `todo` séparée porte un binaire autonome.
- [Un participant oublie d'importer ses logs Codex] → La fiche donne la cadence et la commande
  `import-codex --since 7d`, sans quoi ses blocages n'existent pas au moment de l'entretien.
- [Biais d'entretien : Guillaume classe ses propres données] → D24 exige au minimum 3 développeurs, et
  `report --merge` agrège les exports, donc une seule personne ne peut pas porter le verdict.
- [Le seuil D24 devient non mesurable faute de jours actifs] → `activity.json` compte les jours actifs ; la fiche
  rappelle que 10 jours actifs chacun est un prérequis du verdict, pas un objectif secondaire.

## Open Questions

- Si l'essai inclut le partage par modèle (T3.2 et T4.16) est une décision de Guillaume qui n'affecte pas ce kit :
  blocked-observer ne dépend d'aucun modèle.
