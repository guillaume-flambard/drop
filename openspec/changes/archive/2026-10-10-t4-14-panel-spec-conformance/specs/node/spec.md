## MODIFIED Requirements

### Requirement: Notification macOS
Sur macOS, le Node SHALL notifier chaque demande avec le titre « {Nom} a besoin d'aide » et pour sous-titre le titre de la capacité, et un clic SHALL ouvrir l'UI locale. Lancé par l'app Mac avec `DROP_NOTIFY=shell`, le Node MUST transmettre la notification à l'app par une ligne JSON sur sa sortie standard ; l'app l'affiche sous sa propre identité, avec son icône, et un clic ouvre le panneau. Hors de l'app, le Node SHALL utiliser `osascript`. Avec `DROP_NOTIFY=off`, réservé au banc de simulation (T4.1), le Node MUST n'émettre aucune notification ; aucun message d'un pair ne peut modifier cette variable.

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

### Requirement: Contenu exact de la carte de consentement
La carte SHALL afficher exactement ce contenu, dans cet ordre (ligne « Sensibilité haute » seulement si `high`), au tutoiement sur la page historique comme dans le panneau :

```text
{requestedBy.displayName} a besoin d'aide            via {agent}
{card.title}
« {inputPreview} »

Pourquoi : {purpose}

{displayName} recevra :            {receives[]}
{displayName} ne recevra jamais :  {neverReceives[]}
Coût max : {maxUsd} $, à ta charge.   (ou « gratuit », ou « non mesuré » ; absent si la capacité ne coûte rien)
Sensibilité haute : tu reliras le résultat avant envoi.   (si high)

Expire dans {mm:ss}

[ Pas maintenant ]   [ Refuser ]   [ Autoriser une fois ]
```

#### Scenario: Ordre des éléments
<!-- openspec-guard:test="consent UI > shows no technical identifier and defaults to « Pas maintenant »" -->
- **WHEN** la carte d'une demande est rendue
- **THEN** les éléments apparaissent dans l'ordre : demandeur et agent, titre, aperçu de l'entrée, « Pourquoi », « recevra », « ne recevra jamais », coût éventuel, sensibilité haute éventuelle, « Expire dans », puis les boutons « Pas maintenant », « Refuser », « Autoriser une fois »

#### Scenario: Ligne de sensibilité haute
- **WHEN** la capacité est `low`
- **THEN** la ligne « Sensibilité haute : tu reliras le résultat avant envoi. » est absente
