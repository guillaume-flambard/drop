## MODIFIED Requirements

### Requirement: Notification macOS
Sur macOS, le Node SHALL notifier chaque demande avec le titre « {Nom} a besoin d'aide » et pour sous-titre le titre de la capacité ; un clic SHALL ouvrir l'UI locale. Lancé par l'app Mac (`DROP_NOTIFY=shell`), il MUST remettre à l'app, qui l'affiche avec son icône, la notification et la demande qu'elle nomme (`dropId`, `kind`, T4.30) ; ailleurs, `osascript` l'affiche sans l'identifiant. `DROP_NOTIFY=off`, réservé au banc, MUST l'empêcher.

#### Scenario: Notification émise
- **WHEN** une demande de Julie pour « Résumer les erreurs de production » arrive sur macOS
- **THEN** une notification « Julie a besoin d'aide » s'affiche avec ce sous-titre, et un clic ouvre l'UI locale

#### Scenario: AC: banc de simulation silencieux
<!-- openspec-guard:test="notifications (T4.1) > AC stays silent when DROP_NOTIFY is off, even on macOS" -->
- **WHEN** le Node tourne sur macOS avec `DROP_NOTIFY=off`
- **THEN** aucune notification n'est émise

#### Scenario: AC: notification remise à l'app
<!-- openspec-guard:test="notifications (T4.14) > AC hands the notification to the Mac app as one JSON line in shell mode" -->
- **WHEN** le Node tourne avec `DROP_NOTIFY=shell` et qu'une demande arrive
- **THEN** il écrit une seule ligne JSON `dropNotify` portant titre et sous-titre, et n'appelle pas `osascript`

#### Scenario: AC: demande nommée pour les actions
<!-- openspec-guard:test="notifications (T4.30) > AC names the request in the line handed to the app, so its actions reach the right card" -->
- **WHEN** une décision puis une relecture arrivent avec `DROP_NOTIFY=shell`, puis une décision hors de l'app
- **THEN** chaque ligne `dropNotify` porte aussi `dropId` et `kind` (`approval`, `review`), et `osascript` ne reçoit pas l'identifiant

## ADDED Requirements

### Requirement: Décision seulement sur une demande en attente
Le Node SHALL trancher une carte de consentement, depuis la carte comme depuis une notification, par un seul chemin de décision. Ce chemin MUST refuser sans rien envoyer une demande qui n'attend plus : inconnue, déjà tranchée ou qui n'est pas une décision (`E_NOT_PENDING`), ou expirée, même avant que le tick ne la retire (`E_EXPIRED`). `POST /ui/decide` rend alors 404 avec ce code.

#### Scenario: AC: refus tardif ignoré avec un code stable
<!-- openspec-guard:test="notification actions (T4.30) > AC ignores a late Refuser with a stable code: decided, expired or unknown, nothing is sent" -->
- **WHEN** « Refuser » arrive d'une notification pour une demande déjà autorisée depuis la carte, pour une demande expirée, puis pour un identifiant inconnu, et que la carte autorise la demande expirée
- **THEN** chaque réponse porte `E_NOT_PENDING` ou `E_EXPIRED`, la demande autorisée reste livrée, aucune enveloppe ne part et chaque refus ignoré est journalisé avec son code

### Requirement: Refus depuis une notification
L'API locale SHALL exposer, derrière le jeton, `POST /ui/notification/deny`, qui n'accepte que `{ "dropId": "<uuid>" }` et ne peut que refuser, par le chemin de décision de la carte. Un corps qui porte autre chose, une décision comprise, MUST être refusé (400, `E_SCHEMA`) sans rien trancher. Un refus valide rend 200 ; une demande qui n'attend plus rend 409 avec son code.

#### Scenario: AC: même refus que la carte
<!-- openspec-guard:test="notification actions (T4.30) > AC refuses from the notification through the same decision path as the card" -->
- **WHEN** l'app envoie « Refuser » pour une demande en attente
- **THEN** le Node la refuse par la fonction de décision de la carte, le demandeur reçoit `E_DENIED`, l'exécuteur écrit un reçu `deny` sans appel d'outil, et la carte disparaît

#### Scenario: AC: jamais d'autorisation depuis une notification
<!-- openspec-guard:test="notification actions (T4.30) > AC never authorizes from a notification, whatever its body says" -->
- **WHEN** la route reçoit un corps avec `decision: allow_once`, un identifiant mal formé, un corps vide ou un formulaire, puis une requête sans jeton
- **THEN** chacun est refusé (400 `E_SCHEMA`, ou 401) sans appel au chemin de décision, et seule la requête valide produit un refus
