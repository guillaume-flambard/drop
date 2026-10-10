## Context

Base 6970006, arbre propre. T3.0 a livré la fondation documentaire ; T3.1 à T3.8 sont à faire. Recherche officielle effectuée dans la conversation précédente : Hermes accepte MCP stdio ; AI SDK permet des adaptateurs directs ; LiteLLM propose une passerelle auto-hébergée. Sources conservées en D39.

## Decisions

Hermes est un agent partenaire candidat via MCP, pas une dépendance du cœur. Ajouter T3.1a après le profil privé. Ajouter T3.2a comme évaluation non bloquante des fournisseurs après la preuve privée ; le client OpenAI-compatible actuel reste utilisé pour la première preuve. La règle actuelle `fetch` sans SDK ne change pas : toute adoption future exige une décision explicite.

## Acceptance and verification

AC-DOC-1 : chaque piste a un périmètre, une dépendance, des critères et un statut todo ; T3.1 reste la prochaine priorité runtime. AC-DOC-2 : docs et page indiquent candidat/non livré, absence de connecteur universel et coût API distinct. Vérifier liens, graphe, diff, tests du site et contrôles prescrits ; revue éditoriale. Aucun test ajouté pour du texte.

## Risks

R1 : faire passer une étude pour une intégration livrée ; prévention par statuts et critères futurs. R2 : complexifier le chemin privé ; aucune dépendance des tâches T3.3/T3.5 vers ces évaluations. Les échecs, autorisations, données et migration runtime ne changent pas ; leurs critères futurs sont explicites. Retour arrière par Git ; aucun état externe.
