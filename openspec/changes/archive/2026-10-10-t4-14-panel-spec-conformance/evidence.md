# Preuves T4.14

| Critère | Preuve |
|---|---|
| Notification remise à l'app | Test « notifications (T4.14) > AC hands the notification to the Mac app as one JSON line in shell mode ». |
| Banc silencieux (inchangé) | Test « notifications (T4.1) > AC stays silent when DROP_NOTIFY is off, even on macOS ». |
| Icône de l'app et clic qui ouvre le panneau | Recette réelle le 10 octobre 2026 sur la build notarisée (`spctl` : `Notarized Developer ID`), avec une seconde instance de l'app sur un `DROP_HOME` temporaire et un collègue simulé : macOS demande l'autorisation de notifier pour « drop » avec son icône ; après autorisation, la notification « Collègue Simulé a besoin d'aide » arrive avec l'icône de drop et un clic ouvre le panneau (confirmé par Guillaume, capture à l'appui). |
| Invitation confirmée | Test « menu bar panel and its admin routes (T4.14) > previews an invitation without pairing and pairs only after Rejoindre » : prévisualisation sans envoi, 401 sans jeton, 400 sur un code invalide, un seul appel d'appairage, placé dans le gestionnaire « Rejoindre ». |
| Carte et relecture conformes | Test « … renders expiry, high sensitivity, a default Pas maintenant and per-field redaction » ; recette réelle : « Expire dans 08:16 » qui décompte et « Pas maintenant » sélectionné. |
| Tutoiement de la carte | Spec `node` modifiée ; page historique et son test « Coût max : 0,50 $, à ta charge. ». |

## Revue

Revue adverse et sécurité : 1 critique corrigé (le focus par défaut bloquait le rafraîchissement en direct et laissait une carte expirée à l'écran ; le panneau se rafraîchit désormais sauf pendant une saisie et rend le focus au bouton qui l'avait), 7 informations traitées (invitation présentée comme annoncée par le lien car non signée ; lecture des lignes par octets ; garde EPIPE côté daemon ; échec d'identité journalisé `E_NOTIFY` ; compteurs limités à macOS ; texte exact de la carte ; tests renforcés). Reste ouvert : si plus de 8 notifications attendent un clic sans être fermées, les suivantes s'affichent sans ouvrir le panneau au clic (risque accepté, constaté par lecture). `/cso` gstack ciblé en mode diff : statut partiel, aucune faille démontrée (route derrière le jeton, ligne JSON non falsifiable par un pair).

Écart découvert pendant la recette : tuer la coque par un signal laisse le daemon tourner ; porté par T4.18.

## Vérification

`pnpm -s lint`, `pnpm -s typecheck`, `pnpm -r test` (369 tests), `cargo clippy --release` sans avertissement, `openspec validate --all --strict`, openspec-guard avec sélecteurs. La build notarisée testée précède les corrections de la revue ; une nouvelle build est nécessaire pour distribuer cette version.
