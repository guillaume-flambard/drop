# Hermes : raccordement MCP évalué

Le 9 octobre 2026, T3.1a valide le client MCP de **Hermes Agent (Nous Research)** comme demandeur Drop, dans un conteneur jetable sans Internet. Décision : conserver une **recette manuelle facultative**, différer l’auto-détection et toute intégration distribuée. Hermes ne devient ni le runner de Drop ni une dépendance de son installation.

## Ce qui a été exécuté

Hermes amont au commit `73162b00eefde3794bed0afb53d84a19c0eed230`, licence MIT, paquet Python affichant `0.0.0` : le commit identifie donc la version. Installation de développement editable avec l’extra MCP, Python 3.14, Node 24 dans le conteneur. Aucun changement du code amont ; aucune dépendance ajoutée au runtime Drop.

| Essai | Résultat et périmètre |
| --- | --- |
| Chargement du MCP stdio réel | Trois outils filtrés depuis la configuration Hermes, sans ressources ni prompts MCP. |
| Accord, refus, expiration | Appels scriptés via le registre d’outils Hermes ; deux Nodes, API locale et relais Drop réels. Le propriétaire autorise ou refuse ; l’expiration utilise une horloge injectée. Aucun résultat livré avant accord ou après refus/expiration. |
| Boucle d’agent Hermes | Le véritable `AIAgent` appelle le catalogue Drop, puis termine sa réponse. Fournisseur HTTP local **simulé**, pas des poids de modèle. |
| Modèle indisponible | HTTP 503, erreur remontée, aucune complétion réussie ni connexion à un fournisseur externe observée. |
| Réseau | Exécution `--network none`, capture de paquets et trace des appels `connect` : loopback seulement, aucune route, zéro paquet perdu par le noyau. La préparation de l’image utilise Internet. |

La boucle d’agent appelle le catalogue ; les trois décisions sont exercées séparément via son client MCP. Ce n’est pas encore une conversation complète guidée par un vrai modèle. Aucune qualification macOS de Hermes, de ses performances ou d’un modèle local n’est revendiquée. T3.2 porte les mesures de modèles ; T3.5 portera la preuve privée d’ensemble.

## Configuration manuelle à adapter

Créer un **profil Hermes distinct** via `HERMES_HOME`, sans copier la mémoire, les clés ou les outils personnels. Préparer d’abord le Node demandeur selon [PRIVATE_PROFILE](PRIVATE_PROFILE.md). Les chemins ci-dessous sont des exemples absolus à remplacer ; ils ne sont pas installés automatiquement :

```yaml
model:
  provider: custom
  base_url: http://127.0.0.1:11434/v1
  default: <modele-local-deja-installe-et-qualifie>
agent:
  api_max_retries: 1
  auto_recovery_cycles: 0
tools:
  tool_search:
    enabled: "off"
  connectors:
    enabled: false
model_catalog:
  enabled: false
mcp_servers:
  drop:
    command: /chemin/absolu/node
    args: [/chemin/absolu/drop-mcp.mjs]
    env:
      DROP_HOME: /chemin/absolu/profil-drop-demandeur
      DROP_AGENT: other
    tools:
      include: [list_capabilities, request_drop, get_drop_result]
      resources: false
      prompts: false
```

Le protocole Drop ne reconnaît pas encore un identifiant `hermes` : utiliser `other`. Le filtre s’applique au serveur Drop, **pas aux autres outils Hermes**. La recette de preuve sélectionne exclusivement le toolset `mcp-drop`, désactive contexte personnel, mémoire, revue en arrière-plan et identité SOUL via l’API `AIAgent`, et n’ajoute aucun modèle de secours. Une configuration CLI personnelle ne bénéficie pas automatiquement de ces restrictions. La désactivation de Tool Search expose directement les trois outils au modèle ; le comportement par défaut d’Hermes utilise des outils intermédiaires de recherche/appel.

Le modèle d’Hermes voit les résultats autorisés reçus par le demandeur. Les destinations autorisées du Node Drop ne contrôlent pas les sorties réseau d’Hermes : son processus et son fournisseur doivent avoir leur propre isolation. Sur panne, Hermes écrit un **diagnostic de requête dans son profil local**, susceptible de contenir les messages. Dans l’essai, seules des données synthétiques existent et tout le profil disparaît avec le conteneur. Sur une installation réelle, permissions, conservation et suppression de ces diagnostics doivent être traitées avant utilisation avec des données sensibles.

## Rejouer la preuve

Prérequis : dépendances de développement Drop installées, Docker actif, réseau disponible pour construire l’image. Le téléchargement des dépendances n’est pas une opération hors ligne ; aucun poids de modèle ni compte Nous n’est nécessaire à cet essai.

```sh
node scripts/hermes-proof/build.ts
docker build -t drop-hermes-evaluation:local scripts/hermes-proof
mkdir -p dist/hermes-evidence
docker run --rm --network none \
  --mount "type=bind,source=$PWD/dist/hermes-proof,target=/proof,readonly" \
  --mount "type=bind,source=$PWD/dist/hermes-evidence,target=/evidence" \
  drop-hermes-evaluation:local sh /proof/run.sh
```

Attendu : sortie `PASS`, code 0, `dist/hermes-evidence/result.json` avec `status: PASS`. Le script borne l’exécution à 120 secondes et conserve les métadonnées réseau, versions Python et résultats, sans capturer les payloads. Une assertion échouée ou un timeout invalide l’essai. Les dépendances transitives ne sont pas verrouillées : comparer `python-dependencies.txt` avec le relevé conservé dans les preuves avant de conclure qu’une nouvelle image reproduit exactement cet environnement.

Le conteneur est supprimé après l’essai, avec ses identités, jetons, profil Hermes et diagnostics. Aucun dossier personnel n’est monté. Pour retirer aussi l’outillage local de l’essai : supprimer l’image `drop-hermes-evaluation:local` et les deux dossiers générés `dist/hermes-proof` et `dist/hermes-evidence`, après conservation des preuves souhaitées. Ne pas supprimer un profil Drop existant pour déconnecter Hermes ; retirer uniquement son entrée MCP du profil Hermes concerné.

## Maintenance et suite

Coût retenu : entretenir cette recette et rejouer les six scénarios à chaque changement du commit Hermes ou du MCP Drop. Les API Python internes, les filtres d’outils et les valeurs par défaut Hermes peuvent évoluer ; aucun engagement de compatibilité avec toutes les versions. Le coût d’installation et les diagnostics locaux rendent prématurée une installation transparente « deux clics ». Un cinquième adaptateur Hermes pourra être proposé après stabilisation du parcours des quatre agents de T3.3, avec une nouvelle décision et ses propres critères.

Sources officielles : [code et licence](https://github.com/NousResearch/hermes-agent/tree/73162b00eefde3794bed0afb53d84a19c0eed230), [configuration MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/), [valeurs de configuration épinglées](https://github.com/NousResearch/hermes-agent/blob/73162b00eefde3794bed0afb53d84a19c0eed230/hermes_cli/config_defaults.py). Les preuves archivées de T3.1a distinguent la compatibilité MCP observée de la qualification de modèle encore à réaliser.
