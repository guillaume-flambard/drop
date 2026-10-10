## Why

T4.0 : à la demande explicite de Guillaume (« lance P0 »), après le grilling du 10 octobre 2026 consigné en D47 à D58. La cible a changé : propriétaire possiblement non technique, échelle des échanges en cinq niveaux, contexte partagé décentralisé, trois modes de connexion, simulation outillée. Les documents actuels se contredisent (vision, PRODUCT.md, site, recherche) et aucun ne joue clairement le rôle de PRD, TRD, parcours, UX/UI, schéma backend ou plan.

## What Changes

Créer `docs/product/` avec six documents descriptifs : PRD, TRD, APP_FLOW, UX_UI, BACKEND_SCHEMA, IMPLEMENTATION_PLAN. Chacun distingue ce qui existe (avec preuve et chemin) de ce qui est visé (avec la tâche T4.* qui le livrera) et des hypothèses non validées (avec leur critère). Ajouter les lignes T4.0 à T4.13 à l'index et les décisions D47 à D58.

## Capabilities

Aucun changement de contrat logiciel ; `skip_specs: true`. Les specs restent la seule source normative et ne sont pas modifiées ici : leur mise en vérité est T4.0a.

## Non-goals

- Pas de code, pas de dépendance ajoutée (iroh et React Flow restent candidats, D53 et D56).
- Pas de réécriture de la vision, de PRODUCT.md, du README, du guide, du site ni des specs : c'est T4.0a.
- Pas de nom produit (D57), pas de tarif, pas de publication.
- Ne touche pas au périmètre de la série T3 (T3.1b à T3.8), qui garde son ordre.

## Impact

Documentation seulement. Les nouveaux documents renvoient aux specs et à `docs/TASKS.md` au lieu de les dupliquer (D58).
