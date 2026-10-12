## Context

La carte de consentement vit aujourd'hui dans `packages/desktop-ui/src/panel/requests.tsx` (`ApprovalCard`), rendue par le seul panneau (D97). Après « Autoriser une fois », le panneau envoie `POST /ui/decide`, efface la carte en 0,16 s et met le focus sur un bandeau. Un échec passe par `failureText` et un bandeau d'alerte. « Ton espace » (`src/App.tsx`) ne lit ni `/ui/pending` ni `/ui/events`.

Ce que le Node répond à `/ui/decide` (lu dans `packages/node/src/api.ts` et `engine.ts` sur `main`) : 200 `{ ok: true }` quand la décision est prise ; 404 `{ ok: false }` quand la demande n'attend plus (inconnue, déjà tranchée, relecture). `engine.decide` retire la carte de la boîte **avant** d'envoyer la décision : si l'envoi lève, la réponse est un 500 alors que la carte n'attend plus et que la décision a pu partir. T4.30 (PR #78, fusionnée pendant cette change) ajoute à ce 404 un code `E_NOT_PENDING` ou `E_EXPIRED`.

Sources lues :

- `docs/research/2026-10-12-openwhispr.md`, lot B (lecture statique d'OpenWhispr au commit `5f9a88b`, `ApprovalCard.tsx`, `connectorApprovalStore.ts`).
- WAI-ARIA Authoring Practices, « Keyboard Interface », section « Focusability of disabled controls » (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/, lue le 12 octobre 2026) : un contrôle peut transmettre un état inactif en restant focalisable, par `aria-disabled="true"`.
- MDN, « ARIA live regions » (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions, lue le 12 octobre 2026) : « Establish the live region before updating its content » ; le plus sûr est de la mettre dans le balisage initial.
- Code : `packages/desktop-ui/src/panel/*`, `src/App.tsx`, `src/api.ts`, `packages/node/src/api.ts` (`/ui/events` accepte `?token=`), PR #78 (`notification-entry.ts` cherche `data-focus="<id>:not_now"`).

## Goals / Non-Goals

**Goals :** une carte qui dit toujours vrai sur les données ; une seule carte pour le panneau et l'espace ; l'espace sait décider.

**Non-Goals :** changer les routes du Node ; donner des états à la carte de relecture ; la recette VoiceOver réelle (T4.24).

## Decisions

1. **Six états, deux variantes nommées.** `pending`, `deciding`, `authorized` (`via: allow_once | answer`), `refused` (`decision: deny | not_now`), `expired`, `uncertain` (`reason: unreadable | not_pending`). « Pas maintenant » est un refus pour les données (le demandeur reçoit `E_NOT_NOW`, rien ne part) : il reste dans `refused`, nommé « Pas maintenant » comme le bouton et comme l'état des questions envoyées. Une réponse à la main est une autorisation limitée à cette réponse : « Répondue ».
2. **Phrases au futur pour ce qui part.** `engine.send` peut garder une enveloppe dans la file hors ligne : « envoyée » mentirait (même raison que T4.39). L'autorisation dit « Seul le résultat de cette demande partira vers Julie. », la réponse « Seule ta réponse partira vers Julie. ». Les refus et l'expiration disent « Rien n'a été envoyé à Julie. », vrai par construction : rien ne part sans `allow_once` ni réponse.
3. **Lecture de la réponse.** 200 avec `ok: true` : décision confirmée. 404 ou 409 : `E_EXPIRED` donne « expirée », sinon « incertaine, n'attendait plus » (tranchée ailleurs ou expirée : on ne sait pas ce qui est parti). 5xx, échec réseau, 200 sans `ok: true` : « incertaine », car `engine.decide` a pu retirer la carte et envoyer. Autre 4xx (401 jeton, 400, 413) : refusé avant le moteur, la carte redevient en attente avec la raison traduite. Pour « Répondre moi-même », un 4xx garde le comportement existant (brouillon rendu, bandeau avec le code).
4. **Rapprochement avec la liste du Node.** Le Node a le dernier mot sur « attend encore » : une carte incertaine qu'il liste encore redevient en attente (« Ta décision n'a pas été appliquée : la demande attend toujours. »). Une décision confirmée ou une expiration est finale, pour qu'une liste périmée ne ressuscite pas une carte. Une carte en attente qui disparaît de la liste sans décision locale (tranchée par la notification ou la CLI) disparaît, comme avant : la surface ne sait pas ce qui s'est passé et n'invente pas d'état. La région vivante le dit (« N'attend plus ta décision ici : … ») et, si la carte avait le focus, la liste le reprend.
5. **Carte décidée gardée jusqu'à « Masquer ».** Faire disparaître la carte retirerait au lecteur d'écran ce qu'il vient d'entendre et l'objet du focus. Le compteur ne compte que les demandes qui attendent.
6. **Une région vivante par surface pour les cartes.** Le panneau garde sa région d'annonces (déjà présente dès le rendu) et sa région d'état de connexion, exigée par « Panneau accessible » : la règle porte sur les cartes, qui n'en portent aucune. L'espace gagne une région polie dès le rendu ; son bandeau de résultat perd `role="status"` et passe par cette région. Les alertes d'erreur (`role="alert"`) restent.
7. **Focus.** Après une décision, `focusTo('<id>:card')` sur l'article (`tabIndex=-1`), qui reste dans le DOM quand les boutons partent. Pendant l'envoi, les boutons restent rendus avec `aria-disabled` et `aria-describedby` vers la raison ; le gestionnaire ne fait rien si l'état n'est pas « en attente ». `data-focus="<id>:not_now"` est gardé pour T4.30.
8. **Découpage.** `src/consent/model.ts` (pur), `src/consent/card.tsx` (visuel, sans API ni contexte), `src/consent/use-consent-cards.ts` (états, appel de `/ui/decide`, annonce, focus), `src/consent/pending-list.tsx` (liste partagée, avec `Composer` et `ReviewCard` déplacés depuis le panneau). La liste lit les actions de surface par `PanelContext` ; l'espace fournit le sien.
9. **Espace.** `/ui/pending` et `/ui/outbound` ne sont lus que par une relecture légère, ordonnée par un compteur, au chargement, à « Actualiser » et à chaque événement de `/ui/events` : une lecture plus ancienne n'écrase jamais une plus récente (sinon une carte incertaine pourrait revenir « en attente » sur une liste périmée), un échec garde la liste affichée, et les formulaires des autres pages ne sont pas réinitialisés. Les brouillons de réponse vivent dans l'état de la liste.

## Risks / Trade-offs

- [PR #78 touchait aussi `PanelApp.tsx`, la spec node et le module généré] → fusionnée : exigences ajoutées des deux côtés, module regénéré, test d'arrivée de T4.30 vert sur la liste partagée.
- [Le Node émet `change` à chaque tick] → l'espace relit `/ui/pending` et `/ui/outbound` à chaque événement, comme le panneau déjà ; local, sans réseau.
- [Recette VoiceOver non faite] → tests en happy-dom seulement ; la recette reste dans T4.24.
