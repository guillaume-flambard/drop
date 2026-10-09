# Application Mac : construction, installation et mise à jour

Ce document décrit le canal Mac de T3.4. Il ne vaut pas preuve qu'un paquet publié a été qualifié : seules les vérifications consignées dans la change font foi. L'app fonctionne sans service de mise à jour Memo Labs et sans Node préinstallé ; elle contient son propre runtime Node.

## Construire

Sur un Mac arm64 ou x86_64 avec Node 22+, Rust et Xcode :

```sh
node scripts/build-mac.ts --debug
```

Ce paquet sert aux essais uniquement. Pour une release destinée à un autre Mac, fournir dans l'environnement `APPLE_SIGNING_IDENTITY` avec une identité **Developer ID Application**, puis soit `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`, soit `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Les valeurs ne vont jamais dans le dépôt ni dans un journal. Lancer ensuite :

```sh
node scripts/build-mac.ts --release
```

Le script refuse une release sans ces prérequis, vérifie que le Node embarqué a l'architecture du Mac constructeur, puis exige le passage de `codesign --verify`, `spctl --assess` et `xcrun stapler validate`. Il écrit `drop-build-manifest.json` à côté des paquets avec version, architecture, version de Node et empreintes SHA-256. Une compilation locale ou un manifeste seul ne qualifie pas le paquet : installer le DMG sur un Mac de test sans Node de développement, vérifier le tray, le premier lancement privé, une décision et les liens `drop://` avant distribution.

## Mise à jour facultative

Aucune vérification automatique d'un serveur distant n'a lieu au lancement. L'administrateur ou le propriétaire reçoit le DMG par le canal qu'il choisit, accompagné du manifeste provenant d'une source indépendante et de confiance. Avant l'installation, comparer son SHA-256 à celui du manifeste et vérifier l'app contenue dans le DMG avec `codesign --verify --deep --strict`, `spctl --assess --type execute` et `xcrun stapler validate`. Un paquet dont l'empreinte ou la signature ne correspond pas est rejeté ; garder l'app installée. Hors ligne ou si la mise à jour est refusée, l'app actuelle continue de fonctionner.

Quitter drop avant de remplacer l'app. Faire une sauvegarde **cohérente** du dossier `~/.drop` une fois le daemon arrêté. Installer la nouvelle app dans `/Applications`, puis contrôler le démarrage, le consentement et le raccordement. Conserver l'ancien DMG qualifié et la sauvegarde jusqu'à la recette.

## Retour arrière

Une simple réinstallation de l'ancien `.app` ne suffit pas toujours : les migrations de stockage peuvent rendre l'état local incompatible avec une ancienne version. Suivre [la procédure de persistance et de retour arrière du profil privé](PRIVATE_PROFILE.md), notamment les marqueurs anti-rejeu de T3.1b. Après toute demande reçue par T3.1b, ne pas redémarrer une ancienne version avec la même identité : créer une nouvelle identité et réappairer les pairs. Un instantané avec la même identité n'est admissible que s'il précède toute admission T3.1b et qu'aucune demande n'a été reçue depuis. Tester ce chemin avant toute distribution large.

## Recette manuelle T3.4

1. Installer le DMG qualifié sur un Mac de l'architecture annoncée sans Node installé par le développeur ; noter macOS, architecture et version.
2. Ouvrir depuis la barre de menus ; vérifier l'initialisation privée, les quatre adaptateurs locaux, la décision et la relecture au clavier et avec VoiceOver.
3. Occuper le port configuré, faire échouer le sidecar, mettre en veille puis reprendre ; vérifier l'absence de double daemon, de fuite du jeton et la reprise bornée.
4. Refuser une mise à jour, couper Internet, puis présenter un DMG altéré ; confirmer que l'app actuelle demeure utilisable et que le paquet altéré est refusé.

Consigner les versions, captures et résultats dans `openspec/changes/t3-4-private-mac-app/proof/verification.md`. Sans ces preuves, AC-MAC-01 à 04 restent ouvertes.
