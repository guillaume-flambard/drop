# Preuves T4.0a

| Critère | Preuve |
|---|---|
| AC-0A-1 Vision, architecture, PRODUCT, AGENTS, contexte | `openspec/project/vision.md` et `architecture.md` résument le PRD et le TRD et y renvoient ; `openspec/config.yaml` cite `docs/product/` ; PRODUCT.md signale les écarts E2 et E5 ; AGENTS.md ne prétend plus qu'OpenRouter est le défaut. |
| AC-0A-2 README, GUIDE, ONBOARDING, AVANCEMENT | Onze affirmations fausses retirées (raccordement « à livrer », offre payante, quatre outils MCP au lieu de six, retrait de champs présenté comme possible dans le panneau, financement demandeur sans réserve, cas Figma présentés comme la démo, etc.) ; ajout de T4.14 à T4.16. |
| AC-0A-3 Site | `site/index.html`, `guide.html`, `avancement.html` alignés : positionnement, cible, promesse avec limite, échelle, trois modes de connexion, rien de payant ; huit affirmations fausses retirées ; `test/site.test.ts` vert. |
| AC-0A-4 Spec | Delta `product-foundation` (positionnement MODIFIED, documents produit ADDED) approuvé par Guillaume le 10 octobre 2026 (« oui, applique et commit »). |
| AC-0A-5 Vérité | Revue adverse : 48 affirmations vérifiées, 0 critique, 5 inexactitudes corrigées, plus preuve de notarisation archivée dans T3.4 ; zéro tiret cadratin ajouté. |

Vérification : `pnpm -s lint` vert ; `pnpm -r test` 353 tests verts ; `openspec validate --all --strict` 21 sur 21 ; `openspec-guard@0.3.0 check --require-selector --baseline --fail-on fail` vert, baseline sans ajout. `/review` : passe adverse dédiée, corrections revérifiées mécaniquement. `/cso` non applicable : aucun code.
