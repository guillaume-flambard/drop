## MODIFIED Requirements

### Requirement: Clé du demandeur
Quand une clé plafonnée est fournie, la capacité MUST conserver l’URL et le modèle du propriétaire. Elle MUST refuser un financement incompatible avant tout appel au serveur ou au modèle. Un financement compatible utilise le minimum des budgets.

#### Scenario: Modèle payé par le demandeur
<!-- openspec-guard:test="mcp.answer (T2.2) > runs on the requester capped key when the requester pays (D27)" -->
- **WHEN** la demande porte une clé plafonnée compatible avec le fournisseur et le modèle du propriétaire
- **THEN** ce modèle est appelé avec cette clé et le minimum des deux budgets

## ADDED Requirements

### Requirement: Connexions MCP privées
La connexion et la découverte des outils MCP MUST appliquer la politique privée, y compris aux serveurs référencés dans les fichiers des agents. Un processus stdio non isolé MUST être refusé avant son lancement.

#### Scenario: AC: contrôle avant découverte
<!-- openspec-guard:test="private adapters > refuses HTTP discovery outside policy and refuses stdio before spawning it" -->
- **WHEN** un serveur HTTP hors politique ou un serveur stdio non isolé est découvert
- **THEN** aucune connexion ni exécution de ce serveur n’a lieu.
