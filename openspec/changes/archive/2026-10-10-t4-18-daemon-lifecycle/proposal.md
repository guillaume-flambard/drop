## Why

T4.18 : écart trouvé pendant la recette de T4.14. La coque Mac tuée par un signal (et non par « Quitter ») laisse son daemon `drop serve` tourner : un nœud orphelin garde le port local, reste connecté au relais et peut recevoir des demandes sans panneau pour les décider. Au relancement, l'app tombe sur `E_PORT`.

## What Changes

- La coque lance le daemon avec une entrée standard en tube qu'elle garde ouverte, et `DROP_EXIT_WITH_PARENT=stdin`.
- Dans ce mode, `drop serve` surveille son entrée standard : à sa fermeture, ce que le système fait même quand la coque est tuée brutalement, il arrête proprement relais, API et minuteries, puis sort.
- Hors de l'app (CLI, terminal, banc de simulation), rien ne change.

## Capabilities

### Modified Capabilities

- `owner-app` : l'app arrête aussi le daemon quand elle disparaît sans quitter.

## Non-goals

- Pas de superviseur système (launchd) ni de redémarrage automatique du daemon orphelin.
- Pas de changement du cycle de redémarrage existant de la coque.
- Pas de Windows ni de Linux (T3.7, T3.8), même si le mécanisme y est portable.

## Impact

`packages/node` (commande `serve`), `apps/mac` (lancement du daemon), spec `owner-app`.
