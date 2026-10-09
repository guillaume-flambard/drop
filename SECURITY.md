# Signaler un problème de sécurité

drop est un prototype, sans version stable déclarée ni audit de sécurité complet. Le profil privé cible n'est pas encore livré. Consulter [le bilan](docs/AVANCEMENT.md) avant toute évaluation.

Ne pas publier une vulnérabilité, une clé, une configuration réelle ou des données de client dans une issue ou une pull request. Ne pas tester sur l'infrastructure d'un tiers sans son autorisation.

## Canal privé

Après ouverture publique, utiliser **Security → Report a vulnerability** sur le dépôt GitHub, lorsque ce bouton est disponible. Son activation et son test constituent un préalable obligatoire de T3.6 ; sa disponibilité actuelle n'est pas revendiquée.

Tant que le dépôt reste privé ou si le bouton manque, les collaborateurs doivent contacter le propriétaire par leur canal privé déjà convenu pour obtenir un canal de dépôt sécurisé. Aucun contact public non vérifié n'est inventé ici. Ne pas joindre le détail sensible à une demande publique de contact.

Envoyer une description minimale : version/commit, composant, préconditions, étapes reproductibles sur fixtures synthétiques, impact et éventuelle mitigation. Partager les preuves sensibles seulement après accord sur le canal. Les logs doivent être expurgés.

## Traitement

Le mainteneur accuse réception, reproduit, prépare le correctif et convient de la divulgation. Aucun SLA ni délai de correction garanti à ce stade. Avant la première version publique, désigner le responsable, tester le canal privé et publier les versions réellement prises en charge.

Les frontières à examiner incluent demandes non fiables, consentement, outils autorisés, destinations réseau, modèles, agents A2A joints, sortie et sauvegardes de configuration. Le chiffrement et le scanner ne constituent pas une garantie d'absence de fuite.
