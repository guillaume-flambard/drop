# Vérification T3.1b

## Source canonique et graphe

Intention et hors périmètre : `proposal.md`. Cartographie et choix techniques : `design.md`. Exigences REQ-1 à REQ-3 et critères d'acceptation : les trois deltas `specs/`. Graphe fini : `tasks.md` et `state.json`. Aucun TODO marqué terminé sans les tests cités ici.

| TODO | Priorité | Exigences | Dépendance | Statut | Preuve |
| --- | --- | --- | --- | --- | --- |
| P0-1 schéma UUIDv7 | P0 | REQ-1 | aucune | DONE | `protocol.test.ts`, test `drop request id` |
| P0-2 anti-rejeu borné | P0 | REQ-2 | P0-1 | DONE | `private-replay.test.ts`, 7 tests |
| P0-3 quota par identité | P0 | REQ-3 | aucune | DONE | `relay.test.ts`, reconnexion |
| P1-4 concurrence interprocessus | P1 | REQ-2 | P0-2 | DONE | `private-replay.test.ts`, test du verrou d'admission |
| P1-5 enveloppe trop grande | P1 | REQ-3 | P0-3 | DONE | `relay.test.ts`, test quota sur enveloppe rejetée |
| P1-6 trame malformée | P1 | REQ-3 | P0-3 | DONE | `relay.test.ts`, test de trame malformée ; revue indépendante |
| P1-7 casse des UUIDv7 | P1 | REQ-1 et REQ-2 | P0-1, P0-2 | DONE | `protocol.test.ts` et `private-replay.test.ts`, casse et migration |
| P1-1 suite complète | P1 | REQ-1 à REQ-3 | P0-1 à P0-3 | DONE | 33 fichiers, 276 tests passés ; lint, typecheck et validation OpenSpec passés |
| P1-2 revue et audit | P1 | REQ-1 à REQ-3 | P1-1 | VERIFYING | revues indépendantes sans P0/P1 ; clôture formelle gstack /review encore requise ; CSO partiel consigné ci-dessous |
| P1-3 archive et clôture | P1 | REQ-1 à REQ-3 | P1-2 | TODO | specs synchronisées et guard passé ; archive, index et commit de clôture attendent P1-2 |

## Couverture du périmètre

Applicables : comportement, erreurs, persistance, intégrité, restauration, concurrence locale, idempotence, authentification du relais, confidentialité, sécurité, performance disque, réseau, migrations, compatibilité, contrat API, diagnostics, tests unitaires/intégration, build TypeScript, documentation, exploitation et retour arrière par sauvegarde arrêtée. L'UX, les états de chargement et vides, l'accessibilité, les métriques, le packaging et le déploiement sont sans modification dans T3.1b. Aucun élément UNKNOWN.

## Preuves acquises

- Tests écrits avant correction : 6 échecs attendus sur UUIDv4, fenêtre/stockage et reconnexion.
- Après correction et tests supplémentaires : `pnpm -r test` — 33 fichiers et 276 tests passés le 9 octobre 2026.
- `pnpm -r typecheck` et `pnpm -r lint` — passés le 9 octobre 2026 après la normalisation de casse.
- `pnpm exec openspec validate t3-1b-replay-storage-bounds --strict` — passé le 9 octobre 2026.
- Les deltas ont été synchronisés dans les trois specs canoniques sans archiver la change. `openspec validate --specs --strict` passe pour les 16 specs ; `openspec-guard check --require-selector ... --fail-on fail` passe sur 378 critères, dont 101 liés par sélecteur. Les 258 échecs historiques restent gelés ; `--update-baseline` a produit +0/-0 et aucun diff de baseline.
- Revue indépendante : P1 sur trames malformées après authentification, puis P1 sur les UUIDv7 majuscules/minuscules sous Linux ; tous deux corrigés, couverts par tests et revus sans P0/P1 restant. Les tests historiques de détection et d'outillage disposaient de 5 s en suite concurrente ; leurs délais ont été portés à 15 s et la suite complète passe.
- Gstack CSO : audit statique lancé avec `--code --diff --base HEAD --offline` (run `1791550316563-978736f4d9d99f7b`), puis recheck après correction (run `1791550611243-25fd9b2648e3adaf`). Le premier audit a identifié le P1 sur les trames malformées. Le recheck est partiel et ne certifie pas formellement sa clôture ; la preuve de clôture technique repose sur le test de régression et la revue indépendante du nouveau code. La revue gstack `/review` a été lancée et son journal finalisé avec `completed:false` (jeton `4b799a4a-7a6f-496a-b0da-72f81507d6e7`) : le workflow demande six spécialistes simultanés, plus QA et adversarial Claude, indisponibles avec les slots de cette session. Sa revue statique ciblée n'a trouvé aucun P0/P1 résiduel, mais il faut une passe `/review` complète avant la clôture formelle.

## Risques et vérification finale

R-1 HIGH, clos sur preuve technique : les tests de retour d'horloge, redémarrage, saturation, concurrence interprocessus, reconnexion, enveloppe trop grande, trame malformée et casse des UUIDv7 ont cherché les contournements ; les deux revues indépendantes n'ont pas trouvé de P0/P1 après correction. Limite P2 : une trame hors quota dont l'ID est après les 256 premiers octets reçoit `E_RATE` sans ID corrélable ; le client doit gérer ce refus global. La certification automatique CSO reste partielle, comme indiqué ci-dessus. Le changement UUIDv7 est une rupture documentée ; les clients tiers UUIDv4 doivent migrer. Aucun service externe requis.

## Acceptation manuelle

Sur une installation privée de test : demander un Drop valide et approuver une fois ; redémarrer le Node et rejouer la même demande, puis constater zéro nouvel accord. Avec un client tiers, vérifier que UUIDv4 est refusé et UUIDv7 récent accepté. Après saturation de test, confirmer un refus `E_RATE` sans exécution.
