## ADDED Requirements

### Requirement: États nommés de la carte de consentement
La carte de consentement SHALL porter un état nommé : en attente, décision en cours, autorisée (« Autorisée une fois » ou « Répondue »), refusée (« Refusée » ou « Pas maintenant »), expirée ou incertaine. Une fois la décision confirmée ou impossible à confirmer, « Expire dans », les boutons et « Répondre moi-même » SHALL laisser place au nom de l'état et à une phrase qui dit ce qui est arrivé aux données, avec « Masquer ».

#### Scenario: AC: une phrase par état sur les données
<!-- openspec-guard:test="consent card model (T4.35) > names each state with a sentence that says what happened to the data" -->
- **WHEN** Julie demande et que la carte est refusée, reportée, autorisée une fois, répondue à la main, expirée, ou que sa décision ne peut pas être confirmée
- **THEN** la carte dit « Refusée », « Pas maintenant » ou « Expirée » avec « Rien n'a été envoyé à Julie. », « Autorisée une fois » avec « Seul le résultat de cette demande partira vers Julie. » (ou la relecture à venir si la capacité est sensible), « Répondue » avec « Seule ta réponse partira vers Julie. », et « Incertaine » avec « Impossible de confirmer ce qui a été envoyé à Julie. »

### Requirement: Expiration réservée à une carte en attente
Seule une carte en attente MAY expirer : une décision en cours MUST NOT se retirer ni devenir expirée, et une décision confirmée MUST garder son état.

#### Scenario: AC: seule une carte en attente expire
<!-- openspec-guard:test="consent card model (T4.35) > lets only a pending card expire, and never withdraws a decision in flight" -->
- **WHEN** l'heure d'expiration passe pendant qu'une carte attend, pendant qu'une décision est en cours, puis après une décision confirmée
- **THEN** seule la carte en attente devient « Expirée » ; la décision en cours reste en cours, même absente de la liste du Node, et la décision confirmée garde son état

### Requirement: Réponse du Node lue sans deviner
Une réponse du Node illisible, absente ou en erreur serveur MUST donner « incertaine », jamais « refusée » ni « Rien n'a été envoyé ». Une demande qui n'attendait plus donne « incertaine », sauf `E_EXPIRED`, qui donne « expirée ». Un refus qui laisse la demande en attente (jeton, schéma) MUST rendre la carte en attente, avec sa raison.

#### Scenario: AC: réponse illisible incertaine
<!-- openspec-guard:test="consent card model (T4.35) > reads an unreadable or failed reply as uncertain, never as refused" -->
- **WHEN** `/ui/decide` échoue sur le réseau, répond 500, répond 200 sans `ok: true`, répond 404 avec `E_EXPIRED`, répond 404 sans code, ou répond 401
- **THEN** la carte est « Incertaine » dans les trois premiers cas, « Expirée » avec `E_EXPIRED`, « Incertaine » (n'attendait plus) avec le 404 sans code, et de nouveau en attente avec la raison du 401

### Requirement: Liste du Node prioritaire sur une carte incertaine
Une carte incertaine que le Node liste encore SHALL redevenir en attente. Une décision confirmée ou une expiration MUST NOT revenir en arrière.

#### Scenario: AC: demande encore listée remise en attente
<!-- openspec-guard:test="consent card model (T4.35) > puts back to pending a card the Node still lists, and keeps a confirmed decision" -->
- **WHEN** une carte est incertaine ou autorisée et que la liste suivante du Node la contient encore
- **THEN** la carte incertaine redevient en attente avec une phrase qui le dit, la carte autorisée garde son état

## MODIFIED Requirements

### Requirement: Contenu exact de la carte de consentement
La carte SHALL afficher exactement ce contenu, dans cet ordre (ligne « Sensibilité haute » seulement si `high`), au tutoiement sur la page historique comme dans le panneau, tant que la demande attend une décision. Une carte décidée suit « États nommés de la carte de consentement » :

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
<!-- openspec-guard:test="consent UI > omits the high-sensitivity line for a low capability and words it in tu otherwise" -->
- **WHEN** la capacité est `low`
- **THEN** la ligne « Sensibilité haute : tu reliras le résultat avant envoi. » est absente
