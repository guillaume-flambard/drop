## MODIFIED Requirements

### Requirement: Qui paie le modèle
La config du Node SHALL porter `payer: 'requester' | 'owner'` pour ce qu'il exécute : défaut `requester` (D27) en profil `legacy`, `owner` en profil privé, où `requester` MUST être refusé par le schéma (D40). Un exécuteur en `payer: 'owner'` ignore la clé reçue et paie avec sa propre config.

#### Scenario: Le propriétaire paie
<!-- openspec-guard:test="the requester pays with a capped key (T2.3, D27) > an owner who pays ignores the key and the card says the cost is theirs" -->
- **WHEN** l'exécuteur est en `payer: 'owner'` et reçoit une demande avec une clé
- **THEN** la capacité tourne sans la clé et la carte indique `paidBy: 'owner'`

#### Scenario: AC: le propriétaire paie en profil privé
<!-- openspec-guard:test="configuration hygiene (T4.15) > makes the owner pay in the private profile and refuses a requester payer" -->
- **WHEN** une config privée omet `payer`, ou porte `payer: 'requester'`
- **THEN** la première est lue avec `payer: 'owner'` et la seconde est refusée

## ADDED Requirements

### Requirement: Profil par défaut privé
Le schéma de configuration MUST lire un `config.json` sans `profile` comme le profil privé que crée `drop init`, soumis aux mêmes contrôles. Un fichier `legacy` MUST porter `profile: 'legacy'`. `drop migrate-private` SHALL encore lire un fichier antérieur aux profils comme `legacy`.

#### Scenario: AC: fichier sans profil
<!-- openspec-guard:test="configuration hygiene (T4.15) > reads a configuration without a profile as the private profile drop init creates" -->
- **WHEN** une config ne porte pas de `profile`
- **THEN** elle est lue comme privée, refusée si elle n'en remplit pas les conditions, et une config `legacy` explicite reste acceptée

#### Scenario: AC: migration d'un fichier antérieur aux profils
<!-- openspec-guard:test="configuration hygiene (T4.15) > still migrates a pre-profile legacy configuration to the private profile" -->
- **WHEN** `drop migrate-private` lit un `config.json` écrit avant les profils
- **THEN** il le traite comme `legacy` et écrit une config privée payée par le propriétaire

### Requirement: Pairs et équipe en mode 0600
`peers.json` et `team.json` MUST être en mode `0600`. Une écriture MUST resserrer un fichier existant avant d'y poser le nouveau contenu, et le daemon MUST resserrer au démarrage ceux qu'une version antérieure a laissés plus ouverts.

#### Scenario: AC: fichiers des pairs et de l'équipe privés
<!-- openspec-guard:test="configuration hygiene (T4.15) > keeps peers.json and team.json owner-only, narrowing existing files" -->
- **WHEN** le Node crée ou réécrit `peers.json` ou `team.json`, y compris un fichier existant en `0644`, ou démarre avec un tel fichier
- **THEN** le fichier est en `0600` sous macOS et Linux, son contenu inchangé tant que rien n'y est écrit

### Requirement: Agents détectés nommables par le protocole
La liste des agents que le Node détecte et raccorde MUST être exactement celle que `requestedBy.agent` peut nommer, `other` excepté.

#### Scenario: AC: listes alignées
<!-- openspec-guard:test="configuration hygiene (T4.15) > detects exactly the agents the protocol can name on a consent card" -->
- **WHEN** on compare les agents détectés aux agents du protocole
- **THEN** les deux listes sont identiques, `other` excepté
