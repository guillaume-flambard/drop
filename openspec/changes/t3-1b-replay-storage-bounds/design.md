# Design

## Contexte

Le protocole accepte aujourd'hui tout UUID et `received-drops/` conserve chaque identifiant indéfiniment. La limite de débit du relais est attachée à la connexion, que le pair peut renouveler. Les clients Drop intégrés émettent déjà des UUIDv7.

## Décisions

- Le schéma `drop_request` exige UUIDv7 et normalise sa casse en minuscules, sans changer le schéma des anciens messages de résultat ou de reçu.
- La date portée par les 48 premiers bits de l'UUIDv7 est contrôlée à l'admission : au plus 30 minutes dans le passé et 5 minutes dans le futur. Le Node vérifie avant de créer une demande d'accord.
- `received-drops/` ne contient que des marqueurs v7 récents en minuscules, plafonnés à 16 384. Un verrou de dossier exclusif sérialise lecture, purge et admission entre processus partageant `DROP_HOME`. L'accès au marqueur est également exclusif `wx`. Les marqueurs UUIDv7 historiques en majuscules sont renommés en forme canonique ; les doublons de casse fusionnent sans perdre le refus de rejeu. Le verrou porte un propriétaire `pid nonce` ; seul un verrou portant le nonce du processus courant peut être repris automatiquement, car une admission synchrone ne peut être en cours dans ce même processus. Un verrou étranger reste bloquant même ancien : son âge ne prouve pas que le titulaire est mort sur un disque lent. Sa reprise après crash exige l'arrêt vérifié des processus partageant `DROP_HOME`, puis son retrait manuel. Les anciens marqueurs non v7 (UUID v1 à v8, nil et max acceptés par l'ancien `z.uuid()`) sont supprimés lors de la migration, puisque ces demandes sont désormais interdites ; les noms sans forme d'UUID (`.DS_Store`) sont ignorés, un nom de forme UUID qui n'est pas un fichier échoue fermé.
- Doublon d'une demande active : avant tout autre contrôle, le même demandeur reçoit l'état courant tant que l'issue n'est pas partie, l'erreur déjà envoyée si la demande a échoué, sinon `E_DENIED` ; un autre pair reçoit `E_DENIED` sans rien apprendre. Le demandeur garde la première issue enregistrée, sauf qu'un vrai `drop_result` remplace un refus de doublon arrivé avant lui ; un `drop_status` n'annonce jamais une issue. Le financement est libéré une seule fois.
- Une marque persistante d'heure maximale observée est écrite et synchronisée sur disque avant toute purge. Un fichier de version durable est ensuite écrit à la première migration ; sa présence rend la perte ultérieure du fichier d'horloge détectable et bloquante. La fraîcheur utilise le maximum entre cette marque et l'horloge courante ; une marque illisible ou manquante après migration provoque un refus sûr. Une horloge reculée ne peut ainsi rendre une demande ancienne à nouveau fraîche tant que l'état anti-rejeu est restauré comme un ensemble cohérent.
- Le quota du relais est un dictionnaire par `nodeId` authentifié et vit jusqu'à expiration de la fenêtre, même après fermeture de la connexion. Chaque trame après authentification est comptée avant parsing, y compris une enveloppe trop grande ou invalide. Les entrées expirées sont purgées pour borner ce dictionnaire.
- Saturation locale : `drop_error E_RATE`. Identifiant périmé ou futur : `E_EXPIRED`. UUID non v7 : rejet du schéma.

## Risques et migration

Le changement UUIDv7 est incompatible avec les clients tiers UUIDv4 ; ils doivent générer des UUIDv7 avec une horloge fiable. Les marqueurs v4 existants peuvent être supprimés après écriture de la marque horaire. Si le disque est plein, illisible ou corrompu, le Node échoue fermé. Les reçus, clés et identités ne changent pas. Le quota du relais n'est pas durable entre redémarrages du processus, conformément au périmètre v1.

## Vérification

Tests unitaires et d'intégration sur schéma v7, expiration/futur, doublon et redémarrage, purge et retour d'horloge, corruption et saturation, quota après reconnexion. Puis lint, typecheck, suite complète, guard, revue et audit de sécurité.
