## Why

T4.0a : mise en vérité demandée par Guillaume (« on ne garde jamais de fausses informations », D58). T4.0 a produit `docs/product/` ; la vision, l'architecture, PRODUCT.md, le README, le guide, le raccordement, le bilan, AGENTS.md, le contexte OpenSpec et le site décrivent encore l'ancienne cible ou des faits dépassés (exclusion de la délégation et du contexte partagé, quatre agents au lieu de treize visés, Julie tour à tour dépôt de code et designer, quatre outils MCP au lieu de six, défaut OpenRouter, raccordement « à livrer »).

## What Changes

- Réduire `openspec/project/vision.md` et `openspec/project/architecture.md` à un résumé fidèle qui renvoie au PRD et au TRD.
- Aligner PRODUCT.md, README.md, `docs/GUIDE.md`, `docs/ONBOARDING.md`, `docs/AVANCEMENT.md`, AGENTS.md et `openspec/config.yaml` sur D47 à D58 et sur le code.
- Mettre le site (`site/index.html`, `site/guide.html`, `site/avancement.html`) en accord avec le PRD, sans rien promettre d'invérifiable.
- Modifier la spec `product-foundation` : le positionnement reprend D47, D48 et D52 ; `docs/product/` devient la référence descriptive.

## Capabilities

### Modified Capabilities

- `product-foundation` : positionnement et offre (MODIFIED), documents produit de référence (ADDED).

## Non-goals

- Pas de code : les écarts de code trouvés en T4.0 restent dans T4.14 et T4.15.
- Pas de réécriture des specs de déploiement historiques (`deploy-mac-vps`, relais derrière Caddy) : elles décrivent des fichiers du dépôt toujours présents ; leur sort se décide avec T4.10.
- Pas de nom produit, de tarif ni de publication (D57).
- Ne touche pas aux tâches T3 ni à leurs preuves.

## Impact

Documentation, site local et une spec documentaire. Aucun runtime.
