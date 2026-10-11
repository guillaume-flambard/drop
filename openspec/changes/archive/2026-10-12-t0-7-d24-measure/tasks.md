# Tasks : kit de mesure D24

Aucune logique (schéma, crypto, politique, filtre) n'est touchée : la change est documentaire, donc la règle « tests
avant le code » ne s'applique à aucune tâche ci-dessous. La vérification porte sur l'exécution réelle des commandes
du guide.

## 1. Guide d'installation relu (`packages/blocked-observer/README.md`)

- [x] 1.1 Exécuter chaque commande du guide telle qu'écrite, avec `BLOCKED_OBSERVER_HOME` dirigé sur un répertoire
      jetable, et noter tout écart. **Vérification** : les sorties de `install`, `print-instructions`, `report`,
      `export` et du serveur MCP (`initialize`, `tools/list`, `tools/call`) sont obtenues sur ce répertoire isolé, et
      `~/.blocked-observer/` de Guillaume est inchangé. Fait le 12/10 sur `46c0018` : les cinq commandes répondent
      en exit 0, le serveur MCP expose un seul outil et enregistre un événement. Aucun écart dans l'outil.
- [x] 1.2 Ajouter l'avertissement qui manque : Node refuse les fichiers TypeScript sous `node_modules`, donc on
      clone le dépôt et on n'installe pas le paquet à distance. **Vérification** :
      `rg -n "node_modules" packages/blocked-observer/README.md` retrouve l'avertissement.
- [x] 1.3 Écrire le prérequis Node avec sa source, et non sous forme d'affirmation nue. **Vérification** : le README
      cite Node 22.18 avec la mention que la CI ne valide que Node 24, donc le plancher est vérifié contre la doc
      Node 22.x et non contre la CI.

## 2. Fiche d'entretien et consignes d'export (`docs/kit-d24-entretien.md`)

- [x] 2.1 Créer le document avec le consentement, ce qui est collecté, et ce qui ne l'est jamais. **Vérification** :
      le fichier existe et couvre les trois points en reprenant les termes de la section « Ce qui est collecté » du
      README de blocked-observer.
- [x] 2.2 Écrire le déroulé de l'entretien adossé à `classify` et au codebook `docs/CLASSIFICATION.md`, avec le
      relevé des minutes perdues. **Vérification** : la fiche référence `docs/CLASSIFICATION.md`, ne redéfinit aucun
      des huit codes, et donne la commande `classify <id>`.
- [x] 2.3 Écrire les consignes d'export : quand exporter, la commande, ce qui quitte la machine. **Vérification** :
      la commande `export --out` est recopiée telle que la CLI la produit réellement.

## 3. Note de recrutement et décisions écrites

- [x] 3.1 Ajouter la note de recrutement : à qui parler, ce qu'on promet, les 10 jours actifs par personne exigés
      par D24. **Vérification** : la fiche porte ces trois éléments et la note renvoie à D24 sans en réécrire le
      seuil.
- [x] 3.2 Écrire dans `docs/DECISIONS.md` les deux points tranchés sans spec : le prérequis Node vérifié contre la
      doc officielle, et le choix de la route par clone plutôt que par publication npm. **Vérification** : les deux
      entrées existent, datées, et citent la source consultée. Fait : D92 et D93.

## 4. Vérification

- [x] 4.1 `pnpm -r lint` passe. Fait le 12/10 : eslint `--max-warnings 0` et `prettier --check`, les deux verts.
- [x] 4.2 `pnpm -r typecheck` passe. Fait le 12/10 : `tsc --noEmit`, aucun diagnostic.
- [x] 4.3 `pnpm -r test` passe. Fait le 12/10 : 610 tests passent, 1 ignoré, 0 échec, en 69 s.
- [x] 4.4 `npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail`
      passe avec les arguments `--tests` du dépôt, puis la baseline est régénérée en retraits seulement. Fait le
      12/10 : exit 0, 419 critères liés par sélecteur, 141 gelés par la baseline, 0 incertain ; la régénération
      laisse la baseline strictement identique, la change ne portant aucun delta de spec.
- [x] 4.5 `/review` (gstack) sur le diff. `/cso` n'est pas requis : la change ne touche ni `protocol`, ni `relay`,
      ni `node`, ni `runner`, ni `capabilities`, ni `requester-mcp`. Fait le 12/10 : aucun code modifié, donc ni
      requête SQL, ni frontière de confiance LLM, ni effet de bord conditionnel. Les liens relatifs des deux
      documents pointent tous vers un fichier existant ; les sept commandes et les cinq options citées
      (`--since`, `--no-codex`, `--out`, `--classified-only`, `--merge`) existent dans la CLI ; une formulation
      tronquée reprise du README a été corrigée.

## Workflow follow-up

- Archive : `openspec archive t0-7-d24-measure`, ligne T0.7 repassée à l'état qui convient dans `docs/TASKS.md`,
  commit. Le recrutement et les entretiens restent de côté de Guillaume : cette change ne ferme que la préparation
  du kit.
