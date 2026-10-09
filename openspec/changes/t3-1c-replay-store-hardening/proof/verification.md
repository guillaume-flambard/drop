# Vérification T3.1c

## Source et plan

Intention : `proposal.md`. Exigences et critères : `specs/node/spec.md` et `specs/protocol/spec.md`. Conception : `design.md`. Graphe fini : `tasks.md` et `state.json`. Le constat CSO initial de T3.1b est `369ec22b77cbf3bf1de4e4b432896a67` dans le run `1791554996421-68b812ec9550df5c`.

## Couverture

Applicables : comportement, erreurs, persistance du marqueur anti-rejeu, intégrité, concurrence, idempotence, autorisation du pair, confidentialité, sécurité, performance mémoire, réseau hors ligne, API, diagnostics, tests unitaires/intégration, build TypeScript, documentation. Non applicables à cette change : UX visuelle, accessibilité, packaging, déploiement, migration de fichier.

## Preuves acquises le 9 octobre 2026

- `pnpm -r lint` : réussi après formatage des deux nouveaux tests.
- `pnpm -r typecheck` : réussi.
- `pnpm -r test` : 34 fichiers et 312 tests réussis. Une première passe avait échoué seulement sur le formatage ; elle a été corrigée avant cette passe complète.
- `openspec validate t3-1c-replay-store-hardening --strict` : réussi ; `openspec validate --specs --strict` : 16 specs réussies.
- `openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail` : réussi, 405 critères, 128 liés à un test, 19 exclus, 258 échecs historiques gelés. `--update-baseline` : +0, -0.
- Contre-vérification indépendante : 63 tests ciblés réussis, `git diff --check` réussi, aucun P0/P1 restant trouvé dans le contrat T3.1c. Les échecs initiaux hors ligne, refus de relais, vidage de file et enveloppe trop grande ont été corrigés et revérifiés.

## Preuves encore requises

L'audit CSO statique du diff T3.1c, run `1791556424890-fc5cb966b6a46fe0`, est terminé avec `completeness:partial` et aucun constat étayé dans le périmètre examiné. Les 17 entrées retenues par le snapshot, l'absence de Semgrep (socket Docker indisponible) et l'absence de reproduction runtime restent des limites. Le recheck du finding HIGH initial, run `1791556505240-2e2b9ead1eb3571c`, observe les suppressions d'entrée après résultat/refus et le plafond de 1 024 avant consentement ; son résultat formel demeure `unknown`, car le helper refuse explicitement de clôturer un finding à partir d'un recheck partiel. Une nouvelle tentative de `/review` le 9 octobre à 16 h 35 a échoué sur la limite de session Claude Code, annoncée levée à 18 h 20 (Europe/Paris) ; blocage enregistré sous `7ba1b553-dffa-42ab-806a-ceeb466d28b4`. Aucune archive ni statut `done` n'est justifié avant cette revue et la clôture formelle du finding. Le plafond du nombre d'entrées ne démontre pas un petit budget mémoire en octets ; le coût O(N) du cache et la livraison durable d'une issue à saturation de la file sont dans T3.1e, avant pilote.

## Acceptation manuelle

Sur une instance de test, enchaîner des demandes terminées et constater que l'historique local reste borné ; remplir la limite avec des demandes actives et constater un refus `E_RATE`/429 sans nouvel accord ni nouvel appel fournisseur. Aucun test de charge sur un utilisateur réel n'est requis.
