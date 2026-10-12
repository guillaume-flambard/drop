# Publier l'app de bureau : macOS, Windows et Linux

Ce document décrit comment sortir une version de l'app drop pour les trois systèmes (T3.4, T3.7, T3.8), ce que contient chaque paquet, ce qui est signé et comment un testeur l'installe. Les détails propres au Mac (notarisation depuis un Mac, mises à jour signées, retour arrière, recette T3.4) restent dans [MAC_RELEASE](MAC_RELEASE.md).

Une build réussie en CI ne qualifie pas un paquet : la recette sur de vraies machines reste à faire (voir « Reste à faire »).

## Ce que contient l'app

La même coque Tauri 2 (`apps/desktop/src-tauri`) sert les trois systèmes. Chaque paquet embarque :

- le runtime Node officiel du système et de l'architecture visés (`node`, ou `node.exe` sous Windows) : l'app marche sans Node installé ;
- `drop.mjs` (le Node de drop, interface React comprise) et `drop-mcp.mjs`, produits par `scripts/bundle.ts` ;
- `drop-iroh` (`drop-iroh.exe` sous Windows), compilé pour la cible, placé à côté du Node où celui-ci le cherche, avec ses notices de licence.

Ce qui change d'un système à l'autre vit dans `tauri.macos.conf.json`, `tauri.windows.conf.json` et `tauri.linux.conf.json`, que Tauri fusionne avec `tauri.conf.json` (format des paquets, nom des programmes embarqués). Le nom du produit (`drop`) et l'identifiant (`dev.memolabs.drop`) ne changent pas.

## Construire sur sa machine

Il faut Node 22 ou plus récent, Rust et, selon le système, Xcode (macOS), les outils de build C++ de Visual Studio (Windows) ou les paquets WebKitGTK listés dans la doc Tauri (Linux). Le script embarque le Node qui le lance : il construit donc pour la machine où il tourne, jamais pour une autre.

```sh
node scripts/build-desktop.ts --debug              # essai, n'importe quel système
node scripts/build-desktop.ts --release            # Windows ou Linux
node scripts/build-desktop.ts --release --unsigned # macOS sans identité Apple (signature ad hoc)
```

`node scripts/build-mac.ts` reste un alias de `build-desktop.ts --platform macos`. Les paquets et un manifeste de leurs empreintes SHA-256 arrivent dans `dist/desktop/`.

## Sortir une version

1. Monter `version` dans `apps/desktop/src-tauri/tauri.conf.json` (trois nombres `x.y.z`, une version unique pour les cinq architectures). Faire passer ce changement par une PR, puis la fusionner.
2. Sur le commit fusionné de `main`, créer et pousser le tag :
   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. Le workflow `release desktop` (`.github/workflows/release.yml`) refuse un tag qui ne correspond pas à la version, construit les cinq paquets, ouvre chacun comme le ferait un testeur (test de fumée) puis crée une **release en brouillon** avec les installeurs, `SHA256SUMS.txt` et une attestation de provenance par fichier.
4. Relire le brouillon sur GitHub (Releases), essayer au moins un paquet, puis cliquer « Publish release ». Rien n'est publié sans ce clic.

Pour essayer le circuit sans tag : onglet Actions, « release desktop », « Run workflow ». Le brouillon s'appelle alors `v<version>-ci.<numéro>` et reste une préversion ; le tag n'existe que si quelqu'un publie ce brouillon. Supprimer ces brouillons d'essai une fois relus.

Une PR qui touche la coque, ses scripts de build ou `drop-iroh` lance les mêmes builds et tests de fumée, sans release : les paquets restent 14 jours dans les artefacts du run.

## Les fichiers d'une release

| Fichier                                             | Système                        | Ce que c'est                                                          |
| --------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `drop_<version>_aarch64.dmg`                        | macOS 13 ou plus, Apple Silicon | Image disque avec `drop.app`                                         |
| `drop_<version>_x64.dmg`                            | macOS 13 ou plus, Intel         | Image disque avec `drop.app`                                         |
| `drop_<version>_x64-setup.exe`                      | Windows 10 et 11, x64           | Installeur NSIS, pour l'utilisateur courant, sans droits administrateur |
| `drop_<version>_amd64.AppImage`                     | Linux x64                       | Programme autonome, sans installation                                 |
| `drop_<version>_aarch64.AppImage`                  | Linux arm64                     | Programme autonome ARM64                                          |
| `drop-build-manifest-<système>-<arch>.json`         | tous                            | Version, version de Node, empreintes des programmes embarqués, niveau de signature |
| `SHA256SUMS.txt`                                    | tous                            | Empreinte SHA-256 de chaque fichier                                   |

Vérifier un fichier téléchargé :

```sh
sha256sum -c SHA256SUMS.txt --ignore-missing           # Linux ; macOS : shasum -a 256 -c
gh attestation verify drop_0.2.0_amd64.AppImage -R memolabs-dev/drop
```

Sous Windows : `Get-FileHash .\drop_0.2.0_x64-setup.exe` puis comparer avec la ligne de `SHA256SUMS.txt`.

## Signature, par système

| Système | Sans secret (état actuel)                                                                 | Avec les secrets                                    |
| ------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| macOS   | Signature ad hoc, non notarisée : macOS demande une autorisation à la première ouverture | Developer ID et notarisation Apple, ticket agrafé   |
| Windows | Non signé : SmartScreen avertit au premier lancement                                       | Installeurs et `drop-desktop.exe` signés Authenticode |
| Linux   | Non signé, comme la plupart des AppImage hors dépôt                           | Sans objet                                          |

Dans tous les cas, `SHA256SUMS.txt` et les attestations de provenance (signées par GitHub, Sigstore) prouvent que le fichier sort de ce dépôt et de ce workflow.

La build notarisée faite sur le Mac de Guillaume (MAC_RELEASE) reste possible et prioritaire tant que les secrets Apple ne sont pas dans GitHub.

### Secrets à ajouter (Settings, Secrets and variables, Actions)

macOS, signature et notarisation (les six sont requis, sinon la build reste ad hoc) :

| Secret                        | Contenu                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`           | Le certificat « Developer ID Application » exporté en `.p12`, encodé en base64 (`base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD`  | Le mot de passe choisi à l'export du `.p12`                                                  |
| `APPLE_SIGNING_IDENTITY`      | Le nom exact de l'identité, par exemple `Developer ID Application: Guillaume Flambard (Q52VN4UT34)` |
| `APPLE_API_ISSUER`            | L'« Issuer ID » affiché dans App Store Connect, Users and Access, Integrations, Keys          |
| `APPLE_API_KEY`               | Le « Key ID » de la clé API créée au même endroit (rôle Developer suffit)                     |
| `APPLE_API_PRIVATE_KEY`       | Le contenu du fichier `AuthKey_<KeyID>.p8` téléchargé à la création de la clé               |

Le trousseau temporaire de la CI reçoit un mot de passe aléatoire à chaque run : pas de secret à prévoir pour lui.

Windows, signature Authenticode (les deux sont requis) :

| Secret                          | Contenu                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `WINDOWS_CERTIFICATE`           | Le certificat de signature de code en `.pfx`, encodé en base64 |
| `WINDOWS_CERTIFICATE_PASSWORD`  | Le mot de passe du `.pfx`                                 |

Le serveur d'horodatage par défaut est `http://timestamp.digicert.com` (`WINDOWS_TIMESTAMP_URL` le change). Un certificat neuf, même signé, garde un avertissement SmartScreen jusqu'à ce qu'il gagne une réputation ; depuis 2024 un certificat EV n'y échappe plus non plus (doc Tauri). Les certificats délivrés après juin 2023 vivent sur un module matériel ou dans un service en ligne (Azure Artifact Signing, par exemple) : il faudra alors passer par `signCommand` au lieu d'un `.pfx`. Même signé, `drop-iroh.exe` ne l'est pas encore (reste à faire).

## Mises à jour signées multiplateformes (canal stable)

Le code du client Updater est présent dans la coque Tauri. Une application ne l'active que si elle est
construite avec `--updates`. Le contrôle de version est automatique au démarrage et toutes les
six heures. Quand une nouvelle version signée est détectée, l'app garde l'option manuelle dans
le menu, mais peut également **l'installer seule après cinq minutes d'inactivité confirmée** :
aucun panneau ou espace de travail ouvert, aucune demande entrante en attente, aucune exécution,
aucun message en file d'envoi et aucune demande sortante non terminée. Le Node expose ce verdict
par `GET /_shell/update-ready`, réservé à la coque locale authentifiée. Si une vérification échoue,
l'installation attend ; la détection continue périodiquement. Sur Windows le mode
`passive` montre une courte fenêtre de progression. Le processus est redémarré après remplacement.

L'archive est d'abord téléchargée et **vérifiée cryptographiquement**, sans modifier Drop.
Juste avant son installation, l'app recontrôle toutes les conditions d'inactivité ;
si une demande ou une fenêtre est apparue pendant le téléchargement, elle conserve la
mise à jour en attente et recommence une période de calme avant un nouvel essai.
Une installation demandée manuellement est également reportée si le moteur travaille.

Cette vérification protège les cas d'activité connus **mais ne constitue pas un verrou atomique** :
une nouvelle demande peut théoriquement arriver entre le dernier contrôle d'inactivité et
l'installation. Le test réel de montée de version et les essais en concurrence restent des
prérequis avant de promettre une mise à jour sans interruption. L'app ne modifie pas d'office
l'identité, les permissions ou le stockage anti-rejeu du Node.

La signature Tauri est obligatoire, indépendante de la notarisation Apple et de la signature Authenticode.
Ne jamais ajouter la clé privée, son mot de passe, ni un fichier `.key` au dépôt.

1. Générer une paire de clés Tauri, une seule fois sur une machine de confiance :
   `npx --yes @tauri-apps/cli@2.12.1 signer generate -w ~/.tauri/drop-updater.key`.
   Saisir un mot de passe fort, conserver une sauvegarde sûre du fichier privé et du mot de passe.
2. Ajouter uniquement le contenu de `~/.tauri/drop-updater.key.pub` dans
   `apps/desktop/updater.pub`, et le committer. Ne jamais changer cette clé publique pour les
   installations déjà distribuées sans organiser une transition : elles refuseraient les mises à jour.
3. Dans les secrets GitHub Actions de **ce dépôt uniquement**, ajouter
   `TAURI_SIGNING_PRIVATE_KEY` (contenu du fichier privé) et
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Le workflow `release desktop`, sur un tag `vX.Y.Z`, produit cinq archives signées :
   deux pour macOS (`.app.tar.gz`), une NSIS Windows (`.exe`) et deux AppImage Linux.
   Les entrées du manifeste portent les cibles standards reconnues par le client Tauri
   (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, `linux-x86_64`,
   `linux-aarch64`). Sans un `target()` personnalisé dans le client Rust, des suffixes
   `-nsis` ou `-appimage` empêcheraient toute détection de mise à jour.
   Le canal n'est qualifié que pour les installations **NSIS** et **AppImage** :
   seuls NSIS et AppImage sont construits pour éviter tout changement implicite
   de format d'installation. Les paquets MSI et Debian nécessiteraient une
   filière administrée dédiée, distincte des releases auto-updatables.
   Chaque build produit un fragment avec signature liée à la version ; le job de publication exige
   cinq fragments distincts, identiques en version, et une URL d'archive dans **ce dépôt**.
   Il ajoute `latest.json` et les archives signées à la **release GitHub en brouillon**.
5. Après les tests manuels, **publier la release stable sur GitHub**. Quand la recette
   N → N+1 est validée sur de vraies machines, définir la variable de dépôt Actions
   `DROP_RELEASE_AUTO_PUBLISH=true` pour activer la publication **automatique**
   des futures releases stables déclenchées par un tag protégé `vX.Y.Z`, mais **jamais**
   celles des exécutions manuelles de test. Laisser la variable absente ou `false`
   tant que la première mise à jour réelle n'a pas été qualifiée. Les builds Drop déjà équipées
   de l'Updater interrogent alors
   `https://github.com/memolabs-dev/drop/releases/latest/download/latest.json`.
   Les artefacts sont téléchargés directement depuis la release correspondante, sous signature
   Tauri. Une release en brouillon, ou marquée prerelease, n'est pas le canal stable.

Pour les essais avec mise à jour via l'app, installer **NSIS** sous Windows et **AppImage** sous Linux. Les releases ne génèrent pas de MSI ou de Debian : cela évite de déclencher l'installation silencieuse d'un format différent depuis ces canaux. Une filière de déploiement administré distincte pourra être créée plus tard.

Aucune mise à jour ne sera proposée aux installations existantes construites **sans** `--updates`.
Pour elles, une réinstallation manuelle unique est nécessaire avant d'activer les mises à jour.
Les builds de PR exercent le **vrai chemin Tauri de signature des paquets**, avec une paire de
clés **éphémère différente pour chaque runner**. Elles vérifient qu’une archive signée et un
fragment de manifeste existent, mais **ces builds ne sont pas distribuables comme applications
auto-updatables** : leur clé publique temporaire ne correspond pas à la clé des releases.
N'envoyer aux amis que des builds produites par une release avec la véritable clé commune.

Sans la clé publique et les deux secrets de signature Tauri, le workflow de release
(tag ou lancement manuel) est volontairement **refusé avant les builds**. Cela évite
de publier un brouillon trompeur sans paquets de mise à jour. Une première installation
destinée aux mises à jour nécessite une build produite avec `--updates`;
les builds anciennes demandent une réinstallation unique.

Le canal `stable` décrit ici n'est **pas** un canal bêta : un essai privé avec mises à jour fréquentes
exige un endpoint/flux bêta distinct et un choix explicite du canal à l'installation, sans exposer
une préversion à tous les utilisateurs stables. La vérification de mise à jour contacte GitHub ;
elle n'est pas compatible avec un profil hors réseau sans consentement à cet endpoint.

Avant de distribuer à des amis, tester sur de vraies machines une montée de version (données et
identité conservées), une signature altérée (refus), l'absence de réseau et l'installation pendant
une demande en cours. Une build CI réussie seule ne suffit pas. Sur macOS, distribuer de préférence
une app Developer ID **notarisée**, sous Windows un installateur Authenticode signé : la signature
Tauri ne remplace ni Gatekeeper ni SmartScreen.

## Installer, par système

### macOS (13 Ventura ou plus récent)

1. Ouvrir le `.dmg` de son architecture (menu Pomme, « À propos de ce Mac » : puce Apple ou Intel).
2. Glisser `drop` dans Applications, puis l'ouvrir depuis Applications.
3. Build ad hoc seulement : macOS refuse la première ouverture. Ouvrir Réglages Système, Confidentialité et sécurité, puis « Ouvrir quand même » en face de drop, et confirmer.

L'icône de goutte apparaît dans la barre des menus : clic pour le panneau.

### Windows 10 et 11

1. Lancer `drop_<version>_x64-setup.exe`. Sans signature, SmartScreen affiche « Windows a protégé votre ordinateur » : cliquer « Informations complémentaires », puis « Exécuter quand même ».
2. L'installation se fait pour l'utilisateur courant, dans `%LOCALAPPDATA%\drop`, sans droits administrateur. Si WebView2 manque (rare sur Windows 10 à jour, toujours présent sur Windows 11), l'installeur le télécharge : il faut alors Internet.
3. drop démarre avec la session. L'icône est dans la zone de notification, à droite de la barre des tâches (parfois derrière la flèche « Afficher les icônes cachées ») : clic gauche pour le panneau, clic droit pour le menu.


### Linux (x64 ou arm64, X11 ou Wayland)

AppImage, sans installation :

```sh
chmod +x drop_<version>_amd64.AppImage
./drop_<version>_amd64.AppImage
```

Une AppImage demande FUSE 2 : `sudo apt install libfuse2` sur Ubuntu 22.04 et Debian 12, `libfuse2t64` sur Ubuntu 24.04. La build vise Ubuntu 22.04 et toute distribution aussi récente (glibc 2.35).


L'icône s'affiche dans la barre du bureau par le protocole AppIndicator : KDE, Xfce, Cinnamon et Ubuntu l'affichent d'emblée ; GNOME de base demande l'extension « AppIndicator and KStatusNotifierItem Support ». Sous Linux, l'icône n'émet pas de clic (doc Tauri) : tout passe par son menu, « Ouvrir le panneau », « Ouvrir mon espace », « Réessayer le démarrage », « Quitter ». Le panneau s'ouvre alors au milieu de l'écran, dans une petite fenêtre normale.

## Même comportement partout

- **Menu de l'icône** : « Ouvrir le panneau », « Ouvrir mon espace », « Réessayer le démarrage », « Quitter », plus « Mettre à jour vers x.y.z » sur une build Mac à mises à jour.
- **Démarrage avec la session** (build de release seulement) : élément d'ouverture sur macOS, clé `Run` de l'utilisateur sous Windows, entrée `~/.config/autostart` sous Linux (le chemin de l'AppImage quand l'app en vient). Désactivable dans les réglages du système.
- **Une seule instance** sous Windows et Linux : relancer l'app, ou ouvrir un lien `drop://` pendant qu'elle tourne, passe la main à l'instance déjà ouverte, qui montre son panneau. Jamais deux daemons.
- **Liens `drop://`** : enregistrés à l'installation par le `.dmg` (macOS) et l'installeur NSIS. Une AppImage les enregistre pour l'utilisateur à chaque lancement (`~/.local/share/applications/drop-desktop-handler.desktop`, masqué des menus, par `register_all` du plugin deep-link) ; un échec va dans `~/.drop/app.log` avec `E_DEEP_LINK` (T4.31).
- **Le daemon meurt avec l'app** sur les trois systèmes, même si l'app est tuée : il lit un tube que seule l'app tient ouvert (T4.18). Le test `packages/node/test/lifecycle.test.ts` tue le processus parent sur Linux, Windows et macOS en CI ; le test de fumée de chaque paquet le vérifie avec le Node embarqué.
- **Fermer le panneau** (Alt+F4, bouton de la barre de titre sous Linux) le cache seulement ; seul « Quitter » arrête drop.
- Les données restent dans `~/.drop` (`%USERPROFILE%\.drop` sous Windows), comme pour `drop` en ligne de commande.

## Reste à faire

- Recette sur de vraies machines : Windows 10 et 11, Ubuntu GNOME et KDE, X11 et Wayland, Mac Intel. Installer, ouvrir le panneau depuis l'icône, redémarrer la session, tuer l'app depuis le gestionnaire de tâches et vérifier que le daemon s'arrête.
- Windows : notifications natives, avec « Voir » et « Refuser » comme sur macOS (T4.30 ; le daemon les passe à l'app, qui ne les affiche que sur macOS), droits du dossier `.drop` (le mode `0600` ne vaut rien sous Windows, il faut des ACL), signature de `drop-iroh.exe`.
- Linux : notifications natives (actions seulement si le serveur de notifications annonce `actions`), panneau sans protection contre la capture (aucun réglage sous Linux) ; recette du lien `drop://join` avec une AppImage (T4.31).
- Mises à jour signées pour Windows et Linux (aujourd'hui macOS seulement).
- Ajouter les secrets de signature, puis refaire une release.

## Sources lues le 11 octobre 2026

- Tauri 2, GitHub Actions : https://v2.tauri.app/distribute/pipelines/github/
- Tauri 2, prérequis (paquets Linux, WebView2) : https://v2.tauri.app/start/prerequisites/
- Tauri 2, installeur Windows (NSIS, WebView2) : https://v2.tauri.app/distribute/windows-installer/
- Tauri 2, signature Windows : https://v2.tauri.app/distribute/sign/windows/
- Tauri 2, signature et notarisation macOS, signature ad hoc : https://v2.tauri.app/distribute/sign/macos/
- Tauri 2, AppImage : https://v2.tauri.app/distribute/appimage/
- Tauri 2, icône système (pas de clic sous Linux) : https://v2.tauri.app/learn/system-tray/
- Tauri 2, configuration par plateforme : https://v2.tauri.app/develop/configuration-files/
- Tauri 2, liens profonds et instance unique : https://v2.tauri.app/plugin/deep-linking/ et https://v2.tauri.app/plugin/single-instance/
- tauri-action : https://github.com/tauri-apps/tauri-action
- Runners GitHub : https://docs.github.com/en/actions/reference/runners/github-hosted-runners
