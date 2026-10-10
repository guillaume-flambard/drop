## ADDED Requirements

### Requirement: Répondre moi-même dans le panneau
La carte de décision SHALL offrir « Répondre moi-même », qui ouvre une zone de texte et le choix d'un fichier texte, sans masquer ce que le demandeur recevra ou ne recevra jamais. Un brouillon MUST survivre aux rafraîchissements, et un refus MUST s'afficher avec son code traduit. Un fichier qui n'est pas en UTF-8 MUST être refusé.

#### Scenario: AC: réponse relue avant envoi
<!-- openspec-guard:test="menu bar panel (T4.3) > offers to answer by hand, keeps the ledger visible and reviews the answer before sending" -->
- **WHEN** le propriétaire choisit « Répondre moi-même », écrit puis relit sa réponse
- **THEN** le registre reste visible, la relecture montre le texte et le contenu du fichier qui partiront, et seul « Envoyer » appelle `POST /ui/answer`

### Requirement: Relecture fidèle de la réponse humaine
Avant l'envoi, le panneau MUST montrer exactement ce qui partira, contenu du fichier compris, et nommer le premier destinataire réel d'après les pairs locaux quand la capacité vit sur un autre Node.

#### Scenario: AC: destinataire réel nommé
<!-- openspec-guard:test="menu bar panel (T4.3) > offers to answer by hand, keeps the ledger visible and reviews the answer before sending" -->
- **WHEN** la capacité vit sur le Node d'un autre pair
- **THEN** la relecture dit que la réponse part chez ce pair, nommé d'après les pairs locaux, pour le demandeur
