# Preuves T3.3 — raccordement local

Le périmètre est défini par `proposal.md`, `design.md`, les huit scénarios AC-CONNECT dans les deltas et `tasks.md`. Les quatre adaptateurs initiaux sont Claude Code, Codex, Cursor et Claude Desktop. L'analyse et l'installation restent sur le poste ; la publication des capacités est une action séparée.

## Plan de vérification

1. Vérifier par fixtures les quatre adaptateurs, le contenu expurgé de l'aperçu et l'absence d'exécution d'un serveur MCP.
2. Comparer avant/après l'entrée `drop`, les autres entrées et le catalogue ; répéter l'installation et provoquer un conflit.
3. Provoquer une configuration malformée, une CLI absente, une modification entre aperçu et application, une modification pendant l'écriture et un échec CLI.
4. Connecter puis déconnecter après un ajout tiers ; contrôler le mode et la limite des sauvegardes.
5. Contrôler la validation de l'API locale, le parcours en deux actions et les états de relance, hors ligne et manuel.
6. Exécuter lint, typecheck, tests, OpenSpec strict, garde des sélecteurs et relectures fonctionnelle/sécurité du diff.

## Preuves acquises

- L'aide locale de `claude mcp add` et `codex mcp add` confirme les syntaxes d'ajout utilisées ; aucun agent réel n'a été modifié.
- Les tests ciblés `install.test.ts`, `onboarding.test.ts`, `detect.test.ts` et `panel.test.ts` passent après l'ajout du service et du panneau ; les cas couvrent les quatre adaptateurs, les secrets dans les arguments, le conflit, la répétition, l'échec CLI, la concurrence simulée, le retrait sélectif, les liens symboliques et l'API protégée.
- `openspec validate t3-3-local-agent-onboarding --strict` passe. `openspec-guard check --specs openspec/changes/t3-3-local-agent-onboarding/specs --code . --require-selector --fail-on fail` relie les 11 scénarios nouveaux ou modifiés sur 11. Après archivage, les 16 specs canoniques passent `openspec validate --specs --strict`. La garde canonique passe : 423 critères, 146 reliés, 19 exclus, 258 historiques gelés ; mise à jour de baseline +0/-0.
- Passe complète du 9 octobre à 17 h 22 : `pnpm -r lint`, `pnpm -r typecheck` et `pnpm -r test` réussis, 35 fichiers et 338 tests. `openspec validate t3-3-local-agent-onboarding --strict` et la garde des 11 scénarios de la change réussissent également. La correction ultérieure du texte normatif `requester-mcp` n'a modifié aucun code ; la validation stricte des 16 specs et la garde canonique ont été relancées après cette correction.

## Relecture Codex du diff

La relecture fonctionnelle a suivi le flux bouton d'analyse → API locale → empreinte → sélection → écriture → résultat → relance, ainsi que le chemin CLI. L'installation directe du panneau et l'ancien installateur qui retirait `drop` avant de l'ajouter ont été supprimés. Chaque fichier JSON conserve les entrées tierces ; un conflit ou un changement depuis l'aperçu est refusé. Les CLI sont appelées par arguments, sans shell, puis leur résultat est relu.

La relecture de sécurité a trouvé trois défauts corrigés avant la clôture : `detectAgents()` pouvait afficher un argument MCP brut dans « Mes outils » ; la copie du connecteur pouvait suivre un lien symbolique à sa destination ; `existsSync` pouvait assimiler un chemin inaccessible à une absence. Les tests correspondants passent. L'aperçu ne renvoie que des états, des libellés et une empreinte, pas les contenus lus. La route locale vérifie le jeton et valide la sélection par zod. Les sauvegardes sont en `0600` dans un dossier privé, avec refus des liens symboliques aux emplacements de sauvegarde et une limite de trois versions par fichier. Aucun P0/P1 supplémentaire n'a été trouvé dans les chemins examinés ; il s'agit d'une relecture Codex locale, pas d'un audit externe.

## Limites et risques à examiner

Un processus tiers peut modifier un fichier dans l'intervalle très court entre la dernière lecture de fraîcheur et le renommage atomique. Les CLI officielles peuvent aussi laisser un état partiel si elles échouent ; le Node conserve une sauvegarde privée, vérifie le résultat et signale l'échec, sans restaurer aveuglément tout le fichier. Ces limites sont classées moyennes pour ce parcours local : un conflit observable arrête l'action, aucune publication ni exfiltration n'en découle, et la récupération manuelle reste possible à partir de la sauvegarde. Elles ne constituent pas une garantie de transaction avec un client tiers non coopératif.

## Recette manuelle

Sur un profil de test, ouvrir le panneau, choisir « Mes outils », cliquer « Analyser ce Mac », contrôler les états sans secret, décocher un agent puis confirmer. Constater que seul l'agent sélectionné reçoit `mcpServers.drop` ou l'entrée CLI équivalente ; aucune capacité n'est publiée. Relancer l'agent et vérifier qu'il expose les outils MCP drop. Déconnecter après avoir ajouté un autre serveur et constater qu'il reste intact. Répéter avec équipe hors ligne et avec un agent non reconnu pour voir la configuration manuelle.
