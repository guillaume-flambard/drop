## ADDED Requirements

### Requirement: Fichiers de campagne réservés au propriétaire
Le banc SHALL créer chacun de ses fichiers (plan, événements, configuration et journal du relais, journaux des nœuds, journaux et configurations plantés, rapports) en mode 0600, et resserrer à 0600 un fichier qu'une campagne précédente aurait laissé plus large dans un `--work-dir` réutilisé. Aucune écriture de `campaign.ts` MUST NOT contourner ces fonctions.

#### Scenario: AC: fichiers 0600 même réutilisés
<!-- openspec-guard:test="campaign files readable by their owner only (T4.26) > creates campaign files 0600 and narrows a file left wider by an earlier run" -->
- **WHEN** le banc écrit un fichier neuf, réécrit un rapport laissé en 0644, complète un journal d'événements laissé en 0666 et ouvre le journal du relais
- **THEN** chacun est en 0600 et garde le contenu attendu (macOS et Linux ; Windows ne garde que le bit lecture seule)

#### Scenario: AC: aucune écriture hors des fonctions réservées
<!-- openspec-guard:test="campaign files readable by their owner only (T4.26) > leaves no file write in the campaign that bypasses the owner-only helpers" -->
- **WHEN** on lit `campaign.ts`
- **THEN** il n'appelle ni `writeFileSync`, ni `appendFileSync`, ni `openSync`, ni `createWriteStream`
