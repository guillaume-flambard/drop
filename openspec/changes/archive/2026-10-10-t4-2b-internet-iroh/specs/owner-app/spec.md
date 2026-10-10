## ADDED Requirements

### Requirement: Choix du relais Internet
« Mes outils » SHALL proposer « Connexion par Internet » : désactivée (par défaut), direct seulement, mon relais ou celui de l'équipe (adresse), ou relais de test de n0 signalé comme tiers qui voit les adresses IP. L'état MUST dire si le programme est prêt et expliquer un échec.

#### Scenario: AC: choix du relais
<!-- openspec-guard:test="internet (T4.2b) > lets the owner choose no relay, their own relay or the n0 test relays, flagged as third party" -->
- **WHEN** le propriétaire choisit son relais, puis les relais de test de n0
- **THEN** la configuration garde son choix, et le panneau signale n0 comme un tiers de test qui voit les adresses IP
