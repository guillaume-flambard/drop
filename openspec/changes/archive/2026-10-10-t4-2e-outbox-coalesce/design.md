## Decisions

- **Liste fermée.** `lan_key`, `iroh_addr`, `team_roster` et `catalog` décrivent un état complet que le suivant remplace. Aucun autre type n'est fusionné : une demande, une décision ou un résultat garde sa place.
- **Clé de fusion.** Destinataire et type. À l'insertion, un message plus ancien de même clé est retiré ; si un plus récent est déjà là, le message entrant est abandonné. Le numéro d'ordre (`order`, croissant à chaque envoi) décide, ce qui couvre un envoi raté remis en file pendant qu'un plus récent attendait.
- **Dernier envoi connu (revue adverse).** Le numéro d'ordre est pris avant tout délai, et le dernier numéro envoyé à chaque pair pour chaque type est retenu, que le message soit livré directement ou mis en file. Un message plus ancien est abandonné à la remise en file et sauté au vidage : un ancien ne part jamais après un plus récent déjà livré.
- **Annonces qui se chevauchent.** Une annonce d'adresse s'arrête dès qu'une plus récente a commencé.
- **Réannonce au retour du relais.** Clé et adresse sont réannoncées à la reconnexion, quand le réseau local ou iroh est actif ; fusionnées dans la file, elles ne coûtent rien si le relais oscille. Le daemon n'a pas de test dédié pour ce branchement.
- **`catalog_request` non fusionné.** Proposé par la revue, il cassait les tests de bornes mémoire qui remplissent la file avec ; le gain est faible, il reste hors de la liste.
- **Ordre conservé.** Le message gardé reste à sa place selon son numéro d'ordre.
