# Revue gstack de `codex/t3-1a-hermes-evaluation`

**Verdict : `issues_found`, non clean.** La revue T3.1a elle-même n’a pas établi de défaut dans la recette ou les preuves Hermes. La comparaison complète avec `origin/main` inclut toutefois les commits historiques T3.0 et T3.1 et révèle un défaut critique de stockage introduit par T3.1. Le propriétaire a ouvert T3.1b dans `docs/TASKS.md`; le défaut demeure présent dans le code et n’est pas corrigé par la tâche T3.1a.

## Finding non résolu

**CRITICAL, confiance 9,5/10 — saturation durable du disque par un pair admis.** À [home.ts](../../../../packages/node/src/home.ts#L121), `claimDrop()` crée un fichier exclusif pour chaque nouvel ID de demande et ne supprime jamais les tombstones. Le moteur l’appelle après validation de la capacité et de l’entrée, avant l’approbation du propriétaire ([engine.ts](../../../../packages/node/src/engine.ts#L637)). La limite du relais est de 60 messages par connexion par défaut et son compteur vit sur l’objet `Connection` recréé à la reconnexion ([server.ts](../../../../packages/relay/src/server.ts#L86), [server.ts](../../../../packages/relay/src/server.ts#L169)). Un pair authentifié peut donc remplir le stockage par des ID frais, y compris pour des demandes ensuite refusées ou expirées. L’adversarial natif et le Red Team ont confirmé le même défaut. Aucun correctif n’a été effectué dans cette revue.

Ce défaut est antérieur au travail Hermes : `git blame` rattache le tombstone au commit T3.1 `6282624`. Le scénario Hermes borné ne crée que quelques demandes synthétiques et n’évalue pas la croissance à long terme; ce finding ne constitue donc pas un échec d’AC-HERMES-01/02/03. Il reste un risque P1/High pour le runtime et l’exploitation de la branche entière.

## Résultats des revues

- Core : défaut ci-dessus confirmé sur les lignes et appels du code.
- Specialists : testing, maintainability, security, performance, API contract et simplification ont tous retourné `NO FINDINGS`.
- Red Team : confirme le défaut de saturation disque, sans second finding.
- Adversarial natif : confirme le même défaut. Les tests, fixtures et specs ont été traités en mode résumé selon la règle gstack.
- Design : le détecteur Impeccable a émis 47 heuristiques sur le site complet. Les alertes de hiérarchie de titres et de styles n’ont pas été retenues comme défauts sans preuve d’impact; aucune tâche n’est créée pour ces seules heuristiques.
- Revue Codex extérieure : indisponible sous le même harness Codex; aucun processus externe lancé. La revue native requise a été exécutée.

**PR Quality Score : 8/10.** Il reflète le finding CRITICAL du Red Team. Le finding est enregistré une fois malgré sa confirmation par deux passes.

## Exploratory QA et vérification

Les résultats navigateur partiels et leurs limites figurent dans le [rapport QA](report.md). La page d’avancement se charge, le lien Hermès mène au document local, `/downloads/HERMES.md` répond 200 en `text/markdown; charset=utf-8`, et la route non publiée testée répond au 404 attendu. Les checkpoints 006 et 007 sont les seules observations retenues; 001 à 005 restent conservés mais sont exclus parce que leurs observations avaient été résumées.

La revue n’a modifié ni code, ni test, ni commit. Le seul changement documentaire visible pendant la revue est l’entrée de suivi T3.1b ajoutée par le propriétaire. La revue de branche est donc terminée avec un finding ouvert; cela ne vaut pas feu vert de sécurité pour le profil privé ou un pilote.
