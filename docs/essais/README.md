# Essais réels chez Julie et Natha (T2.7)

Protocole des premiers essais en équipe. But : jouer les cas d'usage sur les vrais outils de deux testeuses,
en rapporter des captures et une vidéo pour les entreprises, et noter tout ce qui coince. Préparé le 9 octobre 2026 ;
les points marqués « à vérifier » le sont sur place, avant de commencer.

## Ce que drop sait brancher aujourd'hui

`mcp.answer` répond à partir d'un serveur MCP **stdio**, ou **HTTP avec des en-têtes fixes** (un jeton). Il ne sait
pas encore se connecter à un serveur qui demande une connexion **OAuth** : c'est le cas des serveurs distants
officiels de Notion et de Figma, et de Linear par défaut. Depuis T2.16, le partage d'un tel serveur échoue avec un
message clair ; T2.17 dira s'il faut l'apprendre. Il faut donc brancher chaque outil comme ci-dessous, avant l'essai.

| Outil  | Branchement pour drop                                                                                    | Outils à partager                                                         | Limites connues                                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma  | Serveur local de l'app de bureau : `http://127.0.0.1:3845/mcp`, activé dans Dev Mode, sans jeton          | `get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot` | Siège Dev ou Full exigé : sinon 6 appels d'outil par mois. L'app Figma doit être ouverte. Les outils lisent la sélection ou un lien : la question doit contenir le lien. |
| GitHub | Serveur distant en lecture : `https://api.githubcopilot.com/mcp/readonly`, en-tête `Authorization: Bearer` | Ceux que le serveur marque en lecture (choix par défaut de `drop share`)   | Jeton à grain fin, en lecture, limité aux dépôts de l'essai.                                                                                                            |
| Linear | Serveur distant en lecture : `https://mcp.linear.app/mcp/readonly`, clé d'API en `Authorization: Bearer`   | Ceux que le serveur marque en lecture                                     | À vérifier sur place : la doc de Linear n'était pas joignable d'ici. La clé agit sous une seule identité.                                                               |
| Notion | Serveur local `npx -y @notionhq/notion-mcp-server`, variable `NOTION_TOKEN` d'une intégration en lecture | `retrieve-a-page`, `retrieve-page-markdown`, `retrieve-a-block`…          | **Pas de recherche** : ce serveur marque toute requête POST comme destructive, dont `post-search` et `query-data-source`, et drop retire ces outils. Voir D38.         |
| Base   | Serveur stdio de la base de Natha, avec un **rôle en lecture seule**                                     | L'outil de requête du serveur                                             | Type de base et serveur à choisir avec Natha. Jamais l'utilisateur de l'application.                                                                                     |

Sources, lues le 9 octobre 2026 : [Figma MCP server guide](https://github.com/figma/mcp-server-guide),
[GitHub MCP Server, serveur distant](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md),
[notion-mcp-server](https://github.com/makenotion/notion-mcp-server) (et son code, `proxy.ts`, version 2.5.2),
[Linear MCP](https://linear.app/docs/mcp) d'après les résultats de recherche seulement.

## Avant d'y aller

- La PR guillaume-flambard/drop#2 est fusionnée. La passerelle et le site ne sont pas nécessaires, sauf pour N3.
- L'app Mac est construite, signée et notarisée (T2.4) ; sinon, prévoir l'ouverture manuelle (clic droit, Ouvrir).
- Le relais tourne : `curl https://drop.memolabs.dev/health`.
- Une équipe existe : Guillaume la crée dans l'onglet Équipe et prépare deux liens d'invitation (valables 24 h).
- Le demandeur (Guillaume) a une clé de gestion OpenRouter pour créer les clés plafonnées (D27), plafond 1 $.
- Une fiche d'accord par testeuse : ce qui est installé, ce qui circule (voir la page Sécurité du site), comment tout
  retirer, et l'accord pour les captures et la vidéo, floutage compris.

## Chez Julie (Figma)

1. Installer l'app, ouvrir le lien d'invitation. Vérifier dans l'onglet Équipe que Guillaume apparaît.
2. Dans Figma : Dev Mode, panneau d'inspection, « Enable desktop MCP server ». Vérifier le siège (Dev ou Full).
3. Ajouter le serveur à un agent de Julie, pour que drop le détecte :
   `claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp`. Sans agent installé chez Julie :
   `drop publish mcp.answer.figma --approver <nodeId de Julie> --config figma.json`, avec dans `figma.json`
   `{ "label": "mon Figma", "server": { "transport": "http", "url": "http://127.0.0.1:3845/mcp" }, "tools": [ … ] }`.
4. Onglet Mes outils : partager Figma avec les quatre outils du tableau. Noter le temps écoulé depuis l'étape 1.

**Scénario F1.** Guillaume, dans Claude Code : « Demande à Julie si l'écran de paiement est prêt et quelles couleurs
il utilise : `<lien Figma de la frame>` ». Julie autorise, relit, envoie. Attendu : statut de la maquette et jetons de
couleur, sans le fichier.

**Scénario F2.** La même question sans lien. Attendu : une réponse qui dit ne pas savoir quelle frame regarder, ou
la frame sélectionnée chez Julie. Noter ce qui se passe : c'est la limite du serveur local.

## Chez Natha (Notion, Linear, GitHub, base)

1. Installer l'app, ouvrir le lien d'invitation.
2. Créer les accès en lecture, chacun dans la variable d'environnement de l'agent qui déclare le serveur :
   - GitHub : jeton à grain fin, lecture seule, dépôts de l'essai ;
   - Linear : clé d'API en lecture ;
   - Notion : intégration « Read content » seulement, partagée sur les pages de l'essai ;
   - base : un rôle `drop_reader` en lecture seule sur les tables de l'essai.
3. Déclarer les quatre serveurs dans l'agent de Natha (Claude Code par exemple), puis les partager depuis l'onglet
   Mes outils. Pour Notion, choisir explicitement les outils de lecture du tableau.
4. Vérifier chaque source seule, par une question simple de Guillaume, avant le scénario complet.

**Scénario N1, « Où en est le projet Atlas ? ».** Guillaume demande à son équipe, en une phrase. Attendu : drop
route vers GitHub (PR ouvertes), Linear (tickets du cycle) et la page Notion du projet si son lien est dans la
question. Natha reçoit une carte par source et décide pour chacune. L'agent assemble.

**Scénario N2, la base.** « Combien de commandes ont échoué hier ? ». Attendu : un nombre et une explication, jamais
une ligne de la table. Vérifier sur la carte ce que Guillaume « ne recevra jamais ».

**Scénario N3, depuis ChatGPT ou Claude** (si la passerelle est déployée, T2.13) : la même question que N1, posée
par Natha elle-même dans Claude ou ChatGPT, vers Julie.

## Ce qu'on rapporte

- **Captures**, floutées si besoin : chaque carte de consentement, chaque relecture, chaque réponse reçue, le panneau
  Mes outils avec les sources partagées. Nommer `essai-<date>-<testeuse>-<scénario>-<n>.jpg` dans `docs/demo/`.
- **Vidéo**, 90 secondes, pour la page d'accueil : la question de Guillaume (10 s), la carte chez Julie (20 s), la
  relecture et l'envoi (20 s), la réponse dans l'agent (20 s), « personne n'a donné d'accès » (20 s). Écran seul, sans
  données de l'entreprise.
- **Mesures** : temps d'installation par testeuse, temps entre la question et la réponse, nombre de refus et pourquoi,
  et le test des 30 secondes (une personne extérieure comprend-elle ce qui s'est passé ?).
- **Journal des frictions** : chaque blocage, son contournement, et la ligne `todo` qu'il devient dans `docs/TASKS.md`.

## Après

Retirer ce que la testeuse ne veut pas garder : supprimer l'app, `~/.drop`, révoquer les jetons GitHub, Linear et
Notion, supprimer le rôle `drop_reader`. Ajouter le compte rendu à `docs/AVANCEMENT.md`, les captures retenues au
site (`scripts/site.ts`), et passer T2.7 à `done`.
