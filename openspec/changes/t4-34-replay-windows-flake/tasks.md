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

- [ ] 3.1 Suite complète répétée en local, et runs `test-windows` répétés sur la PR. **Vérification** : aucun échec
      du fichier ; durées relevées ici.
