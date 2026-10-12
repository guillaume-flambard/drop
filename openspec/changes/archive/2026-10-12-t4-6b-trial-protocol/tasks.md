# Tasks : protocole de l'essai en profil privé

Change documentaire : aucune logique (schéma, crypto, politique, filtre) n'est touchée, donc la règle « tests avant le
code » ne s'applique à aucune tâche. La vérification porte sur l'exactitude de chaque affirmation contre le code, la
configuration et les services réels.

## 1. Relever l'état réel

- [x] 1.1 Lire les lignes T4.6, T4.6a, T4.6b, T4.23, T3.4, T3.7, T3.8, T4.31 de l'index, D24, D83, D84, D86, D91,
      D95, le PRD (section 7), APP_FLOW et UX_UI. **Vérification** : chaque mesure du protocole cite sa source.
- [x] 1.2 Vérifier les services : `curl https://drop.memolabs.dev/health` (commit `8126108`, celui de `main`),
      `curl https://drop.memolabs.dev/join` (404), `gh release list` (vide), `gh pr view 45` (ouverte).
- [x] 1.3 Lire dans le code ce que le protocole affirme : expiration à 10 minutes, schéma et emplacement des reçus,
      faits sans décision, routage de `ask_team`, filtre `privateSocket` du profil privé, journal du relais,
      `catalog_request`, CLI de révocation, démarrage automatique, libellés de Mon espace.

## 2. Écrire

- [x] 2.1 Remplacer `docs/essais/README.md` par le protocole : conditions d'entrée datées, recrutement, préparation,
      séance d'installation, observation des trois mesures, journal, rendez-vous, canal de correction,
      désinstallation, compte rendu. **Vérification** : chaque étape porte « Disponible » ou « Pas encore livré ».
- [x] 2.2 Écrire `docs/essais/fiche-accord.md`. **Vérification** : elle dit ce qui s'installe, ce qui circule et qui le
      voit, ce qu'on relève, ce qu'on ne relève jamais, captures, arrêt, retrait, conservation.
- [x] 2.3 Renvoyer au kit D24 sans le recopier. **Vérification** : le protocole cite `docs/kit-d24-entretien.md` et
      ne redéfinit ni seuil ni code de classement.
- [x] 2.4 Mettre à jour la phrase de `docs/AVANCEMENT.md` qui renvoyait à l'ancien protocole.

## 3. Vérifier

- [x] 3.1 Éprouver les commandes `jq` des sections 6.1 et 6.2 sur des reçus fabriqués selon `ReceiptSchema`.
      **Vérification** : sortie attendue (une demande décidée, une expirée, un fait exclu, une demande refusée).
- [x] 3.2 Aucun tiret cadratin ni demi-cadratin dans les fichiers écrits. **Vérification** : `grep` vide.
- [x] 3.3 `openspec validate t4-6b-trial-protocol --strict` passe.
- [x] 3.4 `pnpm -r lint` passe ; le Markdown est hors Prettier (`.prettierignore`).
- [x] 3.5 `npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail`
      passe, et `--update-baseline` ne change pas la baseline (aucun delta de spec).

## Workflow follow-up

- Archive dans la même PR : `openspec archive t4-6b-trial-protocol --skip-specs --yes`.
- Statut de T4.6b dans `docs/TASKS.md` et décisions dans `docs/DECISIONS.md` : laissés à Guillaume (plusieurs agents en
  parallèle), proposés dans la PR.
