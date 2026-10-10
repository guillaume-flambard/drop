# Raccorder ses agents en deux confirmations

**Existant : T3.3 est livrée, vérifiée sur fixtures, en attente de recette manuelle.** La change est archivée ([vérification](../openspec/changes/archive/2026-10-09-t3-3-local-agent-onboarding/proof/verification.md)) ; la recette humaine sur un Mac de test reste à faire. Le panneau local (`packages/node/src/panel.ts`) permet d'analyser les treize clients de D55 (T4.5, D66, `packages/capabilities/src/clients.ts`), de sélectionner ceux que drop sait raccorder, puis de confirmer l'ajout ; pour les autres, il donne la configuration à copier. L'app Mac distribuée et signée reste le chantier T3.4 ; l'expérience finale dans la barre de menus n'est donc pas encore validée sur une installation neuve.

## Ce que couvrent les deux confirmations

Prérequis : app installée, Node local prêt, environnement sélectionné. Une autorisation macOS, l'acceptation d'une invitation d'équipe ou un téléchargement de modèle restent des étapes distinctes. Raccorder un agent lui ajoute le connecteur MCP drop ; cela ne publie aucun de ses outils.

1. **Analyser ce Mac.** Le bouton lance une lecture des seuls emplacements connus. L'aperçu indique, par agent, si l'ajout est prêt, déjà fait, en conflit ou en erreur. Il ne montre ni valeurs de secrets ni arguments des serveurs existants ; aucun outil découvert n'est exécuté et l'analyse n'envoie rien sur le réseau.
2. **Connecter les agents sélectionnés.** La confirmation ajoute uniquement le connecteur drop aux agents cochés. Chaque agent retourne son résultat ; un fichier modifié depuis l'aperçu est refusé. Il faut relancer l'agent pour charger sa nouvelle configuration.

Le panneau distingue « configuration raccordée », « connecteur utilisable à vérifier après relance » et « équipe joignable ». Le raccordement peut réussir quand l'équipe est hors ligne. Aucun succès de bout en bout n'est annoncé si une relance ou une confirmation dans l'agent reste nécessaire.

## Adaptateurs livrés (T3.3)

| Agent          | Source connue sur Mac                                             | Raccordement                                                    |
| -------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Claude Code    | `~/.claude.json`, utilisateur et projets                          | CLI officielle, portée utilisateur, résultat relu               |
| Codex          | `$CODEX_HOME/config.toml`, sinon `~/.codex/config.toml`           | CLI officielle, résultat relu                                   |
| Cursor         | `~/.cursor/mcp.json`                                              | Fichier temporaire renommé, sauvegarde privée de trois versions |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | Fichier temporaire renommé, sauvegarde privée de trois versions |

Sources : `packages/capabilities/src/agents.ts` pour les emplacements, `packages/node/src/onboarding.ts` et `packages/node/src/install.ts` pour le raccordement, D45 pour les choix.

## Treize clients (T4.5, D66)

| Client | Lu (global ; projet) | Raccordement |
| --- | --- | --- |
| OpenCode | `~/.config/opencode/opencode.json(c)` ; `opencode.json(c)`, `.opencode/` | À copier (JSONC commenté) |
| Gemini CLI | `~/.gemini/settings.json` ; `.gemini/settings.json` | `gemini mcp add --scope user`, résultat relu |
| Devin Desktop (Windsurf) | `~/.config/devin/mcp_config.json`, `~/.codeium/windsurf/mcp_config.json`, `~/.config/devin/config.json` ; `.devin/mcp_config.json` | À copier (emplacements contradictoires dans sa doc) |
| Zed | `~/.config/zed/settings.json` ; `.zed/settings.json` | À copier (JSONC) |
| goose | `~/.config/goose/config.yaml` | À copier (YAML, `goose configure`) |
| VS Code (Copilot) | profil `mcp.json` ; `.vscode/mcp.json` | `code --add-mcp`, résultat relu ; retrait à la main |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` | Fichier temporaire renommé, sauvegarde privée |
| Roo Code (archivé) | `globalStorage/…/mcp_settings.json` ; `.roo/mcp.json` | À copier |
| JetBrains AI | Junie : `~/.junie/mcp/mcp.json` ; `.junie/mcp/mcp.json` | À copier dans Settings, Tools, AI Assistant, Model Context Protocol (MCP) |

Un client est dit installé par son application, son binaire ou son extension, jamais par un dossier de configuration seul ; les quatre clients de T3.3 gardent aussi leur fichier comme signe. Les configurations par projet sont lues dans les projets que Claude Code et Codex connaissent déjà et dans les dossiers ajoutés depuis le panneau ; aucun projet n'est raccordé automatiquement. Sources par client : [revérification du 10 octobre](research/2026-10-10-repositionnement.md#4-clients-mcp-configuration).

Pas de scan du disque, des conversations, du trousseau ou des ports. L'aperçu masque les valeurs d'environnement, en-têtes et arguments sensibles. Une config illisible n'est pas assimilée à un agent absent. Si aucun client n'est présent, le panneau affiche « Aucun des treize clients détecté » et une entrée MCP stdio à copier.

## Échecs et restauration

| Situation                                     | Résultat attendu                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Aucun agent compatible                        | État vide et voie manuelle, aucune écriture                                                                |
| Fichier malformé, droits refusés, CLI absente | Erreur par agent, aucun écrasement ni réparation automatique                                               |
| Entrée drop identique                         | Succès sans changement ni doublon                                                                          |
| Entrée drop différente                        | Conflit et choix explicite, aucun remplacement silencieux                                                  |
| Config modifiée depuis l'aperçu               | Arrêt pour cet agent et nouvelle analyse                                                                   |
| Échec partiel                                 | Succès identifiés, reprise ciblée des échecs                                                               |
| Interruption pendant l'écriture               | Fichier JSON temporaire puis renommage ; fichier d'origine préservé si la vérification de fraîcheur échoue |
| Déconnexion                                   | Retirer seulement notre entrée, préserver les changements ultérieurs                                       |

Les sauvegardes locales sont privées, versionnées et limitées à trois par fichier. La déconnexion retire seulement l'entrée drop reconnue, sans restaurer aveuglément un fichier entier. Les CLI officielles ne fournissent pas de transaction : le Node vérifie leur résultat et signale `E_CLI_UNVERIFIED` si l'entrée attendue n'apparaît pas. Après un échec CLI partiel, la récupération se fait manuellement à partir de la sauvegarde ; elle n'est pas annoncée comme automatique.

## Après le raccordement

Rejoindre l'équipe exige un lien d'invitation `drop://pair` valable 24 h et une seule fois. Dans le panneau, ce lien est accepté dès l'ouverture, sans clic de confirmation (existant, `packages/node/src/panel.ts`) ; une confirmation explicite est visée en T4.14.

**Partager un outil, ce qui existe.** Dans « Mes outils », chaque serveur MCP partageable d'un agent installé porte un interrupteur « Partager … ». Un clic suffit (`packages/node/src/panel.ts`, `packages/node/src/share.ts`) :

- la capacité publiée est `mcp.answer` sur ce serveur, nommée « mon » suivi du genre ou du nom du serveur ;
- les outils retenus sont ceux que le serveur marque lui-même en lecture seule (`readOnlyHint`) ; si aucun ne l'est, le partage est refusé et le message d'erreur liste les outils disponibles ;
- l'approbateur est le propriétaire lui-même ;
- le panneau ne demande ni le modèle ni les données : la capacité prend le fournisseur par défaut, l'URL Ollama locale sans modèle choisi (`packages/capabilities/src/llm.ts`). D'après le code, une exécution est alors refusée (`E_SCHEMA`) tant qu'aucun modèle n'est fixé ; ce comportement n'a pas été observé dans le panneau ;
- en profil privé, celui que crée l'app Mac, un serveur source MCP stdio est refusé (`E_DENIED`, `packages/capabilities/src/mcp-answer.ts`) : seul un serveur HTTP sur une origine privée autorisée peut être partagé.

Une annotation de lecture seule est déclarée par le serveur, pas vérifiée par drop. En ligne de commande, `share <agent>/<serveur> --tools a,b --approver <nodeId>` et `publish <capacité> --approver <nodeId> --config <fichier.json>` permettent de choisir les outils, l'approbateur et le modèle.

**Ce qui était annoncé ici avant le 10 octobre.** Cette page disait que partager une source exigeait de choisir une capacité, les outils, les données, le modèle et l'approbateur. Ce n'est pas le parcours du panneau. Ce choix fin dans le panneau est porté par T4.16.

Un agent A2A d'entreprise se raccorde par une URL et des identifiants approuvés ; l'analyse locale ne découvre pas l'infrastructure d'entreprise.

Chaque carte de consentement du panneau dit qui demande et par quel agent, la question, pourquoi, ce que le demandeur recevra et ce qu'il ne recevra jamais, puis le coût s'il existe. L'expiration et la sensibilité n'y figurent pas encore (visé, T4.14). Accepter une demande ne donne pas un accès permanent. Voir [les critères AC-CONNECT](ACCEPTANCE.md) ; la landing montre une simulation, pas un installeur.
