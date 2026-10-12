## 1. Relevé et documentation

- [x] 1.1 Liste vivante des 39 alertes (`gh api .../code-scanning/alerts?state=open`), message et emplacement de chacune.
- [x] 1.2 Sources : requête CodeQL des fichiers temporaires, Node 24 (`child_process`, constantes `fs`), Scorecard
      `docs/checks.md`, configuration d'OSV-Scanner, avis OSV des quatre vulnérabilités (voir `design.md`).
- [x] 1.3 Mesure de l'ancien code sur les formes signalées par CodeQL (0,2 à 2 s à 20 000 caractères).

## 2. Tests d'abord

- [x] 2.1 `packages/capabilities/test/linear-parsing.test.ts` : comportement inchangé et durée bornée pour la réponse
      du modèle, le TOML de Codex, le YAML de goose ; lecture d'une configuration par descripteur. Lancé sur l'ancien
      code : comportements verts, durées rouges (39 s, 28 s, 5 s).
- [x] 2.2 `packages/blocked-observer/test/linear-noise.test.ts` : heredocs et commandes JSON, mêmes vérifications
      (86 s et 69 s sur l'ancien code) ; date d'un log Codex.
- [x] 2.3 `packages/node/test/security-alerts.test.ts` : publication sous un chemin refusée (rouge sans la correction),
      métacharactères d'un raccourci Windows gardés entre guillemets.
- [x] 2.4 `packages/simulation/test/owner-files.test.ts`, `test/site.test.ts` (release par descripteur),
      `test/pinned-images.test.ts`.

## 3. Réalisation

- [x] 3.1 `tool-loop.ts`, `agents.ts`, `clients.ts`, `noise.ts` : lectures en une passe.
- [x] 3.2 `clients.ts` (`readConfigText`), `codex.ts`, `scripts/site.ts` : ouverture puis contrôle par le descripteur.
- [x] 3.3 `simulation/src/owner-files.ts` et appels de `campaign.ts`.
- [x] 3.4 `home.ts` : `publish` valide l'identifiant.
- [x] 3.5 Dockerfile de preuve épinglés, Dependabot étendu, `osv-scanner.toml` avec raisons.

## 4. Vérification

- [x] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --strict`, openspec-guard.
- [x] 4.2 Revue du diff (`review`) et revue de sécurité (`cso`).

Reste hors de cette change : le rejet des alertes dans GitHub (Guillaume, après relecture de la PR), et la confirmation
par la prochaine analyse CodeQL et Scorecard que les alertes corrigées se ferment.
