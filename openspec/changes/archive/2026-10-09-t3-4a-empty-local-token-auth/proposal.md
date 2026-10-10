# Proposal

## Why

T3.4a corrige une violation confirmée du contrat d’authentification locale : si `DROP_HOME/local-token` est vide, le Node autonome sert l’API et une requête sans jeton reçoit HTTP 200. Cette situation peut suivre une corruption ou une restauration incomplète de l’état local ; elle doit échouer sans ouvrir de port authentifié par une valeur vide.

## What Changes

- Refuser le démarrage de `drop serve` si le fichier du jeton est absent, vide ou réduit à des espaces, avec un code stable sans révéler le jeton.
- Refuser toute comparaison avec un jeton attendu ou présenté vide, y compris pour l’UI et son flux SSE.
- Capturer le jeton valide une seule fois avant d’ouvrir le relais et l’API, et le réutiliser pour les URLs locales.
- Ajouter les régressions du fichier vide, de l’en-tête vide, de l’URL sans jeton et du parcours valide.

## Capabilities

### New Capabilities

Aucune.

### Modified Capabilities

- `node` : préciser le refus du démarrage avec un jeton local absent ou vide et le refus de toute présentation vide sur l’API locale.

## Non-goals

Cette change ne qualifie pas l’app Mac distribuable de T3.4, ne modifie pas le consentement et ne réalise pas la preuve privée d’ensemble de T3.5. Elle ne remplace pas les contrôles de `Host` ni les exceptions explicitement publiques comme la carte A2A et la sonde de santé de la coque.

## Impact

`packages/node/src/home.ts`, `daemon.ts`, `api.ts` et les tests Node. Aucun nouveau fournisseur, protocole ou dépendance.
