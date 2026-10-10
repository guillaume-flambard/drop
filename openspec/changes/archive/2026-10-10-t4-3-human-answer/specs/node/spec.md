## ADDED Requirements

### Requirement: Réponse à la main par l'approbateur
Sur une carte d'approbation en attente, le Node de l'approbateur SHALL permettre de répondre à la main par un `HumanAnswer`, ce qui vaut consentement pour cette seule demande. Il MUST valider la réponse et y chercher des secrets avant tout envoi ; un refus laisse la carte en attente. La route locale `POST /ui/answer` MUST refuser avec un code stable, et `/ui/pending` MUST nommer l'exécuteur d'après les pairs locaux.

#### Scenario: AC: réponse livrée avec le même reçu
<!-- openspec-guard:test="human answer (T4.3) > delivers a hand-written answer with the same consent and a receipt marked human" -->
- **WHEN** l'approbateur répond « Le déploiement est prévu jeudi » à une demande en attente
- **THEN** le demandeur reçoit ce texte, la capacité n'est pas exécutée et le reçu signé porte `answeredBy: 'human'`

#### Scenario: AC: secret bloqué avant envoi
<!-- openspec-guard:test="human answer (T4.3) > refuses a hand-written answer that carries a secret, before anything is sent" -->
- **WHEN** la réponse contient une clé d'API reconnue
- **THEN** le Node refuse avec `E_SECRET_DETECTED`, rien n'est envoyé et la carte reste en attente pour une correction

#### Scenario: AC: route locale de réponse
<!-- openspec-guard:test="human answer (T4.3) > answers by hand through the panel route, which refuses an empty or oversized answer" -->
- **WHEN** le panneau envoie à `POST /ui/answer` une réponse vide, mal formée, au nom trop long, trop grosse ou dépassant le corps permis, puis valide
- **THEN** chacune est refusée avec son code (`E_SCHEMA`, `E_TOO_LARGE`, 413 pour le corps) et la dernière est livrée ; `/ui/pending` nomme l'exécuteur d'après les pairs locaux

### Requirement: Contrôle de la réponse humaine par l'exécuteur
L'exécuteur MUST n'accepter `human_answer` que d'un approbateur de la carte pour un Drop en `awaiting_approval`, refaire la validation et la recherche de secrets, livrer sans exécuter la capacité et écrire le reçu signé. Un refus MUST ne rien dire au demandeur du contenu refusé.

#### Scenario: AC: seul l'approbateur répond
<!-- openspec-guard:test="human answer (T4.3) > accepts a hand-written answer from a remote approver and from no one else" -->
- **WHEN** un pair qui n'est pas approbateur envoie `human_answer`, puis l'approbateur distant le fait, puis un nœud approbateur qui a sauté le contrôle envoie un secret
- **THEN** le premier est ignoré, seule la réponse de l'approbateur est livrée, et le secret est refusé par l'exécuteur avec un message qui n'en dit rien
