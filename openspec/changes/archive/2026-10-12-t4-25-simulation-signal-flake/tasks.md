# Tasks : le test de signal du banc tient sous charge

Aucune logique de produit n'est touchée. Le test garde son titre et son marqueur `openspec-guard`.

## 1. Cause

- [x] 1.1 Horodater chaque ligne du banc dans le test (instrumentation temporaire), seul et sous la suite complète.
      **Vérification** : tableau de proposal.md ; l'appairage ne varie pas, les démarrages à froid oui.
- [x] 1.2 Reproduire T3.4 avec trois suites concurrentes. **Vérification** : l'ancien test échoue avec « bench never
      reached the load phase » dans une copie sur trois, et prend 58 s dans une autre.

## 2. Test

- [x] 2.1 Deux nœuds, attente de 120 s, délai de 150 s, sortie du banc détectée, nettoyage, sortie d'erreur
      accumulée. **Vérification** : le test passe seul en 3,8 s.
- [x] 2.2 Mutations : le gestionnaire de signal du banc n'appelle plus `stopAll` ; le banc sort tout de suite
      (`--nodes 81`). **Vérification** : le premier échoue sur un enfant encore vivant, le second en 85 ms avec
      `E_SIM_SIZE` dans le message.

## 3. Preuve sous charge

- [x] 3.1 Suite complète répétée, puis trois suites concurrentes répétées. **Vérification** : le test passe à chaque
      fois. Fait le 12 octobre 2026 : 5 suites complètes sur 5, test en 5,4 à 6,6 s (8,1 à 11,2 s avant) ; 3 tours
      de trois suites concurrentes, 6 copies sur 6, en 14,6 à 28,0 s, contre 23,1 à 35,7 s pour l'ancien test lancé
      en témoin dans la troisième suite de chaque tour.
