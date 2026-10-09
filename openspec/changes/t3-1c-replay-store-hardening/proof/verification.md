# Vérification T3.1c

## Source et plan

Intention : `proposal.md`. Exigences et critères : `specs/node/spec.md` et `specs/protocol/spec.md`. Conception : `design.md`. Graphe fini : `tasks.md` et `state.json`. Le constat CSO initial de T3.1b est `369ec22b77cbf3bf1de4e4b432896a67` dans le run `1791554996421-68b812ec9550df5c`.

## Couverture

Applicables : comportement, erreurs, persistance du marqueur anti-rejeu, intégrité, concurrence, idempotence, autorisation du pair, confidentialité, sécurité, performance mémoire, réseau hors ligne, API, diagnostics, tests unitaires/intégration, build TypeScript, documentation. Non applicables à cette change : UX visuelle, accessibilité, packaging, déploiement, migration de fichier.

## Preuves acquises le 9 octobre 2026

- `pnpm -r lint` : réussi après correction du formatage de `funding.ts`.
- `pnpm -r typecheck` : réussi.
- `pnpm -r test` : 34 fichiers et 322 tests réussis. Une passe intermédiaire a révélé un test E2E synchronisé trop tôt ; il attend maintenant explicitement l'état d'approbation avant d'injecter un statut prématuré.
- `openspec validate t3-1c-replay-store-hardening --strict` : réussi ; `openspec validate --specs --strict` : 16 specs réussies.
- `openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail` : réussi, 415 critères, 138 liés à un test, 19 exclus, 258 échecs historiques gelés. `--update-baseline` : +0, -0.
- Contre-vérification indépendante à deux axes : elle a révélé une collision des cartes, une perte de révocation après échec fournisseur et deux courses de concurrence sur le plafond des clés et le vidage de file. Des tests rouges puis verts couvrent les corrections. Les deux relectures finales ne trouvent plus de P0/P1 dans le diff examiné ; elles restent limitées à une lecture statique et des tests locaux. Un P2 de rétention du snapshot de file a ensuite été corrigé en ne gardant que les numéros d'ordre des enveloppes. `git diff --check` réussit.

## Preuves encore requises

Le nouvel audit CSO statique couvre le diff T3.1c entier jusqu'au commit `ea8ce27` : run `1791557865736-082622a35df52318`, terminé avec `completeness:partial` et aucun constat étayé dans le périmètre examiné. Il retrace l'admission des demandes, le consentement, les bornes mémoire, le chiffrement des enveloppes et le cycle des clés plafonnées. Il ne vérifie ni le modèle réel ni une panne réelle du fournisseur ; 17 entrées du snapshot restent illisibles ou exclues et Semgrep n'a pas pu démarrer faute de socket Docker. Le recheck frais du constat HIGH initial, run `1791557940520-9ded317c7f1aa4df`, observe sur la source courante le plafond de 1 024 avant insertion et les suppressions de `executing` après résultat, refus ou expiration. Le helper a rejeté une déclaration de clôture sur cette couverture partielle ; son issue formelle demeure inconnue. La revue `/review` gstack demeure requise : sa dernière tentative le 9 octobre à 16 h 35 a échoué sur la limite de session annoncée levée à 18 h 20 (Europe/Paris). Le blocage externe reste mesuré sous `7ba1b553-dffa-42ab-806a-ceeb466d28b4` et `52f0c1bd-0a68-4df0-b7db-5eea72d2f345`. Aucune archive ni statut `done` n'est justifié avant cette revue et la clôture formelle du finding. Le plafond du nombre d'entrées ne démontre pas un petit budget mémoire en octets ; le coût O(N) du cache et la livraison durable d'une issue à saturation de la file sont dans T3.1e, avant pilote.

## Acceptation manuelle

Sur une instance de test, enchaîner des demandes terminées et constater que l'historique local reste borné ; remplir la limite avec des demandes actives et constater un refus `E_RATE`/429 sans nouvel accord ni nouvel appel fournisseur. Aucun test de charge sur un utilisateur réel n'est requis.
