## Why

En lisant OpenWhispr le 12 octobre 2026 (commit `5f9a88b`, `docs/research/2026-10-12-openwhispr.md`), on a vu que ses notifications proposent des actions. Les nôtres n'en ont aucune : un clic ouvre le panneau là où il était, sans aller à la demande. Guillaume a tranché le même jour (ligne T4.30 de `docs/TASKS.md`) :

- deux boutons seulement, « Voir », qui ouvre la carte complète, et « Refuser » ;
- jamais « Autoriser » hors de la carte complète, puisque la notification coupe le texte du pair à 200 caractères ;
- aucun passe-outre du mode Concentration ;
- « Refuser » passe par le même chemin de décision du Node que la carte et ne vaut que si la demande attend encore (identifiant identique, non expirée, pas déjà tranchée), sinon il est ignoré avec un code stable ;
- trancher en début de change entre `mac-notification-sys` (bâti sur `NSUserNotification`, déprécié) et le framework UserNotifications ;
- les fenêtres qui montrent une demande deviennent `content_protected` ;
- Windows et Linux suivent T3.7 et T3.8.

## What Changes

- **Node, un seul chemin de décision** : `engine.decideApproval(dropId, decision)` porte la décision de la carte et celle de la notification. Il refuse sans rien envoyer une demande inconnue, déjà tranchée ou qui n'est pas une décision (`E_NOT_PENDING`), et une demande expirée, même avant que le tick ne la retire (`E_EXPIRED`). `POST /ui/decide` rend ce code dans sa réponse 404 ; `engine.decide` garde sa forme booléenne.
- **Node, route de refus** : `POST /ui/notification/deny`, derrière le jeton local, n'accepte que `{ "dropId": "<uuid>" }` (schéma strict) et ne peut que refuser. Refus valide : 200 ; demande qui n'attend plus : 409 avec `E_NOT_PENDING` ou `E_EXPIRED`, journalisé ; corps invalide, champ `decision` compris : 400 `E_SCHEMA`.
- **Node, notification nommée** : en mode `DROP_NOTIFY=shell`, la ligne `dropNotify` porte aussi `dropId` et `kind` (`approval` ou `review`). `osascript` ne les reçoit pas.
- **App Mac, UserNotifications** : `mac-notification-sys` est remplacé par `UNUserNotificationCenter` via les liaisons `objc2` déjà verrouillées par Tauri. Une catégorie de décision porte « Voir » (premier plan) et « Refuser » (destructive) ; une relecture n'a pas d'action. Niveau d'interruption `active`. « Voir » et un clic ouvrent le panneau sur `?request=<dropId>` ; « Refuser » appelle la route de refus et journalise un refus ignoré ; si le Node ne répond pas, le panneau s'ouvre sur la carte.
- **Panneau** : ouvert avec `request=<dropId>`, il retire le paramètre de l'adresse, affiche « Demandes » et place le focus sur « Pas maintenant » de cette carte, jamais sur « Autoriser » ; si la demande n'attend plus, il le dit.
- **Fenêtre du panneau** : `content_protected(true)`, exclue du partage d'écran et des captures sur macOS et Windows ; sans effet sous Linux.

## Capabilities

### Modified Capabilities

- `node` : notification remise à l'app avec la demande nommée ; décision d'une carte seulement en attente ; refus depuis une notification.
- `owner-app` : actions « Voir » et « Refuser » de la notification de demande ; carte ouverte depuis une notification ; panneau exclu du partage d'écran.

## Non-goals

- Notifications natives Windows et Linux : la coque n'en affiche aucune aujourd'hui (`docs/RELEASE.md`). Elles reprendront ces deux actions quand elles existeront ; voir le design pour ce que chaque plateforme permet.
- Retirer de la liste de notifications celle d'une demande tranchée ailleurs : son « Refuser » est déjà ignoré (`E_NOT_PENDING`).
- Toute action sur une notification de relecture autre que l'ouvrir.
- Refonte de la carte de consentement (T4.35) ; invitation, relais et « Connecter mes agents » (T4.31).

## Impact

`packages/node` (engine, api, notify, daemon), `packages/desktop-ui` (panneau, nouveau `notification-entry.ts`), `apps/desktop/src-tauri` (nouveau `notifications.rs`, `main.rs`, `Cargo.toml`, `Cargo.lock`), `packages/node/src/workspace-assets.generated.ts` régénéré, tests de ces paquets et `test/desktop-notifications.test.ts`, `docs/product/UX_UI.md`, `docs/product/APP_FLOW.md`, `docs/RELEASE.md`.
