## Why

T4.1 : simulation technique minimale (D56, IMPLEMENTATION_PLAN). Avant d'inviter de vraies personnes (T4.6), drop doit tenir une petite entreprise fictive de 50 nœuds sur le Mac, et ses coûts doivent être mesurés : aucune mesure de mémoire ni de latence n'existe aujourd'hui (TRD, BACKEND_SCHEMA).

## What Changes

- Nouveau paquet `packages/simulation` : un banc qui crée un dossier de campagne temporaire, démarre un relais dédié sur 127.0.0.1, initialise N nœuds en profil privé (processus `drop serve` séparés), publie sur chacun la capacité déterministe `production.error_summary` sur un journal factice, sépare propriétaires et demandeurs et appaire chaque demandeur à un propriétaire, puis joue une charge réglable.
- Les faux agents passent par l'API locale de chaque nœud (comme le connecteur MCP) ; les propriétaires décident par une politique déterministe et réglable (autoriser, refuser, reporter), via l'API du panneau.
- Mesures : mémoire résidente de chaque processus échantillonnée, latence de bout en bout par demande, erreurs par code, fuites (aucun fragment du journal factice ne doit apparaître chez un demandeur).
- Sorties : `events.jsonl` (un événement par étape, format réutilisé par la carte de T4.7) et un rapport `report.json` plus `report.md`.
- CLI : `node packages/simulation/src/cli.ts run --nodes 50 --duration 180 --seed 1`.

## Capabilities

### New Capabilities

- `simulation` : banc local, isolation, charge déterministe, mesures, événements et rapport.

## Non-goals

- Pas de nœuds virtuels regroupés dans un processus, pas de 500 nœuds, pas de personnages, pas de modèle, pas de carte interactive, pas de Langfuse, pas de boucle d'amélioration : c'est T4.7.
- Pas d'iroh ni de mDNS (T4.2) : la simulation passe par le relais WebSocket existant.
- Aucune exécution sur le VPS ni contre `drop.memolabs.dev` ; aucune dépendance nouvelle.
- Ne modifie ni le protocole ni le relais. Seule exception au Node, nécessaire à l’isolation : `notify.ts` respecte `DROP_NOTIFY=off`, que le banc impose (la première campagne envoyait une notification macOS par demande). Tout autre défaut devient une ligne `todo`.

## Impact

Nouveau paquet de test et de mesure, hors du produit livré (pas dans le bundle ni l'app Mac). Lit le code des paquets existants sans le modifier.
