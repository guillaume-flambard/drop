## 1. Documentation d'abord

- [x] 1.1 Fragment d'URL hors requête (RFC 9110, section 7.1) et hors `Referer` (Fetch Standard) ; CSP par empreinte ; page Tauri 2 « Deep Linking » (livraison des liens par système, plugin `single-instance`).
- [x] 1.2 Relecture du code existant : invitation et ticket d'admission (T2.1), carte de confirmation (T4.14), bootstrap de l'app, politique de destinations du profil privé.
- [x] 1.3 D89 dans `docs/DECISIONS.md`.

## 2. Tests d'abord

- [x] 2.1 Protocole : signature, dates, codes piégés, lecture d'un lien, relais admissible (`packages/protocol/test/invite.test.ts`).
- [x] 2.2 Node : relais adopté de bout en bout avec un vrai relais et deux daemons, relais gardé ou refusé, refus à codes stables, invitations après redémarrage des deux côtés (`packages/node/test/join.test.ts`).
- [x] 2.3 Site : CSP de `/join`, aucun envoi, affichage, système détecté, fragment retiré, liens inutilisables (`test/join-page.test.ts`).
- [x] 2.4 App : `drop://join` (`cargo test`, `test/desktop-join-link.test.ts`).

## 3. Réalisation

- [x] 3.1 `packages/protocol` : invitation signée, `verifyInvite`, `inviteCodeFrom`, `joinLink`, `relayUrlAllowed`, codes d'erreur.
- [x] 3.2 `packages/node` : moteur (`previewInvite`, `join`, invitations persistées), daemon (relais adopté), configuration (`switchRelay`, relais DNS du profil privé, `joinPage`), API, CLI (`invite --link`, `join`).
- [x] 3.3 `packages/relay` : `RelayClient.switchUrl`.
- [x] 3.4 `apps/desktop` : liens `drop://join` seulement.
- [x] 3.5 `site/join.html`, `scripts/site.ts`.
- [x] 3.6 Mon espace : lien https et « J'ai reçu une invitation » ; ressources recompilées.
- [x] 3.7 `docs/ONBOARDING.md`, `docs/GUIDE.md`, `docs/TASKS.md`.

## 4. Vérification

- [x] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `node scripts/build-desktop-ui.ts --check`, `cargo test`, `openspec validate --all --strict`, openspec-guard.

Reste hors de cette change : noms des fichiers de release (aucune release), plugin `single-instance` sous Windows et Linux, panneau React (« Inviter » avec le lien https, « Connecter mes agents » après « Rejoindre »), déploiement de la page et du relais sur le VPS (T4.6a). Voir la ligne T4.25.
