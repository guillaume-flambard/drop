# Application Mac : construction, installation et mise à jour

Ce document décrit le canal Mac de T3.4 : la build notarisée faite sur un Mac, les mises à jour signées et le retour arrière. La sortie d'une version pour les trois systèmes, les paquets construits par GitHub Actions et l'installation par un testeur sont dans [RELEASE](RELEASE.md). `scripts/build-mac.ts` est désormais un alias de `scripts/build-desktop.ts --platform macos`, mêmes options.

Il ne prouve pas qu'un paquet publié est qualifié : seules les vérifications consignées dans la change font foi ([vérification T3.4](../openspec/changes/t3-4-private-mac-app/proof/verification.md)).

L'app contient son propre runtime Node, le programme `drop-iroh` et les deux bundles de drop. Elle fonctionne sans Node installé et sans service Memo Labs.

## État au 11 octobre 2026

- Une build signée et notarisée pour Apple Silicon a été acceptée par Apple le 10 octobre 2026 (`spctl` : `Notarized Developer ID`, ticket agrafé).
- Restent à faire à la main : installer le DMG sur un Mac propre sans Node de développement, tester VoiceOver, publier la matrice macOS et architecture. T3.4 reste `blocked` sur ces recettes.
- Aucune clé de mise à jour n'existe encore (`apps/desktop/updater.pub` est absent). Aucune build distribuée ne cherche donc de mise à jour.

## Construire

Il faut un Mac avec Node 22 ou plus récent, Rust (`cargo`, pour `crates/drop-iroh`) et Xcode. Le script embarque le Node du Mac qui construit : il refuse un Node d'une autre architecture.

Pour essayer, sans signature :

```sh
node scripts/build-mac.ts --debug
```

Ce paquet sert aux essais uniquement. Sans `--release`, le script fait toujours une build de débogage, même avec `--sign`.

Pour une release destinée à un autre Mac, il faut une identité **Developer ID Application** et des justificatifs de notarisation. Le plus simple est un profil du trousseau, enregistré une fois (le mot de passe d'app se saisit au clavier) :

```sh
xcrun notarytool store-credentials drop-notary --apple-id <apple-id> --team-id <team-id>
node scripts/build-mac.ts --release --sign "Developer ID Application: …" --notary-profile drop-notary
```

À la place du profil, l'environnement peut fournir `APPLE_API_ISSUER`, `APPLE_API_KEY` et `APPLE_API_KEY_PATH`, ou `APPLE_ID`, `APPLE_PASSWORD` et `APPLE_TEAM_ID`. L'identité peut aussi venir de `APPLE_SIGNING_IDENTITY`. Ces valeurs ne vont jamais dans le dépôt ni dans un journal.

Le script refuse une release sans ces prérequis. Il signe le Node embarqué et `drop-iroh` pour le runtime renforcé. Avec un profil du trousseau, il soumet lui-même le DMG à `notarytool`, exige le statut `Accepted` et agrafe le ticket au DMG et à l'app. Il exige ensuite `codesign --verify`, `spctl --assess` et `xcrun stapler validate`.

Il copie le DMG dans `dist/desktop/` avec `drop-build-manifest-macos-<arch>.json` : version, architecture, version de Node et empreintes SHA-256. Une build locale ou un manifeste seul ne qualifie pas le paquet.

`--release --unsigned` fait une build optimisée signée ad hoc, sans identité Apple : c'est ce que produit GitHub Actions tant que les secrets Apple manquent (voir RELEASE). macOS en demande l'autorisation à la première ouverture ; ce n'est pas une build à distribuer largement.

## Mises à jour

**Par défaut, aucune.** Une build faite sans `--updates` ne contient pas la configuration du module de mise à jour : l'app ne contacte aucun serveur pour cela.

**Mise à jour à la main.** L'administrateur ou le propriétaire reçoit le DMG par le canal qu'il choisit, avec le manifeste venu d'une source de confiance. Avant d'installer :

1. comparer le SHA-256 du DMG à celui du manifeste ;
2. vérifier l'app du DMG avec `codesign --verify --deep --strict`, `spctl --assess --type execute` et `xcrun stapler validate` ;
3. rejeter un paquet dont l'empreinte ou la signature ne correspond pas, et garder l'app installée.

Ensuite, quitter drop, faire une sauvegarde **cohérente** de `~/.drop` daemon arrêté, installer la nouvelle app dans `/Applications`, puis contrôler le démarrage, le consentement et le raccordement. Garder l'ancien DMG et la sauvegarde jusqu'à la recette.

**Mises à jour signées, en option (D70).** Une build faite avec `--updates` cherche `https://drop.memolabs.dev/updates/latest.json` au lancement puis toutes les 6 h. Elle n'installe qu'une archive signée par la clé de mise à jour de drop, pour la version annoncée. Le menu de l'icône propose alors « Mettre à jour vers x.y.z ». Les erreurs (`E_UPDATE_CHECK`, `E_UPDATE_INSTALL`) vont dans `~/.drop/app.log`. Ce canal contacte un serveur Memo Labs : il ne convient pas à une installation qui refuse toute sortie non choisie.

Pour l'activer, une seule fois, sur le Mac qui publie :

1. `npx --yes @tauri-apps/cli@2.12.1 signer generate -w ~/.tauri/drop-updater.key`, avec un mot de passe. La clé privée ne quitte pas ce Mac et sa sauvegarde : la perdre empêche toute mise à jour des apps installées.
2. Copier `~/.tauri/drop-updater.key.pub` dans `apps/desktop/updater.pub` et le committer. C'est la clé publique.

À chaque version :

1. Monter `version` dans `apps/desktop/src-tauri/tauri.conf.json` (semver, toujours croissante).
2. Construire avec la clé privée dans l'environnement :
   ```sh
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/drop-updater.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"
   node scripts/build-mac.ts --release --sign "Developer ID Application: …" --notary-profile drop-notary --updates --notes "Ce qui change"
   ```
3. Publier le contenu de `dist/updates/` sous `https://drop.memolabs.dev/updates/` : l'archive d'abord, `latest.json` ensuite, pour qu'aucune app ne voie une version dont l'archive manque. Voir [l'exploitation du lab](deploiement-lab.md).

Chaque build publie une seule plateforme, celle du Mac qui construit : `darwin-aarch64` ou `darwin-x86_64` (`scripts/mac-updates.ts`). Seule la build Apple Silicon a été notarisée à ce jour.

## Retour arrière

Réinstaller l'ancien `.app` ne suffit pas toujours : une migration de stockage peut rendre l'état local incompatible avec une ancienne version. Suivre [la persistance et le retour arrière du profil privé](PRIVATE_PROFILE.md), notamment les marqueurs anti-rejeu de T3.1b. Après toute demande reçue sous T3.1b, ne pas redémarrer une ancienne version avec la même identité : créer une nouvelle identité et réappairer les pairs. Un instantané avec la même identité n'est admissible que s'il précède toute admission T3.1b et qu'aucune demande n'a été reçue depuis. Tester ce chemin avant toute distribution large.

## Recette manuelle T3.4

1. Installer le DMG qualifié sur un Mac propre, de l'architecture annoncée, sans Node installé par le développeur ; noter macOS, architecture et version.
2. Ouvrir depuis la barre de menus ; vérifier l'initialisation privée, le raccordement des agents détectés, la décision et la relecture au clavier et avec VoiceOver.
3. Occuper le port configuré, faire échouer le daemon, mettre en veille puis reprendre ; vérifier l'absence de double daemon, de fuite du jeton et la reprise bornée.
4. Couper Internet, puis présenter un DMG altéré ; confirmer que l'app actuelle reste utilisable et que le paquet altéré est refusé.

Consigner les versions, captures et résultats dans `openspec/changes/t3-4-private-mac-app/proof/verification.md`. Sans ces preuves, les critères AC-MAC restent ouverts.
