# Tasks : le test d'écriture anti-rejeu tient sous Windows chargé

Aucune logique de produit n'est touchée. Les tests gardent leurs titres ; les deux scénarios couverts gardent leurs
marqueurs `openspec-guard`.

## 1. Cause

- [x] 1.1 Relever les durées du fichier sur les runs Windows en échec (38215254464 et 38219945584, tentative 1) et
      sur neuf runs Windows verts du même jour. **Vérification** : tableau de proposal.md.
- [x] 1.2 Compter les synchronisations de chaque claim cassé, par étape, avec un mock compteur. **Vérification** :
      9 et 13 sous macOS, chaque étape de 1 à 9 et de 1 à 13 refuse la demande ; 10 à 12 de la purge n'injectent rien.

## 2. Test

- [x] 2.1 `expectRecoveryAtEverySyncStep` : compte de référence, vérification du compte par système, une panne par
      étape, refus exigé, admission rétablie. **Vérification** : le fichier passe en local.
- [x] 2.2 Mutations dans `home.ts` (rollback retiré, `fsyncSync` du marqueur retiré). **Vérification** : les deux
      tests de boucle échouent dans les deux cas.
- [x] 2.3 Délai de 20 s sur le `describe`. **Vérification** : `pnpm -r typecheck` accepte la signature.

## 3. Preuve sous charge

- [x] 3.1 Suite complète répétée en local, et runs `test-windows` répétés sur la PR. **Vérification** : aucun échec
      du fichier. Fait le 12 octobre 2026 : 6 suites complètes sur 6 en local (macOS), purge en 2,3 à 2,7 s et
      premier claim en 1,7 à 2,1 s sur les 5 runs chronométrés ; 5 runs `test-windows` sur 5 (run 38226733100, tentatives 1 à 5) :

      | Tentative | Purge | Premier claim | Fichier |
      | --- | --- | --- | --- |
      | 1 | 3,4 s | 4,9 s | 8,7 s |
      | 2 | 0,55 s | 0,47 s | 1,1 s |
      | 3 | 0,63 s | 0,64 s | 1,4 s |
      | 4 | 0,75 s | 0,73 s | 1,7 s |
      | 5 | 2,4 s | 1,8 s | 4,7 s |

      Les tentatives 1 et 5 sont des runners lents (0,5 à 0,7 s par itération) : à ce rythme, l'ancienne boucle de
      12 itérations aurait pris 5,8 à 8,2 s (estimation), au-delà des 5 s. Les comptes Windows (4 et 6) sont
      vérifiés par ces runs, puisque le test les exige.
