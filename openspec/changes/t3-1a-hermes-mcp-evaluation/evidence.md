# Preuves T3.1a — 9 octobre 2026

## EV-01 — amont et contrat

Hermes `73162b00eefde3794bed0afb53d84a19c0eed230`, MIT, version Python déclarée `0.0.0`. Lecture des sources amont `tools/mcp_tool_discovery.py`, `tools/registry.py`, `agent/agent_init.py`, `hermes_cli/config_defaults.py`, exemple CLI et documentation MCP officielle. Le filtre MCP, le toolset `mcp-drop`, `tools.tool_search.enabled: off` et les limites de retries viennent de cette version. `DROP_AGENT=other` respecte le schéma existant. D42 et docs/HERMES.md consignent décision, coût, retrait et limites. AC-HERMES-03 ; tâches 1.1, 2.3.

## EV-02 — exécution isolée réelle

`node scripts/hermes-proof/build.ts`, construction Docker puis commande documentée dans HERMES.md : code 0 et `PASS`. Image arm64 `sha256:0af974ca4150dd8235499265ba230a2dbb956325baab759d7f9ba924f86b493d`, 1 313 314 807 octets annoncés par Docker. Image d’évaluation avec dépendances Python/outils de capture, pas la taille d’une app Drop. Installation editable amont, Python 3.14/Node 24 ; dépendances exactes relevées dans [python-dependencies.txt](proof/python-dependencies.txt). Aucun ajout aux manifests ou au lockfile Drop.

Le script importe les vrais modules MCP Hermes, découvre exactement trois outils et les appelle via son registre. Les messages passent par le bundle MCP Drop, son API authentifiée, deux Nodes et le relais. Les accord/refus/expiration sont testés avec publication déterministe synthétique ; le contrôle propriétaire et l’horloge sont pilotés par la fixture. La vraie boucle `AIAgent` appelle ensuite le catalogue à travers MCP avec un endpoint HTTP simulé, vérifie le retour outil et la réponse finale. Une panne HTTP 503 doit produire une erreur et `completed: false`.

[result.json](proof/result.json) conserve les six scénarios, outils exposés et requêtes modèle sans contenu. Aucun vrai modèle n’a été chargé ; le serveur Ollama du poste ne répondait pas, aucun poids n’a été téléchargé. L’évaluation documente cet écart, comme prévu par AC-HERMES-02. Pas de qualification générale d’Hermes, de macOS ou de conversation autonome complète. AC-HERMES-01/02 ; tâches 1.2, 2.1, 2.2.

## EV-03 — réseau, nettoyage et diagnostics

Conteneur `--rm --network none`, aucun home personnel monté ; seulement les bundles en lecture seule et un dossier de métadonnées. [connect.txt](proof/connect.txt) : 20 appels `connect`, seules destinations IP `127.0.0.1`. [network.txt](proof/network.txt) : 356 lignes de paquets loopback ; [capture.txt](proof/capture.txt) : zéro perte noyau. [routes.json](proof/routes.json) vide. Le vérificateur rejette toute autre destination, tout paquet non loopback ou perte annoncée. La trace ne prétend pas auditer tous les syscalls possibles ni toutes les fonctionnalités Hermes ; elle concerne cette exécution isolée. L’absence de route bloque de toute façon la sortie du conteneur.

Le endpoint reçoit aussi une requête locale `/api/show` de découverte et deux appels 503 sur le chemin de panne ; ce n’est pas un repli vers un autre fournisseur. Hermes écrit un diagnostic de requête sous son profil `/tmp` : seuls des messages synthétiques sont concernés et le conteneur supprimé emporte ce fichier. Le guide avertit de cette rétention avant tout usage sensible. Les Nodes de test arrêtent clients/API/relais et suppriment leur dossier ; `--rm` supprime aussi le profil en cas de timeout. Métadonnées conservées, aucune clé ni payload dans la preuve réseau. AC-HERMES-02/03.

Les premières tentatives ont révélé le format d’erreur MCP Hermes, ses outils intermédiaires par défaut, puis une ligne vide de fin de tcpdump. Recette corrigée et rejouée : pas de modification du code Hermes pour obtenir le succès. [script-hashes.json](proof/script-hashes.json) identifie les scripts de la dernière exécution.

## EV-04 — régressions et contrats

- `pnpm -r lint` : PASS.
- `pnpm -r typecheck` : PASS.
- `pnpm -r test` : PASS, 262 tests / 33 fichiers, y compris les liens locaux du nouveau guide exporté.
- `openspec validate t3-1a-hermes-mcp-evaluation --strict` : PASS, `skip_specs: true` ; aucun comportement runtime modifié.
- `openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail` puis `--update-baseline` : PASS, +0/-0 ; 88 reliés, 258 gelés, 19 non testables.
- `pnpm site:build` : PASS, 16 fichiers publics explicitement autorisés. Aucun déploiement externe.

Tâche 3.1. Ces tests ne qualifient pas les modèles réels : ce travail reste T3.2.

## EV-05 — revue indépendante

Un second agent, distinct de l’implémentation, a relu AC-HERMES-01/02/03, le diff, les scripts, la recette et les preuves archivées. Verdict : **NO FINDINGS** P1/P2. Il a spécifiquement cherché les écarts entre le vrai client Hermes et le modèle simulé, les assertions de refus/expiration, l’isolation réseau, la confidentialité des diagnostics et le retrait. Revue en lecture seule ; tests non rejoués par lui, EV-02/04 portent leurs exécutions.

La première tentative de revue s’est interrompue sur une limite d’usage de l’agent ; la seconde a fourni le contrôle indépendant. Une première invocation gstack `/review` s’est arrêtée avant le diff car la branche était `main`, identique à sa base. La revue formelle relancée sur `codex/t3-1a-hermes-evaluation` est enregistrée avec le verdict **`issues_found` (1 CRITICAL)** ; [rapport durable](proof/gstack-review.md) et [QA navigateur](proof/qa-report.md). Les spécialistes testing, maintenabilité, sécurité, performance, API et simplification n’ont rien retenu d’autre. Le navigateur a vérifié la page et le téléchargement du guide ; sa couverture est partielle, explicitée dans le rapport. Le constat critique n’est pas résolu. /cso non applicable au delta T3.1a : aucun package runtime modifié. L’évaluation ne clôt pas les constats CSO historiques de T3.1.

La revue gstack couvre la différence depuis `origin/main`, qui contient aussi les commits T3.1 historiques. Elle a découvert dans `DropHome.claimDrop()` une conservation illimitée de fichiers par identifiant de demande ; la limite du relais se réinitialise avec chaque connexion. Ce défaut antérieur, hors delta T3.1a, est consigné comme T3.1b (P1, sévérité critique dans la revue) dans docs/TASKS.md et dans le bilan. Il ne rend pas fausses les assertions de quelques demandes synthétiques de l’essai Hermes, mais bloque la clôture de la branche tant qu’il reste ouvert.
