## 1. Documentation d'abord

- [x] 1.1 Lot B de `docs/research/2026-10-12-openwhispr.md`, specs `node` (« Contenu exact », « Bouton par défaut ») et `owner-app` (« Panneau accessible »), D84, D88, D97, PR #78 (codes de `/ui/decide`, `?request=`).
- [x] 1.2 WAI-ARIA APG (« Focusability of disabled controls ») et MDN (« ARIA live regions »), cités dans le design.

## 2. Tests d'abord

- [x] 2.1 Module pur : phrases des états, expiration réservée à l'attente, lecture des réponses, rapprochement (`packages/desktop-ui/test/consent-model.test.ts`).
- [x] 2.2 Carte : focus et annonce après décision, bouton bloqué focalisable, réponse illisible incertaine (`packages/desktop-ui/test/consent-card.test.tsx`).
- [x] 2.3 Espace : liste, flux SSE, compteur, décision (`packages/desktop-ui/test/workspace-requests.test.tsx`).
- [x] 2.4 Panneau : tests existants adaptés (résultat sur la carte).

## 3. Réalisation

- [x] 3.1 `src/consent/model.ts`, `card.tsx`, `use-consent-cards.ts`, `pending-list.tsx` ; `Composer` et `ReviewCard` déplacés.
- [x] 3.2 Panneau : onglet « Demandes » sur la liste partagée.
- [x] 3.3 Espace : page « Demandes », `/ui/pending`, `/ui/events`, compteur, région vivante unique ; statut HTTP dans `WorkspaceApiError`.
- [x] 3.4 Module généré regénéré ; `docs/product/UX_UI.md` à jour.

## 4. Vérification

- [x] 4.1 `pnpm -r lint && pnpm -r typecheck && pnpm -r test`, `build-desktop-ui.ts --check`, `openspec validate --strict`, openspec-guard, revue et revue de sécurité du diff.
