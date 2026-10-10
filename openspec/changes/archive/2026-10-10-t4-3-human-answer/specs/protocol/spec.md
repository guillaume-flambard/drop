## ADDED Requirements

### Requirement: Réponse humaine
Une réponse écrite à la main SHALL être un `HumanAnswer` : `kind: 'human'`, `text` de 8 000 caractères au plus, `file` facultatif (`name`, `mediaType` parmi `text/plain`, `text/markdown`, `text/csv`, `application/json`, `content` UTF-8 de 128 Kio au plus, sans caractère de contrôle C0 ou C1 hors tabulation et fins de ligne ; un nom sans caractère de contrôle ni de direction). Il MUST y avoir un texte non vide ou un fichier, et le JSON de la réponse MUST tenir en 160 Kio.

#### Scenario: AC: limites de la réponse humaine
<!-- openspec-guard:test="human answer (T4.3) > accepts a text or text-file answer within the limits and refuses an empty, oversized or non-text one" -->
- **WHEN** une réponse est vide, dépasse 8 000 caractères, porte un fichier de plus de 128 Kio, un fichier binaire ou un nom piégé
- **THEN** la validation échoue, alors qu'un texte seul ou un fichier texte dans les limites passe

#### Scenario: AC: la plus grande réponse tient dans une enveloppe
<!-- openspec-guard:test="human answer (T4.3) > fits the largest accepted answer into a sealed envelope" -->
- **WHEN** la plus grande réponse acceptée est scellée dans `human_answer` puis dans `drop_result`
- **THEN** chaque enveloppe reste sous `MAX_ENVELOPE_BYTES`

### Requirement: Message human_answer
Le message `human_answer` SHALL porter `dropId`, `answer: HumanAnswer` et `decidedAt`, et aller de l'approbateur à l'exécuteur à la place d'`approval_decision`. Le `drop_result` qui en découle MUST porter l'empreinte du schéma fixe `HUMAN_ANSWER_OUTPUT_SCHEMA`, pas celle du schéma de sortie de la capacité, et le demandeur MUST la présenter comme écrite à la main d'après cette seule empreinte.

#### Scenario: AC: réponse livrée sous le schéma fixe
<!-- openspec-guard:test="human answer (T4.3) > delivers a hand-written answer with the same consent and a receipt marked human" -->
- **WHEN** l'approbateur répond à la main à une demande en attente
- **THEN** le demandeur reçoit `drop_result` avec la réponse et l'empreinte de `HUMAN_ANSWER_OUTPUT_SCHEMA`

#### Scenario: AC: origine annoncée au demandeur
<!-- openspec-guard:test="human answer (T4.3) > presents a hand-written answer as such, from the hash of its fixed schema only" -->
- **WHEN** un agent demandeur lit une réponse humaine, puis le même contenu sous le schéma d'une capacité
- **THEN** seule la première est présentée comme écrite à la main

### Requirement: Reçu d'une réponse humaine
Un `Receipt` MAY porter `answeredBy` parmi `'capability'` et `'human'`, couvert par la signature. Le reçu d'une réponse humaine MUST porter `answeredBy: 'human'`, `decision: 'allow_once'`, `reviewed: true` et aucun appel d'outil.

#### Scenario: AC: reçu marqué humain
<!-- openspec-guard:test="human answer (T4.3) > signs and verifies a receipt that says a human answered" -->
- **WHEN** un reçu portant `answeredBy: 'human'` est signé puis modifié en `'capability'`
- **THEN** le reçu signé se vérifie et le reçu modifié ne se vérifie plus

## MODIFIED Requirements

### Requirement: Transitions du cycle de vie d'un Drop
Les transitions SHALL suivre `proposed → awaiting_approval → (denied | expired | not_now)` et `awaiting_approval → approved → running → (failed | in_review) → delivered → receipted`. Une réponse humaine SHALL suivre `awaiting_approval → approved → (failed | delivered) → receipted`, sans `running` ni `in_review`.

#### Scenario: Chemin nominal
- **WHEN** un Drop est autorisé, exécuté puis livré
- **THEN** il passe par `proposed`, `awaiting_approval`, `approved`, `running`, `delivered`, `receipted`

#### Scenario: Transition interdite
- **WHEN** un Drop en `awaiting_approval` tenterait de passer directement à `running`
- **THEN** la transition est refusée

#### Scenario: AC: chemin d'une réponse humaine
<!-- openspec-guard:test="human answer (T4.3) > allows approved to delivered for a hand-written answer, never awaiting_approval to delivered" -->
- **WHEN** un Drop approuvé reçoit une réponse humaine
- **THEN** `approved → delivered` et `approved → failed` sont permis, `awaiting_approval → delivered` reste refusé
