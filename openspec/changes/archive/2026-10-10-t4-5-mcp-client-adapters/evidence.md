# Preuves T4.5

| Critère | Preuve |
|---|---|
| Lecture des treize clients | Test « mcp clients (T4.5) > reads each client's documented global configuration, including JSONC, TOML and YAML, without any secret value ». Fixtures pour les treize, chacun avec un secret dans ses variables, en-têtes ou arguments. JSONC avec commentaire avant la virgule finale et BOM. Liste goose compacte, liste entre guillemets écartée. Serveurs désactivés ignorés. Placeholders non partageables. Aucun secret dans la sortie. |
| Installation prouvée | Test « … > tells an installed client by its app or binary, never by a configuration folder alone ». Toutes les configurations présentes sans application ni binaire : seuls les quatre de T3.3 comptent. Applications, binaires, extensions VS Code et Cursor, IDE JetBrains reconnus. |
| Projets connus ou ajoutés | Test « … > lists project configurations only for known or added projects, never by scanning the disk ». Projets de Claude Code et de Codex. Dossier ajouté, chemin réel. Dossier inconnu absent. Dossier personnel et racine exclus. Lien vers `/dev/zero` ignoré en moins d'une seconde. Échappement TOML invalide sans effet sur les autres projets. |
| Raccordement automatique vérifié | Test « … > connects Gemini CLI and VS Code through their official commands and Cline through its file, then verifies ». Arguments des commandes officielles. Fichier Cline écrit sans toucher aux autres serveurs. État « déjà raccordé » ensuite. Commande sans effet en `E_CLI_UNVERIFIED`. Commande VS Code trouvée dans l'app sans passer par le `PATH`. Binaire non exécutable en `E_CLI_MISSING`. |
| Configuration à copier | Test « … > offers a client-specific copyable configuration where no safe automatic connection exists ». États `manual` et extraits au format de chaque client. Une sélection forgée n'écrit rien et ne copie même pas le serveur. |
| Agents acceptés | Test « requested-by agent (T4.5) > accepts the thirteen clients and other, and reads any other value as other ». |
| Agent inconnu | Test « mcp clients (T4.5) > reports an unknown DROP_AGENT as other ». |
| Panneau | Test « menu bar panel (T4.5) > analyses thirteen clients, separates global and project configurations, and shows manual steps » (lecture du script servi). |

Emplacements revérifiés dans la doc officielle de chaque client le 10 octobre 2026 : `docs/research/2026-10-10-repositionnement.md` §4.

Recette réelle sur ce Mac le 10 octobre 2026, en lecture seule, sans écriture ni valeur affichée.
- Détectés comme installés : Claude Code, Claude Desktop, Cursor, Codex, OpenCode (5 serveurs actifs, état `manual`) et VS Code (prêt, `code` trouvé dans l'app).
- Gemini CLI, Zed, goose et Devin sont absents malgré leurs dossiers de configuration.
- 30 projets sont connus de Claude Code et Codex, dont 2 ont des configurations MCP (Cursor, Codex, OpenCode).

Contrôle par mutation : 19 protections retirées une à une ; chaque fois au moins un test échoue.

## Revue

Revue adverse et sécurité (sous-agent indépendant) : deux critiques, corrigées.
1. Un dépôt cloné portant un lien vers `/dev/zero` gelait le daemon. Seuls les fichiers réguliers de taille bornée sont maintenant lus.
2. Le lecteur YAML de goose perdait des arguments (liste compacte, liste entre guillemets) d'un serveur que drop pouvait ensuite lancer. Il échoue maintenant fermé, et les placeholders propres à chaque client rendent un serveur non partageable.

Corrigés aussi :
- JSONC avec commentaire avant la virgule finale, et BOM ;
- Gemini lu en JSONC ;
- commandes officielles limitées à 60 s, et seulement des fichiers exécutables ;
- chemins relatifs du `PATH` ignorés ;
- dossier personnel et racine exclus des projets, chemin réel, écriture atomique, plafond de 200 projets connus ;
- échappement TOML par projet ;
- noms des treize clients dans la boîte de réception HTML ;
- agent inconnu lu `other` pour la compatibilité ;
- extrait goose sans clé de tête ;
- code et corps de la route de retrait cohérents ;
- seul l'exécutable d'une commande est affiché.

Restent, acceptés dans D66 :
- Cline est raccordé par son fichier partagé même pour l'extension seule ;
- une URL Gemini `url` (SSE) partagée serait jointe en HTTP diffusable ;
- les projets connus de Codex ne sont pas filtrés par niveau de confiance ;
- le test du panneau lit le script servi.

`/cso` gstack ciblé en mode diff (run `1791649823182-347a4cca19565dac`) : statut partiel, car les binaires du dépôt ne sont pas lus. Un constat faible (Cline), aucune faille élevée.

## Vérification

- `pnpm -r lint` et `pnpm -r typecheck` ;
- `pnpm -r test` : 415 tests ;
- `openspec validate --all --strict` ;
- openspec-guard avec sélecteurs.
