# Design : le test de signal du banc tient sous charge

## Context

Voir proposal.md pour les mesures. Le relevé venait d'une instrumentation temporaire du test (non commitée) qui
horodatait chaque morceau de la sortie d'erreur du banc dans un fichier.

## Decisions

### Moins de démarrages à froid plutôt qu'un seul délai plus long

Le coût dominant est le nombre de processus Node.js lancés avant la phase de charge. Avec trois nœuds : le banc, 3
`init`, 1 `publish`, puis le relais et 3 `serve`, soit 9 démarrages, dont 5 en série. Avec deux nœuds : 7, dont 4 en
série, et un appairage de moins. Ce que le test protège ne dépend pas du nombre de nœuds : `stopAll` parcourt la liste
des enfants sans distinction, et le relais, un propriétaire et un demandeur sont tous présents.

### Un délai au moins égal à celui du banc

Le banc juge lui-même ses phases : 30 s par nœud pour servir (attentes en série, donc 60 s au pire pour deux nœuds)
et 30 s par appairage. Le test attend 120 s : 90 s de phases bornées, plus 3 démarrages en série mesurés à environ
7 s chacun sur un processeur saturé. Si une phase dépasse sa borne, le banc sort avec `E_SIM_TIMEOUT` et le test
échoue aussitôt avec ce message. Le délai du test (150 s) laisse 30 s pour l'arrêt (`stopAll` attend 3 s puis envoie
SIGKILL).

### Choix écartés

- **Monter seulement le délai** : garderait le test le plus lourd possible dans une suite déjà chargée, et le message
  trompeur quand le banc meurt tôt.
- **Envoyer SIGTERM dès « all nodes serving »** : plus rapide, mais ce ne serait plus « en pleine campagne » : le
  scénario vise un arrêt pendant la charge, avec des demandes en vol.
- **Réduire la concurrence de vitest** pour ce fichier : ralentirait toute la suite.

## Risks / Trade-offs

- **Un test qui attend plus longtemps avant d'échouer** quand le banc est vraiment bloqué sans sortir : 120 s au lieu
  de 60 s. C'est le cas le plus rare ; les autres échecs sortent maintenant tout de suite.
- **Deux nœuds au lieu de trois** : le cas « plusieurs demandeurs » reste couvert par le test de bout en bout du même
  fichier (trois nœuds, deux demandeurs).
