# Tasks

## 1. Politique et financement

- [x] 1.1 Écrire puis faire passer les tests d’origines/IP/DNS/redirections, financer sans substitution ; documenter les limites de transport.
- [x] 1.2 Appliquer la politique à LLM, MCP HTTP, références d’agents, A2A et relais ; tests négatifs avant envoi et refus des processus non isolés.

## 2. Configuration et exploitation

- [x] 2.1 Tester puis réaliser init privé, migration et restauration avec conservation et conflit ; documenter les commandes.
- [x] 2.2 Tester puis réaliser révocation persistante, reprise T2.1 et recette sauvegarde/restauration interne.
- [x] 2.3 Retirer le bootstrap public Mac ; vérifier le choix privé et compiler le shell.

## 3. Preuve système

- [x] 3.1 Deux Nodes et fixtures internes : consentement, réponse, refus, panne, arrêt/relance sans doublon ; test système.
- [x] 3.2 Exécuter la recette conteneur sans Internet, capturer démarrage/usage/arrêt/reprise et conserver les preuves expurgées AC-PRIVATE-01 à 08.

## 4. Vérification

- [x] 4.1 pnpm -r lint, pnpm -r typecheck, pnpm -r test ; openspec validate strict ; openspec-guard check puis baseline sans ajouts.
- [x] 4.2 /review et /cso gstack ; corriger les constats et vérifier indépendamment les critères.
- [x] 4.3 Bilan, risques et état READY_FOR_MANUAL_ACCEPTANCE fidèles ; chantiers et documentation actualisés.

## Workflow follow-up

- Archiver seulement après preuves et vérifications, puis commit et arbre propre. T2.1 ne passe à done qu’avec ses preuves de reprise.

Preuves des étapes 1 à 3 : tests private-network/private-adapters/private-config/private-replay/private-system/private-bundle ; cargo test --offline ; capture et résultat dans evidence/. Vérification finale passée : EV-01 à EV-09, voir evidence.md et closure.md. Audit CSO partiel conservé comme limite explicite ; revue native indépendante sans P1/P2 résiduel.
