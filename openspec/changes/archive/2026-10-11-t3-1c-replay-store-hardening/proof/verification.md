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

## Preuves encore requises (état du 9 octobre, levées le 11)

Le nouvel audit CSO statique couvre le diff T3.1c entier jusqu'au commit `ea8ce27` : run `1791557865736-082622a35df52318`, terminé avec `completeness:partial` et aucun constat étayé dans le périmètre examiné. Il retrace l'admission des demandes, le consentement, les bornes mémoire, le chiffrement des enveloppes et le cycle des clés plafonnées. Il ne vérifie ni le modèle réel ni une panne réelle du fournisseur ; 17 entrées du snapshot restent illisibles ou exclues et Semgrep n'a pas pu démarrer faute de socket Docker. Le recheck frais du constat HIGH initial, run `1791557940520-9ded317c7f1aa4df`, observe sur la source courante le plafond de 1 024 avant insertion et les suppressions de `executing` après résultat, refus ou expiration. Le helper a rejeté une déclaration de clôture sur cette couverture partielle ; son issue formelle demeure inconnue. La revue `/review` gstack demeure requise : sa dernière tentative le 9 octobre à 16 h 35 a échoué sur la limite de session annoncée levée à 18 h 20 (Europe/Paris). Le blocage externe reste mesuré sous `7ba1b553-dffa-42ab-806a-ceeb466d28b4` et `52f0c1bd-0a68-4df0-b7db-5eea72d2f345`. Aucune archive ni statut `done` n'est justifié avant cette revue et la clôture formelle du finding. Le plafond du nombre d'entrées ne démontre pas un petit budget mémoire en octets ; le coût O(N) du cache et la livraison durable d'une issue à saturation de la file sont dans T3.1e, avant pilote.

## Revue et audit de clôture du 11 octobre 2026

**Revue.** Deux passes indépendantes sur le code T3.1c tel qu'il est sur `main` à `d61a2d4` (`b36bc9a`, `d16c147`) : revue adversariale de l'agent de la tâche, puis revue d'un second agent sans accès en écriture. Ce n'est pas une invocation journalisée du skill gstack `/review` ; la méthode suit sa liste et chaque défaut a reçu un test rouge avant correction.

- P2 confirmé : le daemon traite les enveloppes sans les sérialiser et `admit()` attendait avant l'insertion dans `executing`. Plusieurs demandes passaient ensemble le contrôle de capacité : 1 027 entrées actives observées pour un plafond de 1 024 avec une rafale de quatre. Correction `e03c701` : admission synchrone, insertion avant toute attente, pour les capacités comme pour les faits. Test `bounded executor memory under concurrent delivery > never exceeds the active execution cap when requests are admitted concurrently`.
- P3 confirmé (seconde passe) : une demande de fait refusée était quand même mémorisée ; par un chemin direct sans quota du relais, la fenêtre d'un pair grandissait avec sa cadence (40 entrées pour 40 demandes). Correction `36d8c6e`. Test `published facts (T4.4) > keeps a bounded fact-rate window per peer however fast it asks` (rouge à 40, vert à 11 au plus).
- Vérifié sans défaut : `completedErrors` (1 024, expiration 30 min), `outbound` (réservation synchrone avant financement), `inbox` (1 024, collision refusée, expiration bornée), `outbox` (1 024 envoi en cours compris, un seul vidage), `ReplayCache` (65 536, refus fermé), libération sur toute issue (`deliver` et `fail` en `finally`, expirations par `tick`, ticks concurrents sans double issue), révocations différées plafonnées.

**Audit sécurité gstack `/cso`.** Le recheck du constat HIGH `369ec22b77cbf3bf1de4e4b432896a67` a été tenté sur la source courante et refusé par l'outil (`MISSING_INPUT` : le run d'origine appartient à un autre chemin de dépôt) ; il n'a donc pas pu être clos par l'outil. Un audit frais `--code --diff --base d61a2d4 --offline` (run `1791738131254-49036b6f9ddab1ad`) s'est terminé **partiel** : modèle d'application évalué ; surface d'attaque, OWASP 2025 (A06 limites et courses, A10 conditions exceptionnelles) et STRIDE (déni de service, altération) évalués partiellement sur les chemins modifiés ; LLM/MCP et classification des données non évalués ; aucun scanner lancé (exécution statique hors ligne, Semgrep et les autres non exécutés). Aucun constat étayé dans le périmètre évalué. Un constat moyen hors du diff, non soumissible en mode diff, a été consigné comme suite : les plafonds globaux (`ReplayCache`, marqueurs reçus, boîte d'approbation) n'ont pas de part par pair, de sorte qu'un pair appairé disposant d'un chemin direct rapide peut les remplir et faire refuser les autres pairs pendant au plus 30 minutes ; il relève de T3.1e (quota par pair).

**Clôture du risque HIGH.** La croissance sans borne de `executing` constatée par le CSO est fermée par la preuve suivante : plafond vérifié avant insertion sans attente intermédiaire, suppression sur résultat, refus, expiration ou erreur, test de saturation séquentielle et test de rafale concurrente. Cette clôture repose sur la revue et les tests, pas sur une clôture prononcée par l'outil CSO, que sa couverture partielle n'autorise pas. Restent en risque moyen, avant pilote, dans T3.1e : le budget en octets (jusqu'à 1 024 éléments de 256 Kio par carte), le coût O(N) du cache et l'absence de part par pair ; et dans l'index, en suite P3, l'absence de délai d'acquittement du client relais.

Vérification après corrections : `pnpm -r lint && pnpm -r typecheck && pnpm -r test` vert, `openspec validate --all --strict` vert, openspec-guard vert, baseline inchangée.

## Acceptation manuelle

Sur une instance de test, enchaîner des demandes terminées et constater que l'historique local reste borné ; remplir la limite avec des demandes actives et constater un refus `E_RATE`/429 sans nouvel accord ni nouvel appel fournisseur. Aucun test de charge sur un utilisateur réel n'est requis.
