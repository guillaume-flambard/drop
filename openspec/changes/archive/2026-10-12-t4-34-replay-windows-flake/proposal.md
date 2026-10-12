# T4.34 : le test d'écriture anti-rejeu tient sous Windows chargé

## Why

« keeps admitting after a transient sync failure at any step of a claim that prunes expired markers »
(`packages/node/test/replay-write-failure.test.ts`) a dépassé son délai par défaut de 5 s sous Windows, sur deux PR
du 12 octobre 2026 :

| Run (tentative 1) | Purge | Premier claim | Rollback | Fichier |
| --- | --- | --- | --- | --- |
| 38215254464 (T4.32) | 5,2 s, échec | 6,5 s, échec | 0,2 s | 11,9 s |
| 38219945584 (T4.23) | 8,2 s, échec | 2,6 s | 4,0 s | 15,1 s |
| neuf runs Windows verts du même jour | 1,1 à 2,9 s | 0,6 à 1,6 s | moins de 0,3 s | 1,8 à 4,7 s |

Sous Linux le fichier entier prend 0,5 s, sous macOS 1,3 à 1,5 s. Deux causes se cumulent :

1. **Chaque itération fait de vraies écritures durables.** Le mock de `fsyncSync` laisse passer l'appel réel quand il
   n'injecte pas de panne. Sous Windows, `fsyncSync` est `FlushFileBuffers`, qui attend le disque ; quand les autres
   fichiers de test écrivent en parallèle, son coût est multiplié par 3 à 5 (la tentative 1 du run 38219945584 a vu le
   test de rollback, 5 claims seulement, passer de 0,2 s à 4,0 s).
2. **Les boucles tournent plus que les étapes qu'elles cassent.** Elles comptaient jusqu'à 12 (purge) et 10 (premier
   claim) en dur. Un claim qui purge fait 9 synchronisations sous macOS et Linux mais 4 sous Windows, qui n'en fait
   aucune sur un dossier (`syncDirectory`) ; le premier claim en fait 13 et 6. Sous Windows, 8 itérations sur 12 et 4
   sur 10 rejouaient donc un claim sans aucune panne, en payant toutes leurs écritures. À l'inverse, sous macOS et
   Linux, les étapes 11 à 13 du premier claim (dossier du marqueur, fichier puis dossier de l'empreinte) n'étaient
   jamais cassées, alors que le scénario dit « à n'importe quelle étape ».

## What Changes

- Les deux boucles passent par un même assistant, `expectRecoveryAtEverySyncStep`, qui compte les synchronisations
  d'un claim sans panne depuis le même état, vérifie ce compte (`PRUNING_CLAIM_SYNCS`, `FIRST_CLAIM_SYNCS`, par
  système), puis casse chaque synchronisation une fois et une seule. Chaque itération vérifie que la demande est
  refusée par la panne injectée, ce que l'ancien `catch` vide ne vérifiait pas.
- Le `describe` du fichier reçoit un délai de 20 s, mesuré : 2,4 fois le pire temps observé (8,2 s, avec l'ancienne
  boucle plus lourde). Les tests sont synchrones : vitest ne peut pas les interrompre et ne juge leur durée qu'une fois
  finis, donc ce délai ne masque ni un blocage ni une erreur.

## Capabilities

Aucun contrat ne change, donc `skip_specs: true`. La capacité concernée est `node`, exigence « Panne passagère sans
blocage de l'admission » : ses scénarios `AC: panne passagère pendant la purge` et `AC: panne passagère pendant la
première admission` gardent leurs tests, sous les mêmes titres, et sont mieux couverts.

## Non-goals

- **Pas de `fsyncSync` factice** dans ce test : l'appel réel vérifie aussi que chaque descripteur synchronisé est
  valide, et la durabilité est le sujet de la capacité.
- **Pas de changement de `home.ts`** : le coût vient du test, pas du produit (un claim reste à quelques écritures).
- **Pas le banc de simulation** : T4.25.

## Impact

- `packages/node/test/replay-write-failure.test.ts` seulement.
- Aucune dépendance, aucun schéma, aucun contrat.
