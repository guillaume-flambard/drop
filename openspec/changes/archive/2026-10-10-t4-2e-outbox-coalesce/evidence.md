# Preuves T4.2e

| Critère | Preuve |
|---|---|
| Les annonces n'évincent pas une demande | Test « outbox coalescing (T4.2e) > keeps one state message per peer and type, so announcements never evict a real request ». Deux pairs absents, trois demandes de catalogue, 1 500 adresses et cinq clés annoncées : la file garde 7 enveloppes (avant : 1 024, demandes évincées). Au retour, le pair répond à la demande et ne connaît que la dernière adresse. |
| Un ancien ne part pas après un plus récent livré | Test « … > never lets an older queued state message overwrite a newer one already delivered live ». |
| Annonces qui se chevauchent | Test « … > stops announcing an address once a newer one is being announced ». |
| Un envoi raté ne remplace pas plus récent | Test « … > never lets an older state message, re-queued after a failed send, replace a newer one ». |

Vérification : lint, typecheck, 62 fichiers et 504 tests, `openspec validate --strict`, openspec-guard.

## Mutation

Sur le code final, 7 protections retirées une à une, 7 tuées : abandon d'un ancien, retrait des anciens en file, marquage du type, clé par destinataire, saut au vidage, mémoire du dernier envoi, arrêt d'une annonce dépassée.

## Revue

Revue adverse indépendante, deux défauts moyens reproduits puis corrigés avec test :
1. Un message récent livré directement ne remplaçait pas l'ancien resté en file, qui partait ensuite. Le dernier envoi par pair et par type est maintenant retenu.
2. Deux annonces d'adresse qui se chevauchaient pouvaient donner le dernier numéro d'ordre à l'adresse périmée. Le numéro est maintenant pris avant tout délai, et une annonce dépassée s'arrête.

Pris aussi : réannonce de la clé et de l'adresse au retour du relais (sans test dédié du daemon). Écarté : fusionner `catalog_request`, qui cassait les tests de bornes mémoire pour un gain faible.

## /cso

Run `1791669505783-c47443d944adea49`, statut `partial` uniquement parce que l'outil ne lit pas les fichiers binaires. Couverture enregistrée dans six domaines, aucun constat : la table du dernier envoi ne prend pour clé que des pairs, des membres d'équipe ou des appairages que le nœud a lui-même choisi de contacter.
