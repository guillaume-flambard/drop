## 1. Tests d'abord

- [x] 1.1 Test du mode `DROP_NOTIFY=shell` de `notify` (une ligne JSON, pas d'osascript).
- [x] 1.2 Tests du panneau : prévisualisation d'invitation sans appairage, carte (sensibilité, expiration, défaut), relecture par champ.

## 2. Node

- [x] 2.1 `notify.ts` : mode shell.
- [x] 2.2 `api.ts` : `POST /ui/pair/preview`.
- [x] 2.3 `panel.ts` : carte conforme, relecture par champ, invitation confirmée.

## 3. Coque Mac

- [x] 3.1 `main.rs` : daemon avec `DROP_NOTIFY=shell` et stdout lu ; affichage par `mac-notification-sys` sous l'identité de l'app ; clic qui ouvre le panneau ; `E_NOTIFY` journalisé.
- [x] 3.2 Écran de démarrage : `E_STATE` traduit, titre sans tiret cadratin.
- [x] 3.3 Build notarisée et recette réelle : icône de l'app sur la notification, clic qui ouvre le panneau, invitation confirmée.

## 4. Vérification

- [x] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `cargo clippy`, openspec-guard avec sélecteurs et baseline sans ajout.
- [x] 4.2 `/review` (gstack) et `/cso` (la change touche `node` et la frontière daemon vers coque).
