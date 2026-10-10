## MODIFIED Requirements

### Requirement: Protection contre le rejeu
Une enveloppe dont l'`id` a déjà été vu MUST être rejetée avec `E_REPLAY` ; le cache des `id` vus SHALL couvrir 30 min. L'`id` d'un expéditeur inconnu MUST n'être retenu qu'une fois sa demande d'appairage acceptée ; une liaison ne le retient pas, car sa session ne s'accepte qu'une fois. Un inconnu refusé n'occupe aucune place.

#### Scenario: Enveloppe rejouée
<!-- openspec-guard:test="protocol contract > remembers an envelope id for 30 minutes" -->
- **WHEN** la même enveloppe est reçue deux fois dans les 30 min
- **THEN** la seconde est rejetée avec `E_REPLAY`

#### Scenario: AC: un inconnu ne remplit pas le cache
<!-- openspec-guard:test="replay quota (T4.2d) > keeps unknown senders out of the replay cache until their pairing is accepted" -->
- **WHEN** pendant une invitation, un inconnu envoie plus d'enveloppes que le cache n'a de places, sans jeton valide, puis qu'un pair connu envoie une enveloppe
- **THEN** les premières sont refusées avec `E_UNKNOWN_PEER` sans être retenues, l'enveloppe du pair passe, et une demande d'appairage acceptée est retenue puis refusée si elle revient

#### Scenario: AC: la passerelle reste disponible
<!-- openspec-guard:test="replay quota (T4.2d) > keeps the gateway replay cache empty for envelopes without a pending session" -->
- **WHEN** un nœud non lié envoie à la passerelle des enveloppes sans session en attente, des liaisons répétées pour une même session, puis une liaison valide deux fois
- **THEN** aucune n'est retenue dans le cache, une session n'est revendiquée qu'une fois, et la liaison valide n'est accordée qu'une fois

#### Scenario: AC: purge bornée
<!-- openspec-guard:test="replay quota (T4.2d) > purges only up to the first live entry and never counts an expired one as seen" -->
- **WHEN** le cache contient des entrées expirées puis des entrées valides, que l'heure a reculé après une inscription, ou qu'elle a sauté en avant puis est revenue
- **THEN** la purge retire les expirées du début sans parcourir les valides, une entrée expirée n'est jamais comptée comme vue, et un cache plein est balayé en entier avant tout refus
