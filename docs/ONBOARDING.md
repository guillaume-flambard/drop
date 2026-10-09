# Raccorder ses agents en deux confirmations

**Parcours cible, à implémenter dans T3.3.** Les commandes de détection et d'installation existent ; l'expérience groupée décrite ici n'est pas livrée. L'app Mac restera dans la barre de menus, accessible au clavier.

## Ce que couvrent les deux confirmations

Prérequis : app installée, Node local prêt, environnement sélectionné. Une autorisation macOS, l'acceptation d'une invitation d'équipe ou un téléchargement de modèle restent des étapes distinctes. Raccorder un agent lui ajoute le connecteur MCP drop ; cela ne publie aucun de ses outils.

1. **Analyser ce Mac.** Lire uniquement les emplacements connus des adaptateurs. Présenter les agents, leur état et les modifications proposées ; permettre d'ajuster la sélection. Aucun outil découvert n'est exécuté et l'analyse n'envoie rien sur le réseau.
2. **Connecter les agents sélectionnés.** Ajouter seulement le connecteur drop, avec sauvegarde et contrôle de concurrence. Afficher un résultat par agent et indiquer tout rechargement nécessaire.

L'app distingue « configuration raccordée », « connecteur utilisable » et « équipe joignable ». Le raccordement peut réussir quand l'équipe est hors ligne. Aucun succès de bout en bout n'est annoncé si une relance ou une confirmation dans l'agent reste nécessaire.

## Adaptateurs initiaux

| Agent          | Source connue sur Mac                                             | Raccordement existant à durcir   |
| -------------- | ----------------------------------------------------------------- | -------------------------------- |
| Claude Code    | `~/.claude.json`, utilisateur et projets                          | CLI officielle, portée explicite |
| Codex          | `$CODEX_HOME/config.toml`, sinon `~/.codex/config.toml`           | CLI officielle                   |
| Cursor         | `~/.cursor/mcp.json`                                              | Modification ciblée du JSON      |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | Modification ciblée du JSON      |

La compatibilité dépend de la version du client. On ne promet pas de détecter tous les agents d'un laptop. Les agents non pris en charge disposent d'une voie manuelle. Pas de scan du disque, des conversations, du trousseau ou des ports. L'aperçu masque les valeurs d'environnement, en-têtes et arguments sensibles. Une config illisible n'est pas assimilée à un agent absent.

## Échecs et restauration

| Situation                                     | Résultat attendu                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Aucun agent compatible                        | État vide et voie manuelle, aucune écriture                               |
| Fichier malformé, droits refusés, CLI absente | Erreur par agent, aucun écrasement ni réparation automatique              |
| Entrée drop identique                         | Succès sans changement ni doublon                                         |
| Entrée drop différente                        | Conflit et choix explicite, aucun remplacement silencieux                 |
| Config modifiée depuis l'aperçu               | Arrêt pour cet agent et nouvelle analyse                                  |
| Échec partiel                                 | Succès identifiés, reprise ciblée des échecs                              |
| Interruption pendant l'écriture               | Écriture atomique si possible, journal expurgé et restauration vérifiable |
| Déconnexion                                   | Retirer seulement notre entrée, préserver les changements ultérieurs      |

Sauvegardes locales, privées, versionnées et bornées en nombre. Ne jamais restaurer aveuglément un fichier qui effacerait des ajouts tiers. Les CLI sans transaction nécessitent une compensation testée et un état d'échec explicite.

## Après le raccordement

Rejoindre l'équipe exige une invitation vérifiée. Partager une source exige de choisir une capacité, les outils en lecture seule, les données, le modèle et l'approbateur. Un agent A2A d'entreprise se raccorde par une URL et des identifiants approuvés ; l'analyse locale ne découvre pas l'infrastructure d'entreprise.

Chaque consentement dit qui demande, pourquoi, ce qui sera lu et ce qui pourra sortir. Accepter une demande ne donne pas un accès permanent. Voir [les critères AC-CONNECT](ACCEPTANCE.md) ; la landing montre une simulation, pas un installeur.
