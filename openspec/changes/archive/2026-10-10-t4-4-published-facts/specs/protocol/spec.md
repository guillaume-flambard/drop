## ADDED Requirements

### Requirement: Fait publié signé
Un `Fact` SHALL porter un sujet (120 car.), au plus 8 mots-clés distincts sans virgule (40 car.), un énoncé (1 000 car.), une source (libellé de 200 car., lien https facultatif sans identifiants), une validité d’un an au plus, un public (`team` ou 1 à 50 pairs), `sensitivity: 'low'` et un état (`active` ou `retired`), sans caractère de contrôle, invisible ou de direction. Il MUST être signé par son propriétaire sur `drop-fact-v1|` suivi de son JSON canonique.

#### Scenario: AC: limites d'un fait
<!-- openspec-guard:test="published facts (T4.4) > accepts a fact within its limits and refuses an overlong, too long-lived, high or control-character one" -->
- **WHEN** un fait dépasse une limite, dure plus d'un an, se déclare `high` ou contient un caractère de contrôle
- **THEN** la validation échoue, alors qu'un fait dans les limites passe

#### Scenario: AC: signature d'un fait
<!-- openspec-guard:test="published facts (T4.4) > signs a fact and refuses it once a field changes or another key signed it" -->
- **WHEN** un champ du fait signé change, ou qu'une autre clé que celle du propriétaire l'a signé
- **THEN** la vérification échoue

### Requirement: Carte et sortie d'un fait
Un fait SHALL être annoncé par une carte `fact.f<factId en hex>` de version `1.<revision>.0`, titre = sujet, `keywords` (champ facultatif des cartes), `approval: 'auto_low'`, entrée vide. Seule la carte d'un fait MAY porter l'empreinte de `FACT_OUTPUT_SCHEMA`. Le `drop_result` MUST porter `{ kind: 'fact', fact, sig }` sous l'empreinte de `FACT_OUTPUT_SCHEMA`, et le reçu `answeredBy: 'fact'`.

#### Scenario: AC: fait servi sous le schéma fixe
<!-- openspec-guard:test="published facts (T4.4) > serves a fact without a decision, with a signed receipt marked fact" -->
- **WHEN** un pair du public demande un fait actif
- **THEN** il reçoit le fait signé sous l'empreinte de `FACT_OUTPUT_SCHEMA` et un reçu `answeredBy: 'fact'`

## MODIFIED Requirements

### Requirement: Transitions du cycle de vie d'un Drop
Les transitions SHALL suivre `proposed → awaiting_approval → (denied | expired | not_now)` et `awaiting_approval → approved → running → (failed | in_review) → delivered → receipted`. Une réponse humaine SHALL suivre `awaiting_approval → approved → (failed | delivered) → receipted`, sans `running` ni `in_review`. Un fait publié SHALL suivre `proposed → approved → delivered → receipted`, sans carte d'approbation.

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

#### Scenario: AC: chemin d'un fait publié
<!-- openspec-guard:test="published facts (T4.4) > allows proposed to approved for a published fact, never proposed to running" -->
- **WHEN** un fait publié est demandé
- **THEN** `proposed → approved` est permis et `proposed → running` reste refusé
