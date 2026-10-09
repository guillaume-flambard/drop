# Design

## Context

Voir `proposal.md`. `NodeEngine.executing` contient l'entrée, la configuration et les outils de chaque demande reçue, y compris après émission de l'issue. `outbound` conserve sans limite l'historique du demandeur. Le marqueur anti-rejeu durable de T3.1b est distinct de ces deux cartes mémoire.

## Goals / Non-Goals

**Goals:** mémoire bornée pour les cartes, files et caches du cycle de demande, sans éviction d'accord actif ni rejeu, saturation visible à l'appelant, conservation des reçus existants.

**Non-Goals:** refondre les marqueurs disque, garantir un historique après redémarrage ou terminer les politiques d'expiration et de financement de T3.1d.

## Decisions

1. `executing` ne contient que les demandes actives (1 024 au maximum). Après envoi de l'issue et tentative de reçu, l'entrée complète est retirée. Les refus terminés peuvent laisser un résumé minimal `(dropId, requester, error, expiry)` dans une carte de 1 024 entrées, purgée à l'expiration UUIDv7. En l'absence de résumé, le marqueur disque refuse toujours le doublon avec `E_DENIED`. Cette séparation évite de garder les données du propriétaire uniquement pour le confort du doublon.
2. L'admission disque précède le contrôle de capacité active, afin que chaque identifiant reçu soit consommé une fois. Si les 1 024 places sont occupées, `E_RATE` est envoyé avant accord. Le demandeur doit créer un nouvel identifiant pour réessayer. La carte des demandes actives n'est jamais purgée par ancienneté pendant une exécution.
3. `outbound` conserve au plus 1 024 entrées. Avant une nouvelle émission, il évince les plus anciennes issues connues, puis refuse si seules des demandes actives occupent le plafond. La limite est vérifiée avant toute frappe de financement. `/drops` et `/ask` traduisent cette saturation en HTTP 429 avec `E_RATE` ; `/ask` signale les demandes éventuellement déjà émises si le plafond est rencontré en cours de fan-out.
4. Les bornes sont des constantes du Node, pas des paramètres d'environnement, pour rendre le comportement stable et testable. Le marqueur durable demeure la source de vérité anti-rejeu.
5. `inbox` refuse les cartes supplémentaires à 1 024 et les expirations abusivement lointaines. `outbox` garde 1 024 enveloppes au maximum : une enveloppe expirée est retirée en premier ; si toutes sont encore valides, la plus ancienne est abandonnée avec un diagnostic stable. La file était déjà volatile et chaque enveloppe a une durée maximale de 15 minutes ; le guide expose cette limite.
6. Une exception de transport est enregistrée et traitée comme une panne hors ligne, de sorte qu'un statut ne laisse pas une exécution bloquée dans un état intermédiaire. Le `drop_request` initial n'est jamais mis dans la file volatile : un refus explicite `E_RATE`/`E_QUEUE_FULL`, une panne hors ligne ou une exception de préparation de l'enveloppe retire l'entrée demandeur et libère la clé plafonnée. Les deux premiers cas remontent 429, une enveloppe trop grande remonte 413. Les autres messages peuvent attendre la reconnexion. Un refus de quota pendant `flushOutbox` reste en file et est journalisé jusqu'à expiration.
7. `ReplayCache` a un plafond fixe de 65 536 identifiants. À saturation il refuse fermé sans évincer un identifiant encore valide. Le constructeur accepte un plafond inférieur uniquement pour les tests ; cette borne est indépendante des marqueurs persistants des Drop.

## Risks / Trade-offs

- Historique du panneau tronqué → limite documentée, reçus locaux inchangés.
- Un travail bloqué peut occuper une place active indéfiniment → refus explicite et diagnostic ; l'annulation sûre d'un runner lent demande un contrat séparé.
- Une erreur de transmission du résultat peut empêcher le demandeur de voir l'issue → le marqueur reste consommé ; le processus ne réexécute jamais la demande et garde les reçus quand leur écriture a réussi.
- Beaucoup de demandes émises hors ligne peuvent remplir la mémoire active → refus 429 plutôt qu'épuisement mémoire.
- Une file hors ligne saturée peut perdre une ancienne enveloppe → diagnostic local et expiration documentée ; les garanties de livraison durable restent hors de cette change.

## Migration Plan

Aucune migration de fichier : les cartes mémoire sont vides au démarrage. Après mise à jour, l'historique visible peut contenir moins de demandes ; les reçus locaux restent disponibles. Retour arrière par remplacement du binaire, sans suppression des marqueurs T3.1b.
