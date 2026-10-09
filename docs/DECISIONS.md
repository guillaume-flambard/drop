# Journal des décisions

Format : `D<n> — date — décision — raison`. Les agents ajoutent ici toute décision non écrite dans les specs.

## Décisions de cadrage (8 octobre 2026)

- **D1** — Le produit n'est ni le P2P, ni MCP, ni la découverte : c'est le contrat de capacité + consentement + résultat
  filtré. Principe : « Get the answer, not the access ».
- **D2** — Mesurer avant de construire : l'étape 0 (`blocked-observer`) précède tout pilote.
- **D3** — Cible de départ : équipes produit qui codent avec des agents. Le métier entre plus tard par des capacités.
- **D4** — Capability Drop seulement. Pas de Task Drop dans l'étape 1.
- **D5** — Premières capacités : `production.error_summary` (divulgation minimale, déterministe) et `repo.answer`
  (localité, haute sensibilité, démo). Figma et CRM écartés pour l'instant.
- **D6** — Le runner utilise une clé API, jamais un login d'abonnement Claude ou ChatGPT (CGU des fournisseurs).
- **D7** — Relais d'abord ; découverte LAN reportée. Le relais ne voit que des enveloppes chiffrées.
- **D8** — Le propriétaire d'une capacité est générique (`human`, `team`, `machine`, `service`) dans le modèle ;
  l'UI v1 n'affiche que des noms.
- **D9** — Nom « AgentDrop » abandonné (pris par plusieurs projets agentiques). Nom de code interne : `drop`.
- **D10** — Argument « réduction de licences » banni du produit et du discours.
- **D11** — Sécurité par la sémantique : les capacités sont conçues pour empêcher les questions dangereuses ; les seuils
  appartiennent au propriétaire (ex. `customer.segment` plutôt que `is_arr_above`).

## Outillage (8 octobre 2026)

- **D12** — Développement spec-driven avec OpenSpec (`@fission-ai/openspec` 1.14.1), source unique du contrat dans
  `openspec/specs/`. Contrôles par gstack (`/review` à chaque change, `/cso` pour les changes sensibles) et skill
  `grilling` (Matt Pocock) pour lever les ambiguïtés avant la proposal. BMAD écarté : il réécrirait des specs déjà
  écrites dans un deuxième format. `setup-matt-pocock-skills` non lancé : `CONTEXT.md`, `docs/adr` et son suivi de
  tickets doubleraient `openspec/` et cet index. Raison : une seule source de vérité par sujet.
- **D13** — Les dix capacités sont migrées d'un coup depuis `docs/specs/` (change `migrate-spec-kit`). Une change de
  tâche implémente des exigences existantes. Elle porte `skip_specs: true` si le contrat ne bouge pas, et un delta
  MODIFIED/ADDED si l'implémentation révèle un manque. Raison : éviter que la moitié du kit reste en prose pendant
  l'étape 1.
- **D14** — Couverture des scénarios contrôlée par `openspec-guard` 0.3.0 en mode `--require-selector`, avec une
  baseline des scénarios pas encore implémentés. Raison : specs en français, tests en anglais, et la similarité de
  mots ne traverse pas les langues. Les scénarios de lecture de doc (« à vérifier ») ou de décision humaine sont
  annotés `non-testable` avec leur raison. `openspec-guard` est lancé par `npx` à version figée, sans entrer dans les
  dépendances du dépôt.
- **D15** — T0.0 (2026-10-08). TypeScript figé en `~6.0.3` : typescript-eslint 8.71 exige `typescript <6.1.0`, et la
  7.0 casserait le lint. pnpm figé en 11.27.0 (version installée ; passer à la 12 sera une décision à part). Tout
  l'outillage vit à la racine : `eslint .`, `tsc --noEmit -p tsconfig.json` (qui inclut `packages/*/src` et
  `packages/*/test`) et `vitest run` couvrent tout le dépôt, et `includeWorkspaceRoot: true` fait tourner ces scripts
  par `pnpm -r`. Les packages ne définissent donc pas leurs propres scripts `lint`, `typecheck` ni `test`, pour éviter
  les doubles exécutions. Dépendances de développement hors de la stack nommée, toutes nécessaires à eslint et
  TypeScript : `@eslint/js` (règles recommandées), `typescript-eslint` (parser et règles TS, dont `no-explicit-any`),
  `globals` (globales Node pour ESLint), `@types/node` (types Node, figés en 22 comme le plancher `engines`).
  Après review : plancher Node `>=22.13` (eslint 10 exige `^22.13.0`, vitest 5 `^22.12.0`). Lint typé
  (`strictTypeChecked` avec `projectService`) et `noInlineConfig` : une exception de lint passe par
  `eslint.config.js`, jamais par un commentaire. `lint` inclut `prettier --check`. Vitest `allowOnly: false`. Choix
  validés par Guillaume le 2026-10-08. Second cycle de review : `skipLibCheck: false`, revenu à `true` avec D16 (le SDK MCP référence des types DOM) en
  interdisant tout `.d.ts` écrit à la main ;
  `no-floating-promises` sans `ignoreVoid`, JavaScript réservé aux `*.config.js` de la racine.
- **D16** — Pas de build (2026-10-08, demande de Guillaume : construire de bout en bout, vite). Chaque package
  exporte `./src/index.ts` et Node exécute TypeScript directement par le type stripping natif. Plancher Node passé à
  `>=22.18`, où ce mode est actif par défaut. D'où `erasableSyntaxOnly`, des imports relatifs en `.ts`
  (`allowImportingTsExtensions`) et `noEmit` partout. Raison : le contrôle teste toujours la source, sans `dist/`
  périmé ni étape de compilation entre packages. Cela tranche le point d'import ouvert pour T1.1. Dépendance hors
  stack : `@types/libsodium-wrappers` et `@types/ws` (types de `libsodium-wrappers` et de `ws`, qui n'en publient pas).
- **D17** — Points ouverts du kit tranchés pour avancer (2026-10-08). Le message de décision s'appelle
  `approval_decision`, comme dans la table de `protocol`. `E_SCHEMA` rejoint les codes de `drop_error`. Un Drop `low`
  passe de `running` à `delivered`. Un expéditeur inconnu échoue à `E_UNKNOWN_PEER` dans l'ordre de la spec ; il n'est
  déchiffré que si le Node a une invitation en attente, et seulement accepté pour un `pair_request` au jeton valide.
  `review_request` porte un `expiresAt`, et le reçu peut porter un `errorCode` (métadonnée, pas de contenu).
- **D18** — T1.1 à T1.11 construits d'un bloc le 2026-10-08, à la demande de Guillaume (« construire de A à Z »),
  sans une change OpenSpec par tâche. Les specs `openspec/specs/` restent le contrat ; le code est vérifié par 166
  tests dont un test de bout en bout (relais et trois Nodes), et par `scripts/demo-local.sh` en processus réels. Les
  scénarios ne sont pas encore reliés à leurs tests par sélecteurs `openspec-guard` : la baseline les garde gelés,
  ce qui est une dette connue. Choix d'implémentation sans spec : `journalctl -o short-iso` au lieu de `-o cat` (il
  faut les horodatages pour `firstSeen`/`lastSeen`) ; le seuil `degraded` est `degradedThreshold` (50 par défaut) ;
  la notification macOS ne porte pas l'URL de l'UI (elle contiendrait le jeton) ; l'UI et son flux SSE acceptent le
  jeton en `?token=`, car un navigateur ne peut pas envoyer d'en-tête sur un `EventSource`.
- **D19** — Runner LLM indépendant du fournisseur (2026-10-08, demande de Guillaume : « ça devrait marcher avec
  n'importe quel agent »). Remplace le Claude Agent SDK de D6 et d'AGENTS.md. `repo.answer` appelle l'API compatible
  OpenAI `/chat/completions` par `fetch`, sans dépendance : Ollama local par défaut (`qwen3:0.6b`, gratuit, sans clé),
  ou tout autre fournisseur par `provider.baseUrl`, `provider.model` et `provider.apiKeyEnv` (nom de la variable qui
  porte la clé). La règle de D6 tient toujours : clé API, jamais un login d'abonnement. Les outils du modèle
  (`list_files`, `read_file`, `grep`) sont fournis et exécutés par la capacité sur le snapshot, ce qui remplace les
  options « à vérifier » du SDK : la frontière ne dépend plus d'un fournisseur. `maxOutputChars` de la carte vaut
  3 000 et couvre toute la sortie (`answer` reste limité à 1 500), ce qui tranche le point ouvert de T1.13 ; un
  snapshot trop gros échoue en `E_BUDGET`. Mesure réelle avec `qwen3:0.6b`, le seul modèle Ollama installé : la
  boucle répond en 1 à 3 s, mais le modèle n'appelle aucun outil et répond « unknown ». Le circuit est validé, le
  modèle est trop petit. Mesures suivantes, mêmes deux questions : `qwen3:8b` local met 60 à 166 s, appelle
  parfois les outils et cite un fichier faux. OpenRouter gratuit (clé déjà dans le trousseau, `OPENROUTER_API_KEY`) avec
  `nvidia/nemotron-3-super-120b-a12b:free` : 6 à 14 s, outils utilisés, réponses justes, 0 $. `gemma-4-31b-it:free` et
  `laguna-s-2.1:free` répondent HTTP 429 (quota gratuit saturé) : `scripts/probe-provider.ts` teste un modèle avant
  de le configurer.
- **D20** — Fournisseur par défaut de `repo.answer` : OpenRouter, `nvidia/nemotron-3-super-120b-a12b:free`, clé
  dans `OPENROUTER_API_KEY` (2026-10-08, demande de Guillaume ; mesures en D19). `apiKeyEnv: null` avec
  `baseUrl: http://127.0.0.1:11434/v1` pour Ollama local, sans clé. Seul le Node propriétaire de la capacité a la clé :
  dans la démo, les daemons du VPS et de Guillaume tournent sans `OPENROUTER_API_KEY`. Un modèle gratuit coûte 0 $ ;
  le reçu ne porte alors pas de `costUsd`.
- **D21** — Qui paie une demande (2026-10-08, choix de Guillaume : option A). Le propriétaire de la capacité paie,
  car le calcul doit tourner chez lui, avec ses accès. Il le voit avant de décider : la carte de consentement affiche
  « Coût max : 0,50 $, à votre charge », ou « gratuit » (Ollama local, modèle `:free`), ou « non mesuré » (tarifs du
  modèle absents de la config). La ligne est absente pour une capacité qui ne coûte rien (`production.error_summary`).
  Le coût réel est ensuite inscrit dans le reçu signé. Une capacité déclare son coût par `CapabilityImpl.cost(config)`.
- **D22** — Déploiement réel sur le VPS lab (2026-10-08), adapté à l'infrastructure qui tourne au lieu du Caddy et
  des unités systemd de la spec 08 : la stack `stacks/drop` de `lab-infra` (PR #97 et #98) suit les conventions du lab,
  soit Traefik v3, docker compose, une image privée construite par le runner `lab-drop` dans `127.0.0.1:5000/drop`,
  et la sonde `url:https://drop.memolabs.dev/health` pour `autodeploy`. Le relais public est
  `wss://drop.memolabs.dev/v1` ; `relay.memolabs.dev` était déjà pris par une autre app. Le Node du lab est sortant
  uniquement (`ws://drop-relay:7780/v1` par le réseau interne), uid 1000, identité dans `/opt/drop/home` en 0700, et
  n'a aucune clé LLM. Un Node s'autorise par PR sur `stacks/drop/relay.config.json`, jamais par `drop-relay allow`
  sur le serveur : le rsync du déploiement l'écraserait. Logs résumés (choix de Guillaume, même jour) : ceux de
  Traefik, qui n'écrit que sur sa sortie standard. Le conteneur `drop-logs` (`docker:28-cli` épinglé, sans réseau) est
  le seul à voir le socket Docker, l'option que la spec 08 demande de documenter puisque ce socket équivaut à root. Sa
  commande est fixe : chaque minute, il exporte `docker logs --since 24h --timestamps traefik` vers
  `/opt/drop/logs/traefik.log`, que `drop-node` lit en lecture seule (source `file`). Les erreurs sont les codes 5xx
  et `level=error`, nommées dans `stacks/drop/error-summary.json` (PR #99). Premier drop réel le 2026-10-08 : sur 24 h,
  4 erreurs `NOT_IMPLEMENTED` (501), statut `ok`, aucune ligne de log transmise, reçus signés des deux côtés. Moniteur Uptime Kuma `drop` (id 26) sur
  `https://drop.memolabs.dev/health`, notification e-mail liée, premier battement `200 - OK`. Carte `docs/architecture.md` de `lab-infra`
  régénérée par `make map` (PR #100).
- **D23** — `blocked-observer` (T0.1 à T0.5, 2026-10-08). Points « à vérifier » tranchés par lecture :
  - Hook Claude Code (https://code.claude.com/docs/en/hooks) : `PostToolUse` porte `tool_response`, mais un outil en
    échec déclenche `PostToolUseFailure`, avec un champ `error`. Les 401 et 403 arrivent souvent par là, donc le hook
    est inscrit sur les deux événements.
  - Logs Codex (codex-cli 0.156, vérifié sur 216 sessions locales) : `~/.codex/sessions/AAAA/MM/JJ/rollout-*.jsonl`.
    Les appels sont des `function_call` ou `custom_tool_call`, leurs résultats des `*_call_output` reliés par
    `call_id`, et la session est dans `session_meta`.
  Motifs : la v1 de la spec, mesurée sur 30 jours de logs Codex réels, donne 780 « blocages » (34 par jour actif),
  surtout du bruit : numéros de ligne, tables de tests, `BranchForbiddenError`, `HTTPStatus.FORBIDDEN`. La v2 exige un
  contexte HTTP pour 401 et 403 et lit « forbidden » ou « unauthorized » comme une réponse. Elle donne 202 événements
  (environ 9 par jour actif) ; sur un échantillon de 401, environ 9 sur 12 sont de vrais refus d'authentification,
  contre environ 5 sur 15 en v1. Le hook n'importe pas zod (`light.ts`) : 60 ms au lieu de 80 à 105 ms. « Jour actif »
  vient de `activity.json` : un jour avec au moins un appel d'outil Claude Code ou une session Codex, pas seulement un
  jour avec un blocage. `report_blocked` lit la session dans `CLAUDE_SESSION_ID` ou `CODEX_SESSION_ID` quand l'agent
  l'expose ; sinon le rapprochement A↔B n'a pas de session commune et reste vide.
- **D24** — Seuil go/no-go de l'étape 0, fixé par Guillaume le 2026-10-08, avant la mesure. Un « blocage YES » est
  un événement classé `YES_*` par `classify` pendant un entretien : une réponse bornée, donnée par le propriétaire de
  la ressource, l'aurait débloqué.
  - **Échantillon** : au moins 3 développeurs qui codent avec des agents, Guillaume compris, et au moins 10 jours
    actifs chacun, avec leurs blocages classés en entretien.
  - **GO** (lancer le pilote) : au moins **0,5 blocage YES par dev-jour actif** (un tous les deux jours) **et** une
    médiane d'au moins **10 minutes perdues** par blocage YES.
  - **NO-GO** : moins de **0,2** blocage YES par dev-jour actif **ou** une médiane de moins de **5 minutes**.
  - **Entre les deux** : prolonger la mesure de 2 semaines, puis trancher avec les mêmes seuils.
  Les deux chiffres sont lus dans `blocked-observer report --merge <exports…>` (`yesPerActiveDay` et
  `medianPainMinutesYes`), sur l'agrégat des exports relus de chaque développeur ; la commande applique ces seuils et
  donne le verdict (T0.6). Les signaux bruts non classés ne comptent pas : au 2026-10-08,
  Guillaume en a 202 sur 23 jours actifs côté Codex, aucun encore classé.

- **D25** — Classification et filtre de bruit de l'étape 0 (2026-10-08). Constat : classer 3 événements Codex vieux
  de plusieurs semaines avec Guillaume a donné trois « je ne sais pas », parce que la spec listait les huit codes sans
  les définir, que la mémoire d'un incident s'efface, et que la plupart des événements n'étaient pas des refus.
  - **Grille** : `docs/CLASSIFICATION.md`, un codebook au sens de MacQueen et al. (1998) : définition, ce qui entre, ce
    qui n'entre pas, un exemple par code. Le sens des huit codes est tiré de l'étape 0 de la vision (« une réponse
    bornée aurait-elle suffi ? ») ; c'est une lecture des noms, que Guillaume peut corriger.
  - **`classify` devient un arbre de décision** : quatre questions oui/non puis une raison, dans un ordre qui rend les
    codes exclusifs. L'humain ne choisit plus parmi huit codes. Les questions sont en français : `classify` sert en
    entretien.
  - **Quand classer** : le jour même ou en entretien, avec la technique des incidents critiques (Flanagan, 1954).
    Accord vérifié sur les 20 premiers événements de chaque testeur : moins de 8 sur 10, on réécrit la définition.
  - **Filtre de bruit** (`noise.ts`), mesuré sur 30 jours de logs Codex : de 202 à 62 événements. Est ignorée la sortie
    d'une commande qui n'a fait qu'afficher du contenu local, sauf échec signalé ; celle des tests et builds de l'agent ;
    celle d'une recherche web ; côté Claude Code, le résultat réussi de tout outil autre que `Bash` et les
    outils MCP (les tests et questions écrits pendant cette session avaient créé 5 événements via `Write`, `Read`,
    `AskUserQuestion`, `ToolSearch`). Le mode code de Codex ne publie pas le code de sortie de ses commandes, donc
    l'échec n'est connu que quand la sortie le dit. `import-codex` retire les événements non classés qu'un nouvel
    import ne produit plus ; un événement classé n'est jamais retiré.
  - **Constat à garder** : sur le poste de Guillaume, qui travaille seul, les vrais refus portent sur sa propre
    infrastructure. Le signal « ressource de quelqu'un d'autre » ne peut venir que de testeurs en équipe.

- **D26** — Étape 2 : installable chez n'importe qui (2026-10-08, demande de Guillaume). Constat : installer drop chez
  quelqu'un demandait six gestes de développeur, dont une PR sur lab-infra pour l'allowlist du relais. Choix :
  - **Propriétaire** : une app Mac (Tauri, barre de menus, Node embarqué), parce qu'une designer comme Julie
    n'installera pas Node. Signer et notariser demande un compte Apple Developer (99 $ par an), à prendre par Guillaume.
    Cela lève le hors-périmètre « application de barre de menu native » de la vision pour l'étape 2.
  - **Demandeur** : les chemins d'installation que chaque client fournit déjà : `.mcpb` pour Claude Desktop
    ([doc](https://claude.com/docs/connectors/building/mcpb)), lien d'installation Cursor
    ([doc](https://cursor.com/docs/mcp/install-links.md)), `codex mcp add` ([doc](https://developers.openai.com/codex/mcp))
    et `claude mcp add`.
  - **Cas d'usage** : une capacité générique `mcp.answer` répond à partir d'un serveur MCP du propriétaire, avec des
    outils en lecture seule fixés à la publication (règle D19 inchangée : la requête ne choisit jamais un outil).
    Figma pour Julie (serveur local `http://127.0.0.1:3845/mcp`,
    [doc](https://developers.figma.com/docs/figma-mcp-server/local-server-installation)) ; Notion, Linear ou Jira,
    GitHub et une base de données pour Natha.
  - **Relais** : admission par invitation signée, l'allowlist ne sert plus qu'à l'amorçage.
  - **Nom** : « drop » reste le nom provisoire du site et de l'app.
- **D27** — Le demandeur paie le modèle (2026-10-08, remplace D21 pour l'étape 2 ; c'est l'option C gardée en
  réserve). Une designer n'a pas de clé de modèle. Le demandeur crée pour une demande une clé plafonnée (OpenRouter le
  permet avec une clé de gestion et un `limit` en dollars,
  [doc](https://openrouter.ai/docs/guides/overview/auth/management-api-keys.md)), la chiffre pour l'exécuteur avec le
  reste de la demande, et l'exécuteur la jette après l'exécution. La perte maximale est le plafond, affiché sur la
  carte de consentement. Le propriétaire peut toujours configurer sa propre clé (D21), qui passe alors en premier.

- **D28** — Vision produit de l'étape 2, dictée par Guillaume le 2026-10-08. « Il faut que ce soit très très simple. »
  - **Qui paie** : par défaut le demandeur (D27). Plus tard, chaque entreprise choisit sa règle : compte d'entreprise,
    clé différente, abonnement plutôt que clé API, autre modèle. La règle de paiement doit donc rester un réglage,
    pas un choix codé en dur. Un abonnement (Claude, ChatGPT) contredit aujourd'hui la règle « clé API uniquement »
    d'AGENTS.md : à trancher le jour où une entreprise le demande.
  - **Installation en trois secondes** : l'app détecte seule les agents installés (Claude Code, Codex, Cursor, Claude
    Desktop) et leurs serveurs MCP, propose de partager ces outils et d'installer drop dans ces agents.
  - **Équipe** : l'app montre les autres membres de l'équipe inscrits, leurs agents et leurs outils disponibles, sans
    appairage un par un.
  - **Demandes multiples** : un scénario type, « où en est le projet X ? », part vers plusieurs personnes à la fois
    (GitHub chez l'un, Figma chez l'autre, un CRM chez un troisième) ; chacune accepte, l'agent assemble. Le demandeur
    peut être n'importe qui, pas seulement le patron.
  - **Suivi discret** : l'app de la barre de menus permet d'accepter, refuser, suivre les demandes en cours, et voir
    qui est connecté avec quels outils. Ce panneau reste à dessiner.
  - **Plus tard** : un RAG d'entreprise.

- **D29** — Un fichier JavaScript assemblé pour ce qui s'installe hors du dépôt (2026-10-08, T2.5). Node refuse le
  TypeScript sous `node_modules` (« Type stripping in dependencies », https://nodejs.org/api/typescript.html, lu le
  2026-10-08), donc un paquet npm, un `.mcpb` ou l'app ne peuvent pas lancer les sources `.ts`. `node scripts/bundle.ts`
  produit avec `esbuild` 0.28.2 (dépendance de développement ajoutée pour cette seule raison) `dist/drop.mjs` (CLI et
  daemon) et `dist/drop-mcp.mjs` (serveur MCP du demandeur) ; `--mcpb` emballe en plus `dist/drop.mcpb` pour Claude
  Desktop avec la CLI officielle `@anthropic-ai/mcpb` 2.1.2 (manifeste 0.3). Le développement reste sans build (D16).
  Le script d'installation d'esbuild est refusé (`allowBuilds: esbuild: false`) : son binaire vient de sa dépendance
  optionnelle propre à la plateforme. `drop install` copie `drop-mcp.mjs` dans `DROP_HOME/bin` et le déclare avec le
  chemin absolu de node, parce que Claude Desktop et Cursor lancent les serveurs avec un PATH minimal.

- **D30** : T2.6a, documentation et vitrine locale (2026-10-08, demande de Guillaume). Trois pages HTML/CSS, sans framework ni dépendance supplémentaire, une simulation pédagogique sans connexion aux Nodes et trois SVG partagés avec les guides. `scripts/site.ts` assemble une allowlist publique dans `dist/site` et prévisualise sur `127.0.0.1` ; le dépôt entier n’est jamais servi. Les exports Markdown pointent vers le snapshot de code analysé. Le bilan est daté et distingue les tests, la traçabilité des specs et les démonstrations historiques. T2.6 garde la vidéo et la publication sur le domaine prévu, soumise au point d’arrêt humain existant. La demande autorise la rédaction et la réalisation immédiates ; les lignes déjà en cours n’ont pas été requalifiées. Le passage de T2.9 et T2.5 à done pendant cette session est intégré au bilan, au commit `cacf1cc`.

- **D30** — Architecture de l'app Mac (2026-10-08, T2.4). Le panneau est une page servie par le Node local sur `/app`,
  derrière son jeton et une politique de contenu qui n'autorise que lui-même ; l'app Tauri 2
  (https://v2.tauri.app/learn/system-tray/, https://v2.tauri.app/plugin/deep-linking/, lus le 2026-10-08) n'est qu'une
  coquille : icône de barre de menus, fenêtre de 380 × 620 qui affiche cette page, lancement et arrêt du daemon, liens
  `drop://pair`. Avantages : une seule logique, testée comme le reste du Node, et le même panneau dans un navigateur. L'app
  embarque le binaire Node qui l'a construite (arm64 pour l'instant) plutôt qu'un exécutable unique Node : les sources
  sont des modules ES et le CLI utilise l'`await` de haut niveau. Taille : 150 Mo pour le `.app`, 45 Mo pour le `.dmg`.
  Seule la version finale s'inscrit au démarrage de la session, pour qu'une version de développement n'y reste pas. Le
  Mac de Guillaume a le certificat « Developer ID Application » ; la notarisation demande ses identifiants Apple
  (`xcrun notarytool store-credentials`), à saisir par lui. Les liens `drop://` ne marchent qu'avec l'app installée
  dans `/Applications`, selon la doc du plugin.

- **D31** — Pour les non-techniciens qui utilisent ChatGPT ou Claude (2026-10-08, demande de Guillaume : « comprendre
  l'intention sans la complexité, deux clics »). Les applications grand public n'acceptent que des connecteurs MCP
  **distants** : une URL HTTPS et OAuth avec enregistrement dynamique du client (Claude : Réglages → Connecteurs →
  ajouter, gratuit limité à un connecteur ; ChatGPT : mode développeur, connecteurs en lecture seule sur Plus et Pro,
  complets sur Business, Enterprise et Edu, guides tiers lus le 2026-10-08, à revérifier dans l'aide officielle).
  Choix de Guillaume : une **passerelle** sur `drop.memolabs.dev` (connecteur MCP distant + OAuth) ; la connexion se
  confirme dans l'app drop du poste (« Autoriser Claude à demander à ton équipe ? »), puis la passerelle transmet chaque
  appel au Node de l'utilisateur par le relais. Les clés et le consentement restent sur les postes. La passerelle voit
  les questions et les réponses en clair, comme ChatGPT et Claude eux-mêmes, et n'en garde rien.
- **D32** — Un seul outil pour l'intention : « Demander à mon équipe » (`ask_team`, une question en langage courant,
  sans identifiant ni schéma). drop choisit les destinataires par des **règles** déterministes, sans modèle : un prénom
  cité dans la question, sinon le genre de chaque outil partagé (Figma pour une maquette, GitHub pour une PR, un CRM pour
  un client…) ; trois destinataires au plus, et aucun envoi quand rien ne correspond (drop dit alors qui peut aider).
  Choix de Guillaume, pour rester prévisible et gratuit.
- **D33** — A2A dans les deux sens (choix de Guillaume). Spécification A2A v1.0.0 (https://a2a-protocol.org/latest/specification/,
  lue le 2026-10-08) et SDK officiel `@a2a-js/sdk` 1.3.0, qui implémente la v1.0. Entrant : l'équipe est un agent A2A
  (carte `/.well-known/agent-card.json`, un savoir-faire par capacité, `SendMessage`, `GetTask`) ; une tâche reste
  `TASK_STATE_WORKING` pendant l'attente de l'accord, devient `TASK_STATE_COMPLETED` avec la réponse relue,
  `TASK_STATE_REJECTED` sur un refus, `TASK_STATE_FAILED` sur une expiration ou une erreur. Sortant : une capacité
  `a2a.answer` permet à une entreprise de brancher son propre agent A2A comme source de réponses, comme `mcp.answer`.
- **D34** — Clôture de T2.1 (2026-10-09). Revue de sécurité de l'admission par invitation : la course entre deux
  connexions qui présentent le même ticket est fermée (le test du `nonce` et son écriture se font d'un seul pas
  synchrone), le `nonce` n'est jamais journalisé. Un trou corrigé : le relais acceptait un ticket au `expiresAt`
  arbitrairement lointain, alors que la spec le borne à 24 h ; un ticket qui dépasse 24 h et 5 min (même dérive
  d'horloge que les enveloppes) est désormais refusé (`too_long`). Deux points restent ouverts, ci-dessous. Hors de ce
  dépôt : `lab-infra/stacks/drop/relay.config.json` doit fixer `admittedPath` sur un volume persistant, sinon le relais
  oublie les Nodes admis à chaque redéploiement.

## À décider par l'humain

- **Nom de produit** : à vérifier (nom + domaine) avant le pilote.
- **Points ouverts**, à trancher au début de la tâche citée. Ce sont les incohérences héritées du kit d'origine,
  relevées pendant la migration, plus la convention d'import relevée en review de T0.0 :
  - T1.2 : le message de décision s'appelle `drop_decision` dans la séquence d'architecture et `approval_decision`
    dans la table des messages de `protocol`.
  - T1.2 : un Drop `low` passe-t-il directement de `running` à `delivered` ?
  - T1.1 : convention d'import entre packages (`@drop/protocol` depuis les autres). Un `exports` vers `dist/` casse le
    contrôle sans build, ou valide un `dist/` périmé. Options : condition d'export `source` vers `src/` avec
    `customConditions`, ou `paths` dans tsconfig plus un alias vitest.
  - T1.2 : `E_SCHEMA`, émis par le runner et les capacités, est absent de la liste fermée des codes `drop_error`.
  - T1.3 : TTL de la file du relais, 10 min dans l'architecture, purge à `exp` (jusqu'à `ts` + 15 min) dans `relay`.
  - T1.3 : nature du code `4403` (fermeture WebSocket ou réponse), et si `4401` couvre une mauvaise signature.
  - T1.3 : comportement quand la file d'un destinataire a déjà 100 enveloppes.
  - T1.7 : le seuil `degraded` n'a pas de champ de config, `status` n'est pas défini si la source est absente, et la
    lecture d'une source `file` n'est pas précisée.
  - T1.10 : les outils s'appellent `get_result`/`capabilityId` dans la séquence d'architecture et
    `get_drop_result`/`capability_id` dans `requester-mcp`, qui fait foi. `drop print-instructions` manque dans la CLI
    de `node`.
  - T1.8 : le « quota » vérifié à l'étape 3 de la séquence n'est défini nulle part.
  - T1.13 : `maxOutputChars` porte sur la sortie sérialisée entière, alors que `answer` est limité à 1 500
    caractères. Un `answer` à la limite ferait échouer la validation de taille.
  - T1.13 : aucun code d'erreur n'est prévu pour un snapshot au-delà de `maxSnapshotBytes`, ni pour le post-contrôle
    d'extrait de code.
  - T2.1, relevé en clôture (D34) : l'admission est transitive. Un Node admis parraine 20 Nodes par jour, qui
    parrainent chacun 20 Nodes ; le quota ne borne donc pas la croissance, seulement sa vitesse. Aucune révocation
    n'existe non plus (`admittedPath` s'édite à la main, puis redémarrage). Le risque se limite à la charge du relais :
    l'admission ne donne accès à personne, l'appairage exige toujours le jeton de l'invitation. Options : quota global
    par jour, profondeur de parrainage maximale, commande `drop relay revoke`. À trancher avant d'ouvrir le relais
    au-delà des testeurs.
  Détail : `coverage.md` de la change `migrate-spec-kit` (archivée sous `openspec/changes/archive/`).
- **Financement des demandes, options gardées pour plus tard** (D21 a retenu A). B : une clé d'équipe ou
  d'organisation sur chaque Node ; aucun code, c'est la variable d'environnement. C : le demandeur finance, en joignant
  à sa demande une clé jetable à plafond dur (OpenRouter sait en créer), chiffrée pour l'exécuteur ; il faut l'ajouter
  au protocole et à la carte. D : refacturation, où le propriétaire paie et les reçus signés (`costUsd`) servent de
  relevé. C ou D ne valent que si drop sert entre entreprises différentes ; à trancher à ce moment-là.
