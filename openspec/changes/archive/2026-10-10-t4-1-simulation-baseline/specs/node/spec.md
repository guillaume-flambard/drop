## MODIFIED Requirements

### Requirement: Notification macOS
Sur macOS, le Node SHALL émettre une notification via `osascript` avec le titre « {Nom} a besoin d'aide » et pour sous-titre le titre de la capacité ; un clic SHALL ouvrir l'UI locale. Seule exception : quand la variable d'environnement `DROP_NOTIFY` vaut `off`, réservée au banc de simulation (T4.1), le Node MUST n'émettre aucune notification ; aucun message d'un pair ne peut la modifier.

#### Scenario: Notification émise
- **WHEN** une demande de Julie pour « Résumer les erreurs de production » arrive sur macOS
- **THEN** une notification « Julie a besoin d'aide » s'affiche avec ce sous-titre, et un clic ouvre l'UI locale

#### Scenario: AC: banc de simulation silencieux
<!-- openspec-guard:test="notifications (T4.1) > AC stays silent when DROP_NOTIFY is off, even on macOS" -->
- **WHEN** le Node tourne sur macOS avec `DROP_NOTIFY=off`
- **THEN** aucune notification n'est émise
