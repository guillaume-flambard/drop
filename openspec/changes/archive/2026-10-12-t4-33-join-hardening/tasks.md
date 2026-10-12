## 1. Documentation d'abord

- [x] 1.1 Node.js 24, `tls.createSecureContext`, option `ca` : la liste par défaut est remplacée, pas complétée.
- [x] 1.2 Relecture de T4.23 (change archivée, D95, commit de revue `30f95c8`) et du code : `switchRelay`, `relayPlan`, `adopt`, `RelayClient.switchUrl`, domaine `drop-policy-v1|`, `DEFAULT_RELAY` de la coque.

## 2. Tests d'abord

- [x] 2.1 Protocole : domaine `drop-invite-v1|`, `E_LOCKED` et `E_CONFLICT` dans `ERROR_CODES` (`packages/protocol/test/invite.test.ts`).
- [x] 2.2 Node : relais réglé à la main gardé, origines conservées et relais adopté hors des destinations, vraie cause `E_LOCKED` et `E_CONFLICT` ; tests de T4.23 adaptés au relais par défaut (`packages/node/test/join.test.ts`).
- [x] 2.3 Relais : autorité `ca` gardée pour le même hôte seulement (`packages/relay/test/policy.test.ts`).
- [x] 2.4 Coque : `DEFAULT_RELAY` de la coque égal à `DEFAULT_RELAY_URL` du Node (`test/desktop-join-link.test.ts`).

## 3. Réalisation

- [x] 3.1 `packages/protocol` : domaine de signature, codes `E_LOCKED` et `E_CONFLICT`.
- [x] 3.2 `packages/node` : `DEFAULT_RELAY_URL`, `relayAdopted`, `switchRelay` sans toucher aux origines, `DropError` du verrou et du conflit, `relayPlan` et `adoptRelay` du daemon, `adopt` du moteur, messages de l'API, `drop init`.
- [x] 3.3 `packages/relay` : `switchUrl` abandonne `ca` pour un autre hôte.
- [x] 3.4 `docs/ONBOARDING.md` : adoption depuis le relais par défaut, refus `E_LOCKED` et `E_CONFLICT`.

## 4. Vérification

- [x] 4.1 `pnpm -r lint && pnpm -r typecheck && pnpm -r test`, `openspec validate --strict`, openspec-guard, revue et revue de sécurité du diff.
