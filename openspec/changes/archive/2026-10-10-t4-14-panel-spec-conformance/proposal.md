## Why

T4.14 : écarts trouvés en T4.0 entre le panneau `/app`, servi par l'app Mac, et les specs (APP_FLOW §6), plus la demande de Guillaume du 10 octobre 2026 : « mes notifs doivent avoir l'icône de l'app ». Aujourd'hui `notify.ts` passe par `osascript`, donc macOS affiche l'icône de Script Editor, et un clic n'ouvre rien.

## What Changes

- **Notifications par l'app.** Dans l'app Mac, le daemon reçoit `DROP_NOTIFY=shell` et transmet chaque notification à la coque par une ligne JSON sur sa sortie standard. La coque l'affiche sous l'identité de l'app (`dev.memolabs.drop`, son icône) avec `mac-notification-sys` (déjà présent dans l'arbre Tauri, désormais dépendance directe), attend le clic et ouvre alors le panneau. Hors de l'app, `osascript` reste le repli ; `DROP_NOTIFY=off` reste le silence du banc.
- **Carte de consentement conforme.** Le panneau ajoute la ligne de sensibilité haute, le compte à rebours « Expire dans mm:ss », et fait de « Pas maintenant » le bouton par défaut au clavier.
- **Relecture champ par champ.** Pour une capacité sensible, le panneau montre une case par champ de premier niveau pour le retirer avant l'envoi (`redactions`), comme la page historique et la CLI.
- **Invitation confirmée.** Un lien `drop://pair` n'appaire plus à l'ouverture du panneau : le panneau montre qui invite et dans quelle équipe, et attend « Rejoindre » ou « Refuser ». Nouvelle route locale de prévisualisation qui décode l'invitation sans appairer.
- **Écran de démarrage.** Traduction de `E_STATE` ; titre sans tiret cadratin.

## Capabilities

### Modified Capabilities

- `node` : notification macOS (passage par l'app), carte de consentement (tutoiement du panneau, voir question ouverte).
- `owner-app` : invitation confirmée avant appairage.

## Non-goals

- Pas de nouveau contenu de carte au-delà de la spec ; pas de refonte visuelle.
- Pas de notification Windows ou Linux (T3.7, T3.8).
- Pas de correction du défaut `E_RATE` (T3.1d) ni du ciblage du propriétaire (T4.17).
- `tauri-plugin-notification` n'est pas retenu : la version 2.5.1 publiée ne remonte pas le clic sur macOS (lu dans son source `desktop.rs`).

## Impact

`packages/node` (notify, panel, api), `apps/mac` (coque Rust, écran de démarrage), specs `node` et `owner-app`. Une dépendance Rust directe : `mac-notification-sys`, déjà compilée dans l'app par Tauri.
