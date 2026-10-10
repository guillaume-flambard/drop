## Context

`notify.ts` appelle `osascript` (spec `node`, « Notification macOS »). La coque Tauri lance le daemon avec la sortie standard ignorée (`main.rs`, `start_daemon`). `tauri-plugin-notification` 2.5.1 fixe l'identifiant de l'app en build installée mais n'expose aucun clic sur desktop ; `mac-notification-sys` 0.6.15 (`send_notification`, `set_application`, `Notification::wait_for_click`) le permet, au prix de l'API `NSUserNotification` qu'Apple a dépréciée mais qui fonctionne encore.

## Decisions

- **Canal daemon vers coque.** `DROP_NOTIFY=shell` : `notify()` écrit une ligne `{"dropNotify":{"title":…,"subtitle":…}}` sur stdout. La coque lit stdout ligne par ligne, ignore tout ce qui n'est pas cet objet, et limite titre et sous-titre à 200 caractères. Le texte des pairs n'est jamais interprété : il devient une chaîne de notification.
- **Affichage et clic.** Un fil par notification : `set_application("dev.memolabs.drop")` une fois, `send_notification(title, None, subtitle, wait_for_click)`. Sur `Click`, la coque affiche le panneau à sa place habituelle, comme un clic sur l'icône de barre de menus.
- **Repli.** Si la coque n'a pas pu afficher (erreur de `mac-notification-sys`), elle n'appelle pas `osascript` : le panneau et le badge restent la voie. Hors de l'app, le daemon garde `osascript`.
- **Expiration.** Le panneau calcule `expiresAt - maintenant` chaque seconde et l'affiche en `mm:ss` ; à zéro, la carte disparaît au rafraîchissement suivant.
- **Invitation.** `POST /ui/pair/preview` décode et vérifie le code sans rien envoyer, et rend `{ displayName, team? }` ; le panneau affiche ces textes par `textContent`. Le code reste dans la mémoire de la page jusqu'au choix, jamais dans l'URL.

## Risks / Trade-offs

- `NSUserNotification` est déprécié : une future version de macOS peut le retirer. Mitigation : test réel sur macOS 27 avant clôture ; si l'affichage échoue, la coque le journalise (`E_NOTIFY`) et le panneau reste la voie.
- En build de développement non signée, macOS peut refuser l'identité de l'app : la recette de l'icône se fait sur la build notarisée.
