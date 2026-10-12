## Why

La lecture d'OpenWhispr du 12 octobre 2026 (`docs/research/2026-10-12-openwhispr.md`, lot B) a montré ce qui manque à la carte de consentement de drop pour être au niveau de leur `ApprovalCard` :

- une carte décidée s'efface en 0,16 s et un bandeau dit « Demande autorisée une fois. » : la carte ne dit jamais ce qui est arrivé aux données, et un échec de `/ui/decide` (réseau, 500, corps illisible) s'affiche comme un refus générique, alors que la décision a pu partir ;
- la carte n'a pas d'état nommé : rien ne distingue « décision en cours », « expirée » ou « incertaine » ;
- pendant l'envoi, les boutons sont `disabled` : ils sortent de l'ordre du clavier et le focus tombe sur le corps de la page ; après la décision, il va sur un bandeau et non sur la carte ;
- la fenêtre « Ton espace » ne sait pas décider : elle n'appelle jamais `/ui/pending`, n'écoute pas `/ui/events` et se rafraîchit à la main.

## What Changes

- **Module pur `src/consent/model.ts`** dans `packages/desktop-ui` : six états nommés (en attente, décision en cours, autorisée, refusée, expirée, incertaine), la phrase de chacun sur les données (« Rien n'a été envoyé à Julie. »), la lecture de la réponse du Node (une réponse illisible, absente ou en erreur serveur donne « incertaine », jamais « refusée »), l'expiration réservée à une carte en attente, et le rapprochement avec la liste du Node.
- **Carte React purement visuelle `src/consent/card.tsx`**, partagée par le panneau et l'espace : contenu et ordre inchangés tant que la demande attend (spec node « Contenu exact »), puis l'état et sa phrase à la place du compte à rebours et des boutons, avec « Masquer ».
- **Accessibilité** : une seule région vivante polie par surface pour les cartes, présente dès le premier rendu ; le focus va sur la carte après la décision ; un bouton bloqué pendant l'envoi reste focalisable (`aria-disabled`) et porte sa raison (`aria-describedby`).
- **Liste partagée `src/consent/pending-list.tsx`** (cartes de décision, « Répondre moi-même », cartes de relecture), reprise par l'onglet « Demandes » du panneau.
- **« Ton espace »** gagne une page « Demandes » : la liste des demandes en attente, le flux SSE `/ui/events`, un compteur dans la navigation, et la région vivante unique.
- `WorkspaceApiError` porte le statut HTTP, pour distinguer « n'attendait plus » (404) d'une erreur serveur.

## Capabilities

### Modified Capabilities

- `node` : la carte de consentement gagne ses états nommés ; « Contenu exact » précise qu'il vaut pour une demande en attente.
- `owner-app` : carte accessible (région unique, focus, bouton bloqué), demandes dans « Ton espace », résultat d'une décision annoncé sur la carte dans le panneau.

## Non-goals

- Changer `/ui/decide` côté Node : le code `E_EXPIRED` vient de T4.30 (PR #78) ; la carte le lit s'il est là et lit « n'attendait plus » sinon.
- La carte de relecture (`ReviewCard`) et ses états : inchangée, déplacée seulement.
- Les questions envoyées (« Mes questions », état `unconfirmed` de T4.39) : hors de la carte de consentement.
- La recette VoiceOver et WebView réelle : seconde partie de T4.24.

## Impact

`packages/desktop-ui` (nouveau dossier `src/consent/`, `src/panel/requests.tsx`, `src/App.tsx`, `src/api.ts`, `src/types.ts`, nouvelle vue `src/views/requests.tsx`, tests), `packages/node/src/workspace-assets.generated.ts` (regénéré), `docs/product/UX_UI.md`, specs `node` et `owner-app`.
