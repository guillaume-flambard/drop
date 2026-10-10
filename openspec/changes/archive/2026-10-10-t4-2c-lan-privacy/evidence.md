# Preuves T4.2c

| Critère | Preuve |
|---|---|
| Adresses publiques ignorées | Test « local network (T4.2) > keeps only private addresses from discovery, loopback only when allowed » (inchangé). |
| Annonce tournante | Test « local network privacy (T4.2c) > announces only a rotating tag that paired peers recognize, never the node id ». Ni identifiant ni clé dans l'annonce. Jeton qui change d'une période à l'autre. Pair qui reconnaît, inconnu non. Fenêtre de trois périodes. Table des annonces bornée, plus récentes d'abord, purgée après deux périodes. |
| Invitation reconnue puis oubliée | Test « … > lets the invitee find the inviter through the invite only while it is live ». |
| Clé partagée et privée | Test « … > shares its discovery key with each paired peer and keeps it private on disk ». Clés échangées à l'appairage dans les deux sens, clé plantée par un inconnu ignorée, réannonce au démarrage, `lan-key` et `lan-keys.json` en `0600`. |
| Reprise | Test « … > recovers from a passing refusal with growing delays ». Deux refus puis `on` avec délais croissants. Pas de redémarrages en boucle quand chaque démarrage est suivi d'un refus. Arrêt pendant un nouvel essai ou pendant un démarrage : rien ne reste ouvert. |
| Rien pour un inconnu | Test « … > says nothing to a connection that cannot knock with a key it holds ». Silence, mauvaise frappe, bonjour d'emblée : aucune trame ni raison de fermeture. Avec la bonne clé : `knock_ok` puis `hello`. Un appelant face à un faux pair qui rejoue un jeton n'envoie que sa frappe. |
| Message `lan_key` | Test « local network privacy (T4.2c) > carries a discovery key only as a 32-byte value ». |

Les tests de T4.2 (8) passent avec la nouvelle poignée de main, dont l'échange complet entre deux moteurs réels sans relais.

Recette réelle le 10 octobre 2026, deux `drop serve` sur ce Mac, mDNS réel, relais pointé sur un port vide :
- sur le réseau, les annonces portent `v: 2` et un jeton seulement ;
- hôtes `drop-<hasard>.local`, ni identifiant de nœud ni nom de la machine ;
- appairage en 2 s par le jeton d'invitation (24 s avant la vérification toutes les 5 s) ;
- demande jusqu'à `receipted`, aucune connexion au relais.

Contrôle par mutation : 14 protections retirées une à une, 13 tuées. La survivante, l'acceptation d'une clé seulement venant d'un pair connu, est inatteignable : l'enveloppe d'un inconnu est rejetée avant, elle reste en défense de second rang.

## Revue

Revue adverse et sécurité (sous-agent indépendant), trois critiques, corrigées :
1. Le nœud envoyait son identifiant à toute connexion avant toute preuve. La frappe préalable fait taire le nœud tant qu'elle manque.
2. L'enregistrement SRV portait le nom de la machine. L'hôte est maintenant aléatoire, sans IPv6 globale.
3. La table des annonces vues n'était jamais purgée et se remplissait avec la rotation. Elle est maintenant bornée et purgée, et toutes les correspondances sont essayées.

Corrigés aussi :
- redémarrages en boucle ;
- arrêt pendant un nouvel essai ;
- fenêtre d'horloge ;
- lectures répétées du fichier de clés ;
- fichiers de clés illisibles remplacés en silence ;
- clé nulle de repli ;
- annonce de clé quand le mode local est coupé ;
- commentaire inexact.

Restent (D67) :
- sur un même réseau, port et adresses relient les périodes ;
- la clé part aux pairs présentés par l'équipe ;
- pas de retrait de pair ;
- le module mDNS n'a pas de test automatique (pas de multicast en CI), compensé par la recette réelle.

`/cso` gstack ciblé en mode diff (run `1791652287316-6017303df053601f`) : partiel, car les binaires ne sont pas lus. Un constat faible (port et adresses), aucune faille élevée.

## Vérification

- `pnpm -r lint` et `pnpm -r typecheck` ;
- `pnpm -r test` : 421 tests ;
- `openspec validate --all --strict` ;
- openspec-guard avec sélecteurs.
