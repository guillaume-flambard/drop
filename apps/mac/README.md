# drop pour macOS

L'app de la barre de menus (T2.4, D30) : une coquille Tauri autour du Node, qui sert lui-même le panneau.

## Construire

```sh
node scripts/build-mac.ts --debug                        # pour essayer, sans signature
node scripts/build-mac.ts --sign "Developer ID Application: …"
```

Une construction sans `--updates` ne cherche jamais de mise à jour.

## Mises à jour signées (D70)

Une seule fois, sur le Mac qui publie :

1. `npx --yes @tauri-apps/cli@2.12.1 signer generate -w ~/.tauri/drop-updater.key`, avec un mot de passe.
   La clé privée ne quitte pas ce Mac (et sa sauvegarde) : la perdre empêche toute mise à jour des apps installées.
2. Copier `~/.tauri/drop-updater.key.pub` dans `apps/mac/updater.pub` et le committer. C'est la clé publique, elle
   est faite pour être partagée.

À chaque version :

1. Monter `version` dans `apps/mac/src-tauri/tauri.conf.json` (semver, toujours croissante).
2. Construire :
   ```sh
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/drop-updater.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"
   node scripts/build-mac.ts --sign "Developer ID Application: …" --updates --notes "Ce qui change"
   ```
3. Publier le contenu de `dist/updates/` sous `https://drop.memolabs.dev/updates/` : l'archive d'abord,
   `latest.json` ensuite, pour qu'aucune app ne voie une version dont l'archive manque.

Les apps installées vérifient au lancement puis toutes les 6 h, et proposent « Mettre à jour vers x.y.z » dans le
menu de l'icône. Les erreurs de l'app (`E_UPDATE_CHECK`, `E_UPDATE_INSTALL`) vont dans `~/.drop/app.log`.
