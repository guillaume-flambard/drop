# Preuves T4.3

| Critère | Preuve |
|---|---|
| Limites de la réponse humaine | Test « human answer (T4.3) > accepts a text or text-file answer within the limits and refuses an empty, oversized or non-text one » : vide, plus de 8 000 caractères, fichier de plus de 128 Kio, JSON trop gros par échappement, binaire, contrôle C1, nom piégé (NUL, ESC, saut de ligne, U+202E), type PDF. |
| Plus grande réponse dans une enveloppe | Test « … > fits the largest accepted answer into a sealed envelope » : `human_answer` et `drop_result` scellés sous `MAX_ENVELOPE_BYTES`. |
| Réponse livrée sous le schéma fixe, même reçu | Test « … > delivers a hand-written answer with the same consent and a receipt marked human » : texte reçu, empreinte de `HUMAN_ANSWER_OUTPUT_SCHEMA`, capacité jamais exécutée, reçus valides chez les trois nœuds avec `answeredBy: 'human'`, `reviewed: true`, aucun appel d'outil, texte absent des reçus. Cas local (approbateur = exécuteur) : « … > answers by hand when the owner approves on the node that holds the capability ». |
| Origine annoncée au demandeur | Test « human answer (T4.3) > presents a hand-written answer as such, from the hash of its fixed schema only » (requester-mcp). |
| Reçu marqué humain | Test « … > signs and verifies a receipt that says a human answered » : la modification de `answeredBy` casse la signature. |
| Chemin d'une réponse humaine | Test « … > allows approved to delivered for a hand-written answer, never awaiting_approval to delivered ». |
| Secret bloqué avant envoi | Test « … > refuses a hand-written answer that carries a secret, before anything is sent » : texte et fichier refusés, rien n'est envoyé, carte gardée, envoi réussi après correction. |
| Seul l'approbateur répond, recontrôle exécuteur | Test « … > accepts a hand-written answer from a remote approver and from no one else » : pair non approbateur ignoré, approbateur distant livré, seconde réponse refusée, secret poussé sans contrôle refusé par l'exécuteur avec un message qui n'en dit rien. |
| Route locale | Test « … > answers by hand through the panel route, which refuses an empty or oversized answer » : `executorName` dans `/ui/pending`, vide et mal formé en `E_SCHEMA`, nom trop long avec son message, fichier trop gros en `E_TOO_LARGE`, corps de plus de 200 Kio en 413, réponse valide livrée avec son fichier, seconde tentative en 404. |
| Panneau | Test « menu bar panel (T4.3) > offers to answer by hand, keeps the ledger visible and reviews the answer before sending » (lecture du script servi) et recette dans le navigateur à 380 px le 10 octobre 2026 : registre visible pendant la rédaction, brouillon gardé après changement d'onglet, relecture du texte et du contenu du fichier, focus clavier sur la zone, sur « Retirer » puis sur « Envoyer », fichier Latin-1 refusé, clé d'API bloquée avec `E_SECRET_DETECTED` puis envoi après correction. |
| Scanner borné | Test « secret scanner bounds (T4.3 review) > finds a JWT in linear time, even in a long run of JWT-like prefixes » : mêmes verdicts que l'ancienne expression, 135 000 caractères en moins d'une seconde. |

Recette réelle le 10 octobre 2026, deux `drop serve` sur ce Mac sans relais (session locale T4.2) : réponse texte et fichier CSV par `POST /ui/answer`, demande jusqu'à `receipted`, reçus des deux côtés avec `answeredBy: human` et `toolCalls: []`. Elle a révélé un 500 sur corps JSON mal formé, corrigé en 400 `E_SCHEMA` et couvert par le test de route.

Contrôle par mutation : onze protections retirées une à une (secret chez l'approbateur, contrôle d'approbateur, marque du reçu, contenu binaire, empreinte du schéma fixe, recontrôle exécuteur, message de refus, contrôle C1, nom piégé, origine côté demandeur, `executorName`) ; chaque fois au moins un test échoue.

## Revue

Revue adverse et sécurité (sous-agent indépendant) : deux critiques corrigées.
1. Un pair appairé pouvait présenter une carte mensongère et recevoir la réponse. La relecture nomme maintenant le premier destinataire réel d'après les pairs locaux. La limite résiduelle est consignée dans D64.
2. La relecture ne montrait pas le contenu du fichier : elle le montre maintenant, et un fichier non UTF-8 est refusé.

Corrigés aussi :
- recontrôle exécuteur non testé ;
- message de refus qui révélait les types de secret au demandeur ;
- transition `awaiting_approval → failed` contraire à la spec ;
- 500 sur corps trop gros ;
- messages de taille trompeurs ;
- contrôles C1 et noms piégés ;
- expression JWT quadratique (environ 5 s sur 128 Kio) ;
- origine illisible côté demandeur ;
- focus clavier perdu ;
- brouillons jamais purgés ;
- taille d'enveloppe non prouvée.

Restent, acceptés :
- collision de deux approbateurs (la seconde réponse est connue de l'exécuteur, qui l'ignore) ;
- test du panneau par lecture du script servi plutôt que par un DOM simulé, compensé par la recette navigateur.

`/cso` gstack ciblé en mode diff (run `1791644468184-77f1cd712094266c`) :
- statut partiel, car les images et archives binaires du dépôt ne sont pas lues ;
- un constat faible : la carte trompeuse d'un pair appairé, atténuée et documentée ;
- aucune faille élevée.

## Vérification

- `pnpm -r lint` et `pnpm -r typecheck` ;
- `pnpm -r test` : 392 tests ;
- `openspec validate --all --strict` ;
- openspec-guard avec sélecteurs.
