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
| P1-8 verrou étranger âgé | P1 | REQ-2 | P0-2 | DONE | `private-replay.test.ts`, refus d'un verrou étranger même ancien ; aucune reprise sur simple âge |
| P1-9 perte de l'horloge | P1 | REQ-2 | P0-2 | DONE | `private-replay.test.ts`, version durable et refus si l'horloge disparaît après purge |
| P1-10 trames rejetées par WebSocket | P1 | REQ-3 | P0-3 | DONE | `relay.test.ts`, deux tests rouges puis verts : charge trop grande et UTF-8 invalide avant `message`, puis refus `E_RATE` après reconnexion |
| P1-1 suite complète | P1 | REQ-1 à REQ-3 | P0-1 à P0-3 | DONE | 33 fichiers, 294 tests passés ; lint, typecheck, OpenSpec strict et guard passés |
| P1-2 revue et audit | P1 | REQ-1 à REQ-3 | P1-1 | VERIFYING | Revue ciblée du diff T3.1b et contre-vérification adversariale sans P0/P1 résiduel ; CSO reste partiel et son HIGH mémoire est suivi par T3.1c. |
| P1-3 archive et clôture | P1 | REQ-1 à REQ-3 | P1-2 | TODO | specs synchronisées et guard passé ; archive, index et commit de clôture attendent P1-2 |

## Couverture du périmètre

Applicables : comportement, erreurs, persistance, intégrité, restauration, concurrence locale, idempotence, authentification du relais, confidentialité, sécurité, performance disque, réseau, migrations, compatibilité, contrat API, diagnostics, tests unitaires/intégration, build TypeScript, documentation, exploitation et retour arrière par sauvegarde arrêtée. L'UX, les états de chargement et vides, l'accessibilité, les métriques, le packaging et le déploiement sont sans modification dans T3.1b. Aucun élément UNKNOWN.

## Preuves acquises

- Tests écrits avant correction : 6 échecs attendus sur UUIDv4, fenêtre/stockage et reconnexion.
- Après correction et tests supplémentaires : `pnpm -r test` — 33 fichiers et 294 tests passés le 9 octobre 2026.
- `pnpm -r typecheck` et `pnpm -r lint` — passés le 9 octobre 2026 après la normalisation de casse.
- `pnpm exec openspec validate t3-1b-replay-storage-bounds --strict` — passé le 9 octobre 2026.
- Les deltas ont été synchronisés dans les trois specs canoniques sans archiver la change. `openspec validate --specs --strict` passe pour les 16 specs ; `openspec-guard check --require-selector ... --fail-on fail` passe sur 390 critères, dont 113 liés par sélecteur. Les 258 échecs historiques restent gelés ; `--update-baseline` a produit +0/-0 et aucun diff de baseline.
- Revue indépendante : P1 sur trames malformées après authentification, puis P1 sur les UUIDv7 majuscules/minuscules sous Linux ; tous deux corrigés, couverts par tests et revus sans P0/P1 restant. Les tests historiques de détection et d'outillage disposaient de 5 s en suite concurrente ; leurs délais ont été portés à 15 s et la suite complète passe.
- Gstack CSO : audit statique initial `1791550316563-978736f4d9d99f7b`, puis recheck `1791550611243-25fd9b2648e3adaf`. Le premier a identifié le P1 sur les trames malformées, corrigé avec un test de régression. Une première tentative `/review` a été finalisée `completed:false` (jeton `4b799a4a-7a6f-496a-b0da-72f81507d6e7`) faute de slots d'agents ; elle ne constitue pas une validation.
- Une revue gstack `/review` complète a ensuite tourné dans Claude Code : trois cycles, sept spécialistes, Red Team, adversarial et sondes QA. Le journal est `completed:true`, `converged:false`, 0 critique et 9 informatifs ; les derniers correctifs n'ont pas été revus dans ce cycle. La vérification indépendante suivante a trouvé deux P1 supplémentaires, corrigés avec tests rouges puis verts : reprise d'un verrou étranger âgé, et horloge manquante après purge. Une nouvelle passe gstack et un recheck CSO sur ce diff stabilisé restent requis.
- Le recheck CSO du commit `56c396c` (run `1791554996421-68b812ec9550df5c`) est `finished`, `completeness:partial` : un finding HIGH confirmé montre que `NodeEngine.executing` conserve sans borne les demandes traitées en RAM. Ce défaut de disponibilité préexistant est explicitement pris en charge par T3.1c et bloque le pilote T3.5. Semgrep est `not_assessed` car le socket Docker requis par l'outil est indisponible. La nouvelle passe `/review` n'a pas pu démarrer : limite de session Claude atteinte, réouverture annoncée à 18 h 20 (Europe/Paris). Aucun de ces deux contrôles n'est compté comme vert.
- Reprise de la revue ciblée du diff `6055ed6..232584e` contre la source courante : spécialistes indépendants sécurité/contrat, tests, maintenance/performance/migration et adversarial. Ils n'ont pas trouvé de P0/P1 résiduel après correction. La revue sécurité a identifié le contournement du quota par `maxPayload` ; le test a d'abord échoué (`queued` au lieu de `E_RATE`) avec une exception WebSocket non interceptée. Un second test rouge a montré le même contournement pour l'UTF-8 invalide. `server.ts` gère désormais les erreurs de protocole `ws`, compte ces tentatives après authentification et journalise seulement le code de résultat. Les deux tests et la suite relais (18/18) passent. La passe adversariale a revérifié ce correctif et ne trouve pas de P0/P1/P2 confirmé. Son inspection ne simule pas une coupure électrique réelle ni le `fsync` de répertoire Windows, suivis en T3.1e.
- Vérification finale de cette reprise : `pnpm -r lint && pnpm -r typecheck && pnpm -r test` passe avec 36 fichiers et 345 tests ; `openspec validate t3-1b-replay-storage-bounds --strict` et `openspec validate --specs --strict` passent ; openspec-guard lie 153 critères, ne trouve aucun nouvel échec et sa baseline reste à +0/-0. Le diff de travail a été contrôlé avec `git diff --check`.
- La revue ciblée n'est pas une nouvelle invocation `/review` gstack journalisée : le diff de branche contre `origin/main` contient 221 fichiers de plusieurs chantiers, tandis que le périmètre T3.1b est `6055ed6..232584e` plus le présent correctif. L'exigence formelle 4.3 reste ouverte jusqu'à une passe traçable sur le périmètre stabilisé. Le recheck CSO reste partiel pour la limite déjà signalée ; aucun HIGH mémoire n'est déclaré clos par T3.1b.

## Risques et vérification finale

R-1 HIGH, corrigé sous revalidation finale : les tests de retour d'horloge, redémarrage, saturation, concurrence interprocessus, reconnexion, enveloppe trop grande, trame malformée, rejet WebSocket, casse des UUIDv7, verrou étranger âgé et horloge perdue cherchent les contournements. La reprise automatique d'un verrou étranger a été retirée ; un crash nécessite une reprise manuelle après arrêt des daemons. La perte du fichier d'horloge après migration provoque désormais un refus fermé. R-2 HIGH hors contrat T3.1b est suivi par T3.1c ; sa mitigation mémoire possède des tests mais la clôture CSO formelle reste en attente avant T3.5. Limite P2 : une trame hors quota dont l'ID est après les 256 premiers octets reçoit `E_RATE` sans ID corrélable. Le changement UUIDv7 est une rupture documentée ; les clients tiers UUIDv4 doivent migrer. Aucun service externe requis.

## Acceptation manuelle

Sur une installation privée de test : demander un Drop valide et approuver une fois ; redémarrer le Node et rejouer la même demande, puis constater zéro nouvel accord. Avec un client tiers, vérifier que UUIDv4 est refusé et UUIDv7 récent accepté. Après saturation de test, confirmer un refus `E_RATE` sans exécution.
