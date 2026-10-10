## Context

D56 fixe la simulation sur le Mac, avec un relais dédié, jamais sur le VPS ni sur le relais de production. La mesure de capacité du 10 octobre (docs/research/2026-10-10-repositionnement.md §5) estime 130 à 180 Mo par nœud avec agent ; 50 nœuds tiennent sur le Mac en processus séparés. `scripts/demo-local.sh` montre déjà le cycle réel avec la CLI : init, relais, publication, serve, invite et pair, demande, décision, résultat, reçus.

## Decisions

- **Processus réels.** Chaque nœud est un `drop serve` séparé, lancé par la CLI existante, en profil privé (`init` par défaut), relais sur 127.0.0.1. Ainsi la mesure porte sur le produit, pas sur un double.
- **Capacité sans modèle.** `production.error_summary` sur un journal factice propre à chaque nœud, avec des fragments sensibles connus (adresse, carte, clé) pour vérifier qu'ils ne sortent jamais.
- **Approbateur = propriétaire.** Chaque nœud approuve ses propres demandes ; un « faux propriétaire » interroge `/ui/pending` et décide via `/ui/decide` selon la politique. Le consentement reste celui du produit.
- **Rôles séparés.** Les premiers nœuds sont propriétaires et publient la capacité ; les autres sont demandeurs et s'appairent chacun à un seul propriétaire tiré par la graine. Raison : `POST /drops` choisit la première entrée du catalogue qui porte l'identifiant demandé, sans permettre de désigner le propriétaire ; un demandeur relié à plusieurs propriétaires de la même capacité ne pourrait pas les viser. Ce défaut du produit devient T4.17.
- **Hasard maîtrisé.** Un PRNG à graine (mulberry32) produit le plan complet avant le lancement ; le plan est écrit dans le dossier de campagne.
- **Mémoire.** Échantillon `ps -o rss= -p <pid>` toutes les 5 secondes pour le relais et chaque nœud.
- **Événements.** `{ t, campaign, kind, node, peer?, dropId?, outcome?, ms?, rssKb? }`, une ligne JSON par événement, ordonnée par temps ; kinds : `node_started`, `paired`, `request_sent`, `decision`, `result`, `error`, `sample`, `leak_check`.
- **Pas de seuil imposé.** T4.1 établit la référence ; les seuils de régression viendront de cette mesure.

## Risks / Trade-offs

- Lancer 50 processus Node consomme environ 4 à 9 Go : la CLI affiche l'estimation et refuse au-delà de 80 nœuds en processus séparés (au-delà, c'est T4.7).
- Les ports locaux : plage dédiée choisie par la campagne, vérifiée libre avant le lancement.
- Les tests unitaires couvrent plan, politique et statistiques ; le test de bout en bout tourne à 3 nœuds pour rester rapide ; la campagne de 50 nœuds est une preuve manuelle archivée.
