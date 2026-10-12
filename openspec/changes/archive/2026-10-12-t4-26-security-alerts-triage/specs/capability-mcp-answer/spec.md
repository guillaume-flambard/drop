## ADDED Requirements

### Requirement: Réponse finale lue en temps linéaire
La lecture de la réponse finale du modèle SHALL retirer les blocs `<think>…</think>` fermés et garder un bloc non fermé, en un temps linéaire dans la longueur de la réponse, quelle qu'elle soit.

#### Scenario: AC: réponse pleine de balises non fermées
<!-- openspec-guard:test="configuration and reply parsing in linear time (T4.26) > drops closed reasoning blocks and stays linear on a reply full of unclosed <think>" -->
- **WHEN** le modèle répond par 100 000 `<think>` sans fermeture, ou par un objet JSON entouré de blocs de raisonnement
- **THEN** la première réponse est lue en moins de 1,5 s, sans réponse finale ; la seconde donne l'objet hors des blocs fermés
