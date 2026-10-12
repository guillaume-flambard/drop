# T4.25 : le test de signal du banc tient sous charge

## Why

« AC stops every process it started when the bench receives SIGTERM mid-campaign »
(`packages/simulation/test/campaign.test.ts`) a échoué pendant les gates de T3.4 (12 octobre 2026) : son attente de
60 s de la phase de charge a expiré sous la suite complète en parallèle, alors qu'il passe seul en 12 s.

Mesures du 12 octobre 2026 sur un Mac à 10 cœurs, avec un relevé horodaté de chaque ligne que le banc écrit :

| Charge | Lancement du banc | 3 `init` | relais et nœuds servis | 2 appairages | Total |
| --- | --- | --- | --- | --- | --- |
| test seul (2 runs) | 0,1 s | 0,7 s | 0,7 s | 3,5 s | 4,9 à 5,0 s |
| suite complète (4 runs) | 0,1 à 0,2 s | 2,4 à 4,1 s | 2,0 à 4,0 s | 3,5 s | 8,1 à 11,2 s |
| trois suites en parallèle (charge 78) | 2,6 s | 21,6 s | 27,8 s | 4,1 s | 56,2 s |

Sous trois suites concurrentes (la situation de T3.4, où d'autres sessions tournaient sur le même poste), l'ancien
test a échoué exactement comme en T3.4 (« bench never reached the load phase ») dans l'une des trois copies ; une
autre a passé à 58 s, à 2 s de la limite.

Causes :

1. **Le temps part dans les démarrages à froid de Node.js**, pas dans le protocole. Avant la phase de charge, le banc
   lance l'un après l'autre un `init` par nœud et un `publish` par propriétaire, puis le relais et chaque nœud. Chacun
   recharge tout le graphe de modules TypeScript : 0,25 s au repos, environ 7 s sur un processeur saturé.
   L'appairage, lui, reste à 3,5 à 4,1 s quelle que soit la charge.
2. **Le test abandonne avant le banc.** Le banc s'accorde 30 s par nœud pour servir et 30 s par appairage ; le test
   n'attendait que 60 s au total. Un banc lent mais sain était donc déclaré en échec.
3. **Le test ne voyait pas la sortie du banc.** Si le banc s'arrête tôt (port pris, `E_SIM_TIMEOUT`), le test
   attendait quand même 60 s puis affichait un message trompeur, sans l'erreur du banc. Et après un échec, il laissait
   le banc tourner (et ses processus) tout en supprimant son dossier.

## What Changes

Dans le test seulement :

- **Deux nœuds au lieu de trois** (un propriétaire, un demandeur) : le banc lance encore les trois sortes de processus
  qu'il doit arrêter (relais, propriétaire, demandeur), avec 3 démarrages à froid et 1 appairage de moins. Le test
  exige au moins 3 enfants au lieu de 4.
- **Attente de la phase de charge à 120 s**, plus longue que ce que le banc s'accorde (2 × 30 s pour servir, 30 s
  pour appairer, plus les démarrages mesurés), et délai du test à 150 s.
- **Sortie du banc détectée** : le test échoue aussitôt, avec le code de sortie et la sortie d'erreur du banc.
- **Nettoyage** : après un échec, le test envoie SIGTERM au banc et attend sa sortie avant de supprimer le dossier.
- **Sortie d'erreur accumulée** avant la recherche de « requesters paired », pour qu'un message coupé en deux morceaux
  soit quand même reconnu.

## Capabilities

Aucun contrat ne change, donc `skip_specs: true`. La capacité concernée est `simulation`, scénario
`AC: aucun processus orphelin` : son test garde son titre et son marqueur, et protège la même propriété (après SIGTERM
en pleine campagne, aucun processus lancé par le banc ne survit).

## Non-goals

- **Pas de changement du banc** (`campaign.ts`, `cli.ts`) : lancer les `init` en parallèle ou alléger le démarrage du
  CLI de `drop` accélérerait le banc, mais c'est un changement du produit, hors de cette ligne (et T4.26 touche
  `campaign.ts` en même temps).
- **Pas le test de campagne de bout en bout** du même fichier : 61 s sous trois suites concurrentes, pour un délai de
  120 s ; il n'a pas échoué.
- **Pas les autres tests** qui échouent quand trois suites tournent en même temps (11 dans chaque copie) : cette
  charge dépasse ce que la suite supporte, elle ne sert ici qu'à reproduire T3.4.

## Impact

- `packages/simulation/test/campaign.test.ts` seulement.
- Aucune dépendance, aucun schéma, aucun contrat.
