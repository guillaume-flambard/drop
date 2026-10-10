# Raccorder ses agents en deux confirmations

**Parcours T3.3 vérifié sur fixtures et prêt pour recette manuelle.** Le panneau local permet d'analyser les quatre adaptateurs, de sélectionner ceux à raccorder, puis de confirmer l'ajout. L'app Mac distribuée et signée reste le chantier T3.4 ; l'expérience finale dans la barre de menus n'est donc pas encore validée sur une installation neuve.

## Ce que couvrent les deux confirmations

Prérequis : app installée, Node local prêt, environnement sélectionné. Une autorisation macOS, l'acceptation d'une invitation d'équipe ou un téléchargement de modèle restent des étapes distinctes. Raccorder un agent lui ajoute le connecteur MCP drop ; cela ne publie aucun de ses outils.

1. **Analyser ce Mac.** Le bouton lance une lecture des seuls emplacements connus. L'aperçu indique, par agent, si l'ajout est prêt, déjà fait, en conflit ou en erreur. Il ne montre ni valeurs de secrets ni arguments des serveurs existants ; aucun outil découvert n'est exécuté et l'analyse n'envoie rien sur le réseau.
2. **Connecter les agents sélectionnés.** La confirmation ajoute uniquement le connecteur drop aux agents cochés. Chaque agent retourne son résultat ; un fichier modifié depuis l'aperçu est refusé. Il faut relancer l'agent pour charger sa nouvelle configuration.

Le panneau distingue « configuration raccordée », « connecteur utilisable à vérifier après relance » et « équipe joignable ». Le raccordement peut réussir quand l'équipe est hors ligne. Aucun succès de bout en bout n'est annoncé si une relance ou une confirmation dans l'agent reste nécessaire.

## Adaptateurs initiaux

| Agent          | Source connue sur Mac                                             | Raccordement existant à durcir   |
| -------------- | ----------------------------------------------------------------- | -------------------------------- |
| Claude Code    | `~/.claude.json`, utilisateur et projets                          | CLI officielle, portée explicite |
| Codex          | `$CODEX_HOME/config.toml`, sinon `~/.codex/config.toml`           | CLI officielle                   |
| Cursor         | `~/.cursor/mcp.json`                                              | Modification ciblée du JSON      |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | Modification ciblée du JSON      |

La compatibilité dépend de la version du client. On ne promet pas de détecter tous les agents d'un laptop. Après l'analyse, le panneau fournit une entrée MCP stdio locale à copier pour les autres agents lorsque le connecteur est présent. Pas de scan du disque, des conversations, du trousseau ou des ports. L'aperçu masque les valeurs d'environnement, en-têtes et arguments sensibles. Une config illisible n'est pas assimilée à un agent absent.

## Échecs et restauration

| Situation                                     | Résultat attendu                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Aucun agent compatible                        | État vide et voie manuelle, aucune écriture                               |
| Fichier malformé, droits refusés, CLI absente | Erreur par agent, aucun écrasement ni réparation automatique              |
| Entrée drop identique                         | Succès sans changement ni doublon                                         |
| Entrée drop différente                        | Conflit et choix explicite, aucun remplacement silencieux                 |
| Config modifiée depuis l'aperçu               | Arrêt pour cet agent et nouvelle analyse                                  |
| Échec partiel                                 | Succès identifiés, reprise ciblée des échecs                              |
| Interruption pendant l'écriture               | Fichier JSON temporaire puis renommage ; fichier d'origine préservé si la vérification de fraîcheur échoue |
| Déconnexion                                   | Retirer seulement notre entrée, préserver les changements ultérieurs      |

Les sauvegardes locales sont privées, versionnées et limitées à trois par fichier. La déconnexion retire seulement l'entrée drop reconnue, sans restaurer aveuglément un fichier entier. Les CLI officielles ne fournissent pas de transaction : le Node vérifie leur résultat et signale `E_CLI_UNVERIFIED` si l'entrée attendue n'apparaît pas. Après un échec CLI partiel, la récupération se fait manuellement à partir de la sauvegarde ; elle n'est pas annoncée comme automatique.

## Après le raccordement

Rejoindre l'équipe exige une invitation vérifiée. Partager une source exige de choisir une capacité, les outils en lecture seule, les données, le modèle et l'approbateur. Un agent A2A d'entreprise se raccorde par une URL et des identifiants approuvés ; l'analyse locale ne découvre pas l'infrastructure d'entreprise.

Chaque consentement dit qui demande, pourquoi, ce qui sera lu et ce qui pourra sortir. Accepter une demande ne donne pas un accès permanent. Voir [les critères AC-CONNECT](ACCEPTANCE.md) ; la landing montre une simulation, pas un installeur.
