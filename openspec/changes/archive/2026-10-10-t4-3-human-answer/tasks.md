## 1. Tests d'abord

- [x] 1.1 Protocole : schéma et limites de la réponse humaine, reçu marqué, transition `approved → delivered`.
- [x] 1.2 Moteur : réponse livrée avec le même reçu, secret bloqué avant envoi, approbateur distant seul accepté ; route `POST /ui/answer`.
- [x] 1.3 Panneau : voie « Répondre moi-même », relecture avant envoi, registre visible.

## 2. Réalisation

- [x] 2.1 `packages/protocol` : `HumanAnswerSchema`, `HUMAN_ANSWER_OUTPUT_SCHEMA`, message `human_answer`, `answeredBy`, transition.
- [x] 2.2 `packages/node` : `checkHumanAnswer`, `engine.answer`, `onHumanAnswer`, livraison et reçu ; route API.
- [x] 2.3 Panneau : composition, fichier texte, relecture, brouillon conservé.
- [x] 2.5 Correctifs de la revue : destinataire réel nommé, contenu du fichier relu, refus UTF-8, recontrôle exécuteur sans fuite vers le demandeur, origine annoncée à l’agent demandeur, caractères de contrôle et de direction, 413, JWT linéaire, focus clavier, brouillons purgés.
- [x] 2.4 Recette réelle : deux nœuds, réponse à la main jusqu'au reçu.

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --all --strict`, openspec-guard avec sélecteurs et baseline sans ajout.
- [x] 3.2 `/review` (gstack) et `/cso` (la change touche `protocol` et `node`).
