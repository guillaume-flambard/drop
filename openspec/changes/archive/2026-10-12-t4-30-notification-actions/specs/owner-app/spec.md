## ADDED Requirements

### Requirement: Actions de la notification de demande
Sur macOS, l'app SHALL afficher les notifications du Node par le framework UserNotifications. Celle d'une décision SHALL porter deux actions seulement, « Voir » et « Refuser » ; aucune MUST NOT proposer « Autoriser », puisqu'elle coupe le texte du pair à 200 caractères. Le niveau d'interruption MUST rester `active`, sans outrepasser un mode Concentration. Windows et Linux n'en affichent pas encore (T3.7, T3.8).

#### Scenario: AC: deux actions, jamais Autoriser
<!-- openspec-guard:test="desktop notification actions (T4.30) > offers Voir and Refuser only on a request notification, never Autoriser, without breaking through Focus" -->
- **WHEN** l'app affiche la notification d'une décision, puis celle d'une relecture
- **THEN** la première porte « Voir » et « Refuser » (destructive), la seconde aucune action, aucune ne propose d'autoriser, et leur niveau d'interruption est `active`

### Requirement: Voir et Refuser passent par le panneau et le Node
« Voir » et un clic SHALL ouvrir le panneau sur la carte complète de la demande, sans recharger un panneau déjà ouvert. « Refuser » SHALL appeler `POST /ui/notification/deny` du Node avec le seul identifiant de la demande ; s'il ne s'applique pas ou que le Node ne répond pas, l'app SHALL journaliser le code et ouvrir la carte.

#### Scenario: AC: Refuser passe par le Node
<!-- openspec-guard:test="desktop notification actions (T4.30) > sends Refuser to the node refusal route with the drop identifier only, and opens the card for Voir" -->
- **WHEN** le propriétaire choisit « Refuser », puis « Voir », sur la notification d'une décision
- **THEN** l'app envoie au Node `{ "dropId" }` seul sur sa route de refus, et « Voir » ouvre le panneau avec cette demande

### Requirement: Carte ouverte depuis une notification
Ouvert avec `request=<dropId>`, le panneau SHALL retirer ce paramètre de l'adresse, afficher « Demandes » et placer le focus sur « Pas maintenant » de cette carte, jamais sur « Autoriser ». Si la demande n'attend plus, il SHALL le dire. L'arrivée MUST NOT trancher quoi que ce soit.

#### Scenario: AC: carte complète de la demande notifiée
<!-- openspec-guard:test="notification entry (T4.30) > AC opens the full card of the notified request, focused on Pas maintenant, never on Autoriser" -->
- **WHEN** le panneau s'ouvre sur une demande qui n'est pas la première de la liste
- **THEN** sa carte montre la question entière, le focus est sur son « Pas maintenant », seul le jeton reste dans l'adresse et rien n'est envoyé

#### Scenario: AC: demande qui n'attend plus
<!-- openspec-guard:test="notification entry (T4.30) > AC says so when the notified request no longer waits, and decides nothing" -->
- **WHEN** le panneau s'ouvre sur une demande tranchée ailleurs ou expirée
- **THEN** il affiche « Cette demande n'attend plus de décision » et n'envoie rien

#### Scenario: AC: panneau ouvert, brouillon gardé
<!-- openspec-guard:test="notification entry (T4.30) > AC lands on the notified card of an open panel without reloading it, so a draft answer survives" -->
- **WHEN** « Voir » arrive pendant qu'un brouillon de réponse est en cours sur une autre carte
- **THEN** le panneau se place sur la carte notifiée sans se recharger, le brouillon reste, et l'adresse ne garde que le jeton

### Requirement: Panneau exclu du partage d'écran
La fenêtre du panneau, qui montre les demandes, SHALL être protégée contre la capture (`content_protected`) : exclue du partage d'écran et des captures sur macOS et Windows. Linux n'offre pas ce réglage.

#### Scenario: AC: panneau protégé
<!-- openspec-guard:test="desktop notification actions (T4.30) > keeps the panel that shows requests out of screen sharing" -->
- **WHEN** l'app construit la fenêtre du panneau
- **THEN** la fenêtre est construite avec `content_protected(true)`
