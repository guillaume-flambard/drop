# Design : le test d'écriture anti-rejeu tient sous Windows chargé

## Context

Voir proposal.md pour les mesures. Comptes de synchronisations relevés en local (macOS) avec un mock qui compte les
appels, et déduits du code pour Windows, où `syncDirectory` rend la main sans rien faire :

| Claim | Étapes | macOS, Linux | Windows |
| --- | --- | --- | --- |
| purge (deux marqueurs expirés) | horloge, empreinte, dossier purgé, marqueur, empreinte | 9 | 4 |
| premier claim d'un home neuf | journal, horloge, empreinte, version, retrait du journal, marqueur, empreinte | 13 | 6 |

## Decisions

### Compter les étapes au lieu de les fixer en dur

L'assistant fait d'abord un claim sans panne depuis le même état et lit le nombre d'appels à `fsyncSync`. Il compare
ce nombre à la constante du système, puis boucle exactement sur ce nombre.

- Sous Windows, 22 itérations deviennent 12 (référence comprise) ; sous macOS et Linux, 22 deviennent 24, parce que
  le premier claim est enfin cassé à ses 13 étapes.
- La constante protège contre une régression de durabilité : si un `fsyncSync` disparaît de `home.ts`, le compte
  baisse et le test échoue (vérifié par mutation : « expected 8 to be 9 »).
- Chaque itération exige `toThrow('injected fsync failure')` : une étape où la panne ne refuserait pas la demande,
  ou ne serait jamais atteinte, échoue au lieu de passer en silence.

### Un délai à la mesure du test

20 s pour tout le fichier (`describe(..., { timeout })`, API de vitest 5.0.3, `SuiteOptions extends TestOptions`) :

- pire temps observé : 8,2 s pour l'ancienne boucle de purge, 4,0 s pour le test de rollback, sous Windows chargé ;
- la nouvelle boucle de purge fait 5 claims cassés ou de référence sous Windows au lieu de 12, le premier claim 7 au
  lieu de 10 ;
- vitest 5.0.3 (`withTimeout`, `dist/chunks/run.*.js`) ne peut pas interrompre une fonction synchrone : il vérifie
  `deadline.exceeded()` après coup (issue vitest #2920). Le délai ne protège donc rien d'autre que la durée ; il ne
  cache ni une erreur ni un blocage.

### Choix écartés

- **Remplacer le `fsyncSync` réel par un compteur** : plus rapide, mais le test ne vérifierait plus que chaque appel
  porte sur un descripteur ouvert, et il ne s'exécuterait plus dans les conditions réelles du disque.
- **Monter seulement le délai** : laisserait sous Windows 12 itérations sans panne, et sous macOS et Linux trois
  étapes jamais cassées.
- **Réduire la concurrence de vitest pour ce fichier** : ralentit toute la suite pour un test dont la durée n'est pas
  le sujet.

## Risks / Trade-offs

- **Comptes Windows déduits, pas mesurés en local** : aucun poste Windows ici. Les 5 runs `test-windows` de la PR
  les ont vérifiés (le test échoue si le compte diffère).
- **Le délai reste nécessaire** : à la tentative 1, le premier claim a pris 4,9 s avec ses 7 claims cassés ou de
  référence, à 0,1 s du délai par défaut.
- **Un runner encore plus lent** que le pire observé pourrait dépasser 20 s : ce serait un temps 10 fois supérieur à
  la médiane Windows. Si cela arrive, le message de vitest donnera la durée réelle.
