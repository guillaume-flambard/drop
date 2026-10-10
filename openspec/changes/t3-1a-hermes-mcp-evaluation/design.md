# Design

## Context

Hermes documente mcp_servers.command/args/env et un filtre tools.include. Drop expose déjà MCP stdio, parle à une API loopback authentifiée et transporte ses demandes vers le propriétaire. Le protocole agent admet other, pas hermes : la recette utilisera DROP_AGENT=other sans changement de schéma. Aucun serveur Ollama ne répond sur le Mac au début de l’évaluation.

## Goals / Non-Goals

AC-HERMES-01 : exercer le client Hermes amont réel, accord/refus/expiration, sans remplacer le consentement.
AC-HERMES-02 : expliciter le fournisseur et observer le réseau ; documenter tout écart, sans annoncer une compatibilité privée non prouvée. Un endpoint modèle simulé peut vérifier le transport mais ne qualifie pas un vrai modèle.
AC-HERMES-03 : conclure intégrer/adapter/différer, coût et retrait ; aucun accès runner supplémentaire ni auto-détection.

## Decisions

- Code amont épinglé dans un environnement jetable ; ne pas lire ~/.hermes, credentials ou mémoire personnelle. Préparation des dépendances avant exécution coupée d’Internet.
- Deux Nodes et relais internes ; commande MCP absolue, DROP_HOME de test, trois outils bornés : list_capabilities, request_drop, get_drop_result.
- Tests déterministes de raccordement sans coût modèle, puis boucle agent avec endpoint interne si disponible. Rapporter séparément ce qui est prouvé et ce qui manque ; pas de téléchargement implicite de poids.
- Le modèle et les outils éventuels Hermes sont hors frontière runner Drop. Aucune shell/Web/navigation à accorder pour cette évaluation. Les fixtures ne contiennent aucune donnée personnelle.
- Garder les preuves de versions, événements, destinations et décisions, pas les prompts ou réponses personnelles. Le retrait supprime uniquement les profils de test.

## Risks / Trade-offs

- Amont complexe ou changeant (moyen) : pin de commit, comparaison des API réellement utilisées, aucun ajout au runtime Drop.
- Sorties réseau implicites (élevé jusqu’à vérification) : conteneur réseau none, capture, configuration explicite ; écart documenté si impossible.
- Faux succès via faux client (élevé) : utiliser le vrai module MCP Hermes, enregistrer le point d’entrée et distinguer appel scripté/boucle LLM.
- Échec ou attente infinie (moyen) : timeout borné, arrêt des enfants, dossiers temporaires.

## Migration Plan

Aucune migration utilisateur. Installation manuelle de test seulement ; configuration exemple à copier dans un profil isolé. Nettoyage des processus et instructions de suppression du profil, conservation des preuves expurgées.

## Couverture

Applicables : intégration, auth/consentement, erreurs/refus/expiration/panne, isolation, réseau hors ligne, sortie contrôlée, versions/licences, logs expurgés, packaging de preuve, reproductibilité, nettoyage et docs. UI/accessibilité, migrations utilisateur, performances modèle, cache et métriques production : sans changement et hors de cette évaluation ; qualification modèle et parcours UI dans T3.2 à T3.5.
