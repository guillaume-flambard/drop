## MODIFIED Requirements

### Requirement: Financement par le demandeur
`drop_request` MAY porter `funding: { kind: 'capped_key', baseUrl, apiKey, maxUsd (≤ 50), model? }` : une clé de modèle
créée pour cette seule demande et plafonnée à `maxUsd` (D27). Elle voyage dans l'enveloppe chiffrée vers l'exécuteur
seulement ; elle MUST NOT figurer dans `approval_request`, un reçu, un log ou un fichier. Le financement MUST NOT remplacer la destination ni le modèle choisis par le propriétaire. La carte de consentement
MUST dire qui paie (`paidBy: 'owner' | 'requester'`).

#### Scenario: Clé visible de l'exécuteur seulement
<!-- openspec-guard:test="the requester pays with a capped key (T2.3, D27) > sends the key to the executor only, shows who pays on the card, and deletes the key when the drop ends" -->
- **WHEN** Guillaume demande une capacité avec une clé plafonnée à 0,10 $
- **THEN** l'exécution reçoit la clé, la carte de l'approbateur affiche « Coût max : 0,10 $, payé par Guillaume » sans la clé
- **AND** aucun reçu ne contient la clé, et le demandeur supprime la clé quand la demande se termine


## ADDED Requirements

### Requirement: Financement incompatible refusé
En profil privé, un financement dont le fournisseur ou le modèle diffère du choix du propriétaire MUST être refusé sans appel réseau et sans journaliser sa clé.

#### Scenario: AC: non substitution du fournisseur
<!-- openspec-guard:test="private network > rejects incompatible funding without disclosing its key or replacing owner settings" -->
- **WHEN** une demande finance une autre URL ou un autre modèle
- **THEN** l’exécution échoue sans contacter ce fournisseur ni divulguer la clé.


### Requirement: Refus du financement non sollicité
En profil privé payé par le propriétaire, un financement reçu MUST être refusé avant consentement et exécution ; aucune clé reçue ne remplace celle du propriétaire.

#### Scenario: AC: financement non sollicité
<!-- openspec-guard:test="the requester pays with a capped key (T2.3, D27) > refuses unsolicited funding in an owner-paid private profile before consent" -->
- **WHEN** une demande financée arrive dans un profil privé payé par le propriétaire
- **THEN** elle échoue en E_DENIED sans carte d’accord ni utilisation de la clé
