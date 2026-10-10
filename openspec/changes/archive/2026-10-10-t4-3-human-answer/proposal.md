## Why

D49 (10 octobre 2026) : un propriétaire sans agent doit pouvoir répondre lui-même à une question reçue. Aujourd'hui, la seule réponse possible est l'exécution de la capacité ; une personne non technique qui connaît la réponse doit refuser ou laisser tourner un outil.

Questions tranchées avec Guillaume le 10 octobre 2026 (« oui aux 6 ») : texte et fichiers texte seulement ; 8 000 caractères et 128 Kio sans découpage ; message `human_answer` de l'approbateur vers l'exécuteur ; reçu marqué `answeredBy: 'human'` ; sortie `{ kind: 'human', text, file? }` sous un schéma fixe ; secret détecté bloqué avant l'envoi, jamais réparé. Décision D64.

## What Changes

- **Protocole** : schéma `HumanAnswer` (texte, fichier texte facultatif, limites), message `human_answer`, champ facultatif `answeredBy` du reçu, transition `approved → delivered` réservée à la réponse humaine.
- **Node** : `engine.answer(dropId, answer)` sur la carte d'approbation ; validation et contrôle de secrets chez l'approbateur puis chez l'exécuteur ; livraison sans exécuter la capacité, avec le même reçu signé ; route `POST /ui/answer`.
- **Panneau** : quatrième voie « Répondre moi-même » sur la carte de décision, zone de texte et choix d'un fichier texte, relecture de ce qui partira avant « Envoyer », registre « recevra / ne recevra jamais » visible pendant la rédaction, brouillon gardé pendant les rafraîchissements.

## Capabilities

### Modified Capabilities

- `protocol` : réponse humaine, message `human_answer`, reçu marqué, transition directe.
- `node` : réponse à la main par l'approbateur.
- `owner-app` : « Répondre moi-même » dans le panneau.

## Non-goals

- Fichiers binaires (PDF, images) et découpage au-delà de 128 Kio : plus tard, avec un contrôle propre.
- Agent fourni par drop qui répond (T4.8), faits publiés (T4.4).
- Réponse humaine depuis la CLI ou un serveur MCP : panneau et API locale seulement.
- Aucune modification de l'interface du demandeur : il reçoit `drop_result` comme aujourd'hui.

## Impact

`packages/protocol` (schéma, message, reçu, cycle de vie), `packages/node` (moteur, API, panneau). Les reçus marqués `answeredBy` ne se vérifient pas sur un Node antérieur (accepté : seul le prototype tourne).
