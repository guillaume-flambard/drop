## Contexte

Avant T4.30 : le daemon lancé par l'app écrit une ligne `{"dropNotify":{"title","subtitle"}}` par demande (T4.14) ; la coque l'affiche avec `mac-notification-sys` et un clic ouvre le panneau là où il était. Le panneau décide par `POST /ui/decide`, qui appelle `engine.decide` ; ce dernier ne vérifiait pas l'expiration, laissée au tick d'une seconde. L'interface ne parle à la coque par aucun IPC Tauri (docs/ARCHITECTURE.md) : la coque ne peut agir que par l'URL du panneau ou l'API locale, avec le jeton.

## Recherche (versions installées)

| Source | Ce qu'elle établit |
| --- | --- |
| Tauri 2.12.1 (`Cargo.lock`), plugin notification, <https://v2.tauri.app/plugin/notification/> | « The Actions API is only available on mobile platforms. » Le plugin n'offre aucune action sur macOS, Windows ni Linux ; il n'est pas installé ici. |
| Apple, `NSUserNotification` (<https://developer.apple.com/documentation/foundation/nsusernotification>) | Disponible de macOS 10.8 à 11.0 : déprécié depuis macOS 11. |
| `mac-notification-sys` 0.6.15, `objc/notify.m` (source locale) | Plusieurs actions passent par les clés privées `_alternateActionButtonTitles`, `_alwaysShowAlternateActionMenu`, `_showsButtons`. Le bouton « fermer » (`otherButtonTitle`) remonte par `didDismissAlert`, la même voie qu'une fermeture : y mettre « Refuser » ferait refuser une notification simplement écartée. |
| Apple, « Declaring your actionable notification types » | Catégories `UNNotificationCategory` et actions `UNNotificationAction` déclarées au lancement, réponse par `userNotificationCenter(_:didReceive:withCompletionHandler:)` avec l'identifiant de l'action ; une fermeture n'est signalée que si la catégorie le demande (`customDismissAction`). Option `destructive` pour un refus. |
| Apple, `UNNotificationInterruptionLevel` (macOS 12+) | `active` (défaut) n'outrepasse rien ; `timeSensitive` « breaks through system notification controls », `critical` aussi. |
| `objc2-user-notifications` 0.3.2, `objc2` 0.6.5, `block2` 0.6.2 (déjà dans `Cargo.lock`, tirés par Tauri) | Liaisons des API ci-dessus ; aucune nouvelle caisse téléchargée, `mac-notification-sys` sort du verrou. |
| tao 0.37.1, `set_content_protection` (source locale) | macOS : `NSWindow.sharingType = none` ; Windows : `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` ; Linux : sans effet (`#[cfg(any(target_os = "macos", target_os = "windows"))]`). |
| Forums Apple (fil 808016) et recherche web du 12 octobre 2026 | Aucune source Apple ne dit que `sharingType = none` cesse d'agir avec ScreenCaptureKit ; des comportements variables sont rapportés depuis macOS 15. À vérifier à la main. |
| Microsoft Learn, « Notifications design basics » | Une notification Windows (toast) porte des boutons ; une appli de bureau non empaquetée doit enregistrer son activation (AUMID, activateur COM) pour recevoir le clic d'un bouton. |
| freedesktop, Desktop Notifications Specification | Actions facultatives : le serveur annonce `actions` dans `GetCapabilities` et « is free to ignore them » ; `ActionInvoked` n'est pas garanti. |

## Décisions

1. **UserNotifications, pas `mac-notification-sys`.** Framework documenté et non déprécié, actions sans clé privée, fermeture distincte de « Refuser », identifiant de requête qui ramène la demande, niveau d'interruption explicite. Coût : une autorisation demandée au premier lancement (macOS l'exige pour ce framework), et aucune notification hors d'un paquet `.app` (`tauri dev`), journalisé `E_NOTIFY_UNBUNDLED`.
2. **Deux actions, aucune variante « autoriser ».** Le type Rust `NotificationAction` n'a que `View` et `Deny` ; la catégorie n'a que « Voir » et « Refuser » ; la route du Node ne sait que refuser. Trois verrous indépendants, chacun testé.
3. **« Refuser » passe par le Node.** La coque n'a pas de logique propre : elle envoie `{ "dropId" }` à `POST /ui/notification/deny`, avec `Host: 127.0.0.1:<port>` et le jeton local, comme la vérification de santé. Le Node appelle `decideApproval(dropId, 'deny')`, la fonction de `POST /ui/decide`.
4. **Expiration vérifiée au moment de décider**, pour la carte comme pour la notification : une demande expirée n'est jamais tranchée, même dans la seconde avant le tick. Changement de comportement de `/ui/decide` assumé : avant, une autorisation dans cette seconde partait et l'exécuteur la rejetait de son côté.
5. **Codes stables** : `E_NOT_PENDING` (inconnue, déjà tranchée, relecture) et `E_EXPIRED`. Ce sont des codes de l'API locale, comme `E_AMBIGUOUS_CAPABILITY`, pas de nouveaux `ERROR_CODES` du protocole. La coque les écrit dans `app.log`.
6. **« Voir » sans recharger le panneau.** Un panneau déjà sur la page du Node reçoit `#request=<dropId>` par `eval` de la coque : seul le fragment change, rien ne se recharge et un brouillon de « Répondre moi-même », gardé en mémoire seulement, survit. Un panneau pas encore chargé (démarrage, écran d'attente) s'ouvre sur `?request=<dropId>`. Le panneau lit l'un ou l'autre une fois, le retire de l'adresse et met le focus sur « Pas maintenant ».
7. **Seule la fenêtre du panneau est protégée** : c'est la seule qui montre une demande. « Mon espace » n'en montre pas ; la page historique `/` s'ouvre dans un navigateur, hors de portée de l'app.
8. **Présentation au premier plan** : l'app étant un accessoire sans Dock, une demande qui arrive pendant que le panneau a le focus s'affiche quand même (`banner`, `list`, `sound`).
9. **Un « Refuser » qui ne s'applique pas ouvre la carte** (demande expirée, déjà tranchée, Node injoignable) : le propriétaire voit « n'attend plus » ou la carte qui attend encore, au lieu de croire avoir refusé. « Refuser » exige une session déverrouillée (`AuthenticationRequired`).
10. **Aucune panique dans le rappel Objective-C** : l'action s'exécute sur un fil à elle, le rappel rend la main au système aussitôt ; la lecture du port ne panique pas sur un verrou empoisonné.

## Ce que chaque plateforme permet

- **macOS** : actions documentées (UserNotifications, macOS 10.14+, cible 13.0). Livré ici.
- **Windows** : boutons de toast documentés, à condition d'enregistrer l'activation de l'appli de bureau. La coque n'affiche encore aucune notification Windows (`docs/RELEASE.md`) : à faire avec ces deux actions.
- **Linux** : actions facultatives selon le serveur de notifications (`actions` dans `GetCapabilities`) ; GNOME et KDE les annoncent, d'autres non. Même état que Windows ; `content_protected` n'y a aucun effet.
- **Plugin Tauri notification** : aucune action sur ordinateur ; inutilisable pour ce besoin.

## Risques

| Risque | Niveau | Traitement |
| --- | --- | --- |
| Une action autorise | critique | Impossible par construction (type, catégorie, route stricte) ; tests Rust, contrat JS, tests de la route. |
| « Refuser » sur une demande déjà tranchée, expirée ou remplacée | élevé | Même chemin que la carte, refus avec code et rien n'est envoyé ; testé sur un vrai relais. |
| Le Node ne répond pas au moment de « Refuser » | moyen | `E_NOTIFY_UNREACHABLE` journalisé, le panneau s'ouvre sur la carte qui attend encore. |
| Autorisation de notifications refusée par l'utilisateur | moyen | Plus aucune notification, comme si elles étaient coupées dans Réglages ; le panneau et son badge restent. `E_NOTIFY_DENIED` dans `app.log`. |
| `sharingType = none` contourné par une capture ScreenCaptureKit récente | moyen | Pas de source Apple dans un sens ou l'autre : recette manuelle sur macOS 15+. |
| `eval` du fragment refusé par la politique de contenu du panneau | moyen | WKWebView et WebView2 exécutent le script de l'hôte hors CSP de la page ; non observé ici : recette manuelle de « Voir » panneau ouvert. |
| Notifications livrées jamais retirées quand la demande est tranchée ailleurs | faible | Leur « Refuser » est ignoré (`E_NOT_PENDING`) et ouvre la carte ; retrait à faire plus tard. |
| Code Objective-C non exécuté en CI | moyen | `cargo check`, `cargo clippy` et `cargo test` locaux sur macOS ; la CI ne compile la coque qu'au build de release ; recette manuelle de l'app signée. |
