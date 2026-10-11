# Journal des décisions

## Applicabilité depuis le 9 octobre 2026

D34 à D38 fixent la cible adoptée. Les décisions antérieures restent des preuves historiques : D7/D22 (relais lab), D20 (OpenRouter par défaut), D27/D28 (financement demandeur) et D31 (passerelle distante) ne sont pas des exigences du profil privé. T3.1 remplace les défauts imposés ; les intégrations cloud historiques restent des options explicites hors profil privé. D24 reste inchangée. Les deux entrées D30 sont conservées avec leur titre pour ne pas casser les références historiques. Depuis le 10 octobre 2026, D47 à D58 précisent la cible : D31 n’est plus une cible de départ, la délégation et le contexte partagé décentralisé sortent du hors-périmètre, et la connexion compte trois modes sans relais de secours par défaut.

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

Les décisions D69 à D75 ont été prises le 9 octobre 2026 sur la branche principale sous les numéros D34 à D40, en même
temps que D34 à D46 sur la branche du profil privé. Elles ont été renumérotées à la réunion des deux branches
(10 octobre 2026), références comprises ; les numéros D34 à D46 gardent le sens du profil privé.

- **D69** — Clôture de T2.1 (2026-10-09). Revue de sécurité de l'admission par invitation : la course entre deux
  connexions qui présentent le même ticket est fermée (le test du `nonce` et son écriture se font d'un seul pas
  synchrone), le `nonce` n'est jamais journalisé. Un trou corrigé : le relais acceptait un ticket au `expiresAt`
  arbitrairement lointain, alors que la spec le borne à 24 h ; un ticket qui dépasse 24 h et 5 min (même dérive
  d'horloge que les enveloppes) est désormais refusé (`too_long`). Deux points restent ouverts, ci-dessous. Hors de ce
  dépôt : `lab-infra/stacks/drop/relay.config.json` doit fixer `admittedPath` sur un volume persistant, sinon le relais
  oublie les Nodes admis à chaque redéploiement.
- **D70** — Mises à jour signées de l'app Mac (2026-10-09, T2.4, choix de Guillaume). Le dépôt est privé, donc l'app
  ne peut pas lire les Releases GitHub sans jeton : les mises à jour sont servies en statique sous
  `https://drop.memolabs.dev/updates/` (`latest.json` et une archive nommée par version). L'app vérifie au lancement
  puis toutes les 6 h et propose la version dans le menu de son icône ; rien ne s'installe sans clic. Plugin updater
  de Tauri 2.13.2 (doc lue le 2026-10-09 dans tauri-docs, branche v2, et le source du plugin) avec
  `requireSignedVersion` : la CLI Tauri 2.12.1 inscrit la version dans le commentaire signé, ce qui empêche de
  ressortir une ancienne archive signée sous un numéro plus récent. La clé privée est générée et gardée par Guillaume
  (procédure dans `apps/mac/README.md`) ; seule la clé publique, `apps/mac/updater.pub`, entre dans le dépôt. Hors de
  ce dépôt : une route statique `/updates` dans `lab-infra/stacks/drop`. Le manifeste est validé sans zod pour ne pas
  ajouter de dépendance à la racine.
- **D71** — Durcissement de la passerelle (2026-10-09, T2.13, plan accepté par Guillaume). Trois trous relevés en
  revue. (1) Hameçonnage du consentement : le nom de l'assistant vient de l'enregistrement dynamique, ouvert à tous ;
  un tiers pouvait enregistrer « Claude » avec sa propre adresse de retour et faire autoriser sa session par la
  victime, puis interroger l'équipe en son nom. Le lien `drop://link` porte désormais `client_id` et le domaine de
  retour, affichés par la page et le panneau (avertissement si ce n'est ni `claude.ai`, ni `chatgpt.com`, ni
  `chat.openai.com`) ; `link_grant` répète ce qui a été affiché, et la passerelle refuse s'il ne correspond pas à la
  session. Un lien truqué ne peut donc pas afficher `claude.ai` pour une session qui renvoie ailleurs. (2) Retrait :
  `agent_call` porte `clientId`, et le Node n'exécute que les appels d'un assistant encore relié ; les liens
  enregistrés avant gardent leur portée sur toute la passerelle. (3) Abus : un client sans jeton est oublié après
  24 h, et au-delà de 1 000 clients sans jeton ou de 1 000 sessions ouvertes, le plus ancien est oublié. Le plan
  accepté prévoyait un 503 ; il a été remplacé en cours de réalisation, parce qu'un 503 laissait 1 000 requêtes par
  jour bloquer tous les nouveaux utilisateurs, alors que l'éviction oblige à dépasser en continu le rythme d'une vraie
  connexion. L'état
  persisté est validé par un schéma zod au lieu de `z.any()`. Changement de protocole incompatible pour `link_grant`
  et `agent_call` : passerelle et Nodes se mettent à jour ensemble, ce qui convient tant que la passerelle n'est pas
  ouverte au public. Les adresses de retour de Claude et ChatGPT sont à revérifier dans leur aide officielle au
  premier essai réel.
- **D72** — Site public (2026-10-09, T2.6, choix de Guillaume). Trois pages s'ajoutent au site de T2.6a :
  « Démarrer en 5 minutes », « Cas d'usage », « Sécurité » ; l'accueil gagne la démo réelle en trois captures et une
  section d'installation. Tant que l'app n'est pas notarisée (T2.4) et que npm est bloqué (T2.11), `site/site.json`
  est en `beta` : un accès sur invitation, aucun lien de téléchargement ; passer à `open` affiche l'app Mac, le
  `.mcpb` et les guides, sans autre changement. `contact` reste vide tant que Guillaume n'a pas choisi l'adresse à
  publier. Le site est servi par l'image drop (`node scripts/site.ts serve`, rendu en mémoire, aucune écriture),
  sur l'hôte public seulement, avec HSTS et la politique de contenu sans script ; il sert aussi les fichiers de
  mise à jour de l'app (D70) depuis `SITE_RELEASES_DIR`, par nom exact. Hors de ce dépôt, dans
  `lab-infra/stacks/drop` : un service `drop-site` (même image, cette commande, le dossier des releases en volume)
  et les routes Traefik de `drop.memolabs.dev` : `/v1` et `/health` vers le relais ; `/oauth`, `/mcp`,
  `/.well-known/oauth-*` et `/gateway` vers la passerelle ; tout le reste vers le site. La vidéo n'est pas tournée :
  l'accueil montre les captures de la démo du 8 octobre et l'annonce pour les premiers essais (T2.7). Les exports
  Markdown pointent vers le dépôt, qui est privé : à revoir avant la mise en ligne.
- **D73** — Préparation des essais réels (2026-10-09, T2.7). Protocole dans `docs/essais/README.md`. Ce que la
  confrontation aux vrais serveurs a montré, sources lues ce jour : Figma se branche par le serveur local de l'app de
  bureau (`127.0.0.1:3845/mcp`, sans jeton), mais exige un siège Dev ou Full (sinon 6 appels d'outil par mois) et lit
  la sélection ou un lien ; GitHub par `api.githubcopilot.com/mcp/readonly` avec un jeton en en-tête ; Linear par
  `mcp.linear.app/mcp/readonly` avec une clé d'API en en-tête (d'après les résultats de recherche, la doc n'était pas
  joignable d'ici). Deux manques deviennent des tâches : un serveur qui exige OAuth se partage sans erreur puis échoue
  à chaque demande (T2.16), et drop ne sait pas se connecter aux serveurs distants OAuth (T2.17). Pour Notion, voir le
  point ouvert ci-dessous.
- **D74** — Connexion OAuth de drop aux serveurs MCP distants (2026-10-09, T2.17, plan accepté par Guillaume). drop
  s'enregistre comme son propre client (enregistrement dynamique, nom « drop »), avec le client OAuth du SDK MCP déjà
  installé, sans dépendance nouvelle. Connexion une fois, par `drop connect <agent>/<serveur>` ou le bouton du panneau ;
  le navigateur revient sur l'API locale (`127.0.0.1:<port>/oauth/callback`), vérifié par un `state` à usage unique de
  10 minutes ; le vérificateur PKCE ne vit qu'en mémoire, avec la connexion en cours. Jetons sous `DROP_HOME/oauth`
  (0700, fichiers 0600), comme la clé d'identité ; une exécution ne fait que les réutiliser et les rafraîchir. Exclus :
  le serveur distant de Figma, réservé à une liste de clients approuvés par leur nom (s'en faire passer pour un
  enfreindrait ses conditions) ; le serveur local de l'app reste la voie. Linear garde aussi la clé d'API. Vérifié
  contre un faux serveur conforme ; l'essai réel avec un compte Notion reste à faire, T2.17 reste `doing` jusque-là.
- **D75** — Révocation et plafond global au relais (2026-10-09, T2.19, choix de Guillaume), qui tranche le point ouvert
  de D69. `drop-relay revoke <nodeId>` écrit dans `revokedPath`, que le relais relit toutes les 2 s : pas de
  redémarrage, pas de port d'administration ; le relais et la commande partagent le fichier par le volume. Un Node
  révoqué est coupé, refusé même avec un nouveau ticket ou dans l'allowlist, et ses tickets ne valent plus rien. Par
  défaut, ses invités gardent leur place (un membre qui part ne doit pas couper ceux qu'il a fait venir) ;
  `--with-invited` les révoque de proche en proche, pour un parrain malveillant. `maxAdmissionsPerDay` (100) borne la
  croissance que le quota par sponsor ne bornait pas. Dans `lab-infra/stacks/drop/relay.config.json` : ajouter
  `revokedPath` sur le même volume que `admittedPath`.

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
  - T2.1, relevé en clôture (D69), **tranché par D75** : l'admission est transitive. Un Node admis parraine 20 Nodes par jour, qui
    parrainent chacun 20 Nodes ; le quota ne borne donc pas la croissance, seulement sa vitesse. Aucune révocation
    n'existe non plus (`admittedPath` s'édite à la main, puis redémarrage). Le risque se limite à la charge du relais :
    l'admission ne donne accès à personne, l'appairage exige toujours le jeton de l'invitation. Options : quota global
    par jour, profondeur de parrainage maximale, commande `drop relay revoke`. À trancher avant d'ouvrir le relais
    au-delà des testeurs.
  - T2.7, Notion (D73) : le serveur local `@notionhq/notion-mcp-server` 2.5.2 marque toute requête POST comme
    destructive, dont la recherche (`post-search`) et la requête de base (`query-data-source`) ; `mcp.answer` retire
    ces outils, si bien que drop ne lit qu'une page dont la question donne le lien. Options : (a) accepter la limite
    pour l'essai ; (b) laisser le propriétaire autoriser nommément un outil marqué destructif, après un avertissement,
    ce qui assouplit une règle de sécurité ; (c) attendre T2.17 et le serveur distant de Notion, qui cherche.
    Recommandation : (a) pour l'essai, puis (c). Mise à jour : (c) est construit (D74), à essayer avec un vrai
    compte Notion.
  Détail : `coverage.md` de la change `migrate-spec-kit` (archivée sous `openspec/changes/archive/`).
- **Financement des demandes, options gardées pour plus tard** (D21 a retenu A). B : une clé d'équipe ou
  d'organisation sur chaque Node ; aucun code, c'est la variable d'environnement. C : le demandeur finance, en joignant
  à sa demande une clé jetable à plafond dur (OpenRouter sait en créer), chiffrée pour l'exécuteur ; il faut l'ajouter
  au protocole et à la carte. D : refacturation, où le propriétaire paie et les reçus signés (`costUsd`) servent de
  relevé. C ou D ne valent que si drop sert entre entreprises différentes ; à trancher à ce moment-là.

## Tournant privé et open source adopté

- **D34 : souveraineté et cible (2026-10-09).** Guillaume adopte l'outillage A2A/MCP installé chez le client, sans compte ni serveur externe imposé, pour petites équipes techniques et entreprises avec leurs propres agents/modèles. A2A est un standard existant ; le différenciateur est le consentement borné et le raccordement simple. Un relais privé est conservé ; aucun besoin de supprimer HTTP/WebSocket local ou interne. Les défauts cloud du prototype ne valent pas pour ce profil. Le propriétaire fixe les destinations, y compris face au financement ; aucun fallback cloud, aucune télémétrie ou licence en ligne obligatoire. Les agents A2A joints restent une frontière à vérifier. T3.1/T3.5 doivent le prouver, pas cette documentation. D24 et HARNESS FIRST restent en vigueur.
- **D35 : desktop (2026-10-09).** Garder Tauri 2, le panneau web local et Node embarqué. Mac de barre de menus en premier, Windows puis Linux. SwiftUI natif et Electron demanderaient une réécriture sans bénéfice prouvé à ce stade. Le tray est intégré au système ; le panneau n'est pas SwiftUI. Pas de comparaison de performance inventée. Sources : `research/2026-10-09-desktop-models.md`. Linux exige un accès au panneau sans tray si l'environnement ne le propose pas.
- **D36 : deux confirmations (2026-10-09).** Après installation et environnement prêt : analyser les configurations compatibles, puis connecter les agents sélectionnés. Adapter explicitement Claude Code, Codex, Cursor et Claude Desktop ; aucune promesse de détection universelle. Aperçu expurgé, aucune exécution découverte, aucune publication implicite, sauvegarde, idempotence, concurrence et restauration. Les permissions système, invitations, redémarrages d'agents et modèles sont visibles séparément. `docs/ONBOARDING.md` et `ACCEPTANCE.md` portent les détails de T3.3.
- **D37 : gratuit local (2026-10-09).** Réutiliser d'abord l'endpoint choisi ou l'agent A2A interne ; aucune inférence pour les capacités déterministes. Ollama et Qwen3.5 4B/9B quantifiés sont des candidats, à télécharger avec consentement et à mesurer en T3.2 avant de choisir un défaut. Ne pas confondre taille de poids et mémoire totale, modèle cloud gratuit et traitement local. D20 reste le comportement historique ; T3.1 doit le remplacer dans le profil privé.
- **D38 : modèle open source (2026-10-09).** Préparer Apache-2.0 pour le code détenu par le projet. Le socle Community inclut auto-hébergement, A2A/MCP, modèles internes et sécurité essentielle, sans limitation artificielle de requêtes. Revenu envisagé par installation, intégration, maintenance et support ; administration d'organisation privée possible plus tard, sans produit ni prix validés. Les dons restent complémentaires. Kit de contribution et sécurité maintenant ; ouverture du dépôt, npm, binaires et publication du site restent T3.6 avec accord humain. Licences et attributions tierces, historique, données et CI du lab doivent être audités avant ouverture. Aucune dépendance ajoutée par T3.0.

- **D39 : Hermes et fournisseurs, pistes consignées (2026-10-09).** À la demande du propriétaire, ajouter T3.1a et T3.2a sans changer la priorité T3.1 ni la stack imposée. Hermes Agent de Nous Research est un agent partenaire candidat : tester notre MCP stdio comme entrée, sans remplacer le runner ni son consentement, sans présumer un support A2A natif. [Projet](https://github.com/NousResearch/hermes-agent), [MCP officiel](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), consultés le 9 octobre. Pour les fournisseurs LLM, garder d’abord le client OpenAI-compatible par `fetch`. [AI SDK](https://github.com/vercel/ai) est candidat pour des adaptateurs TypeScript directs sans Vercel AI Gateway obligatoire ; [LiteLLM](https://docs.litellm.ai/docs/) est une option de passerelle privée, pas un service ajouté d’office au laptop. Vérifier versions, licences, outils, erreurs, budgets, destinations et coût de maintenance avant adoption. Le logiciel gratuit ne rend pas les API gratuites et aucune solution ne couvre nécessairement toutes les fonctions de tous les fournisseurs. La règle « sans SDK » reste applicable tant qu’une nouvelle décision motivée ne l’amende pas. Les critères sont dans ACCEPTANCE ; ces évaluations ne bloquent pas la première preuve privée.


- **D40 : profil privé exécutable (2026-10-09, T3.1).** Liste d’origines sur IP privées canoniques, pas de DNS ni de redirection ; transport HTTP direct sans proxy implicite. Le propriétaire conserve endpoint et modèle ; financement incompatible refusé, et mode privé `payer: owner` refusant tout financement reçu. L’URL Ollama locale est proposée, mais aucun modèle n’est présélectionné (D37), aucun poids téléchargé. Les sources MCP stdio/docker/journald sont refusées faute d’isolation vérifiable ; le MCP demandeur stdio reste disponible. L’hôte doit isoler les services sources. Migration explicite et sauvegarde privée, révocation au redémarrage, identifiants de demandes reçues conservés sans contenu pour empêcher la reprise d’un ancien consentement. Le modèle est validé avant connexion MCP. Une séparation de l’API importable et de l’exécutable requester-mcp corrige un démarrage involontaire révélé par l’assemblage sur installation vierge. Aucune dépendance runtime ajoutée. D20 est remplacée ; les démos historiques nomment explicitement leur fournisseur et leur profil legacy.

- **D41 : pistes proposées pendant T3.1 (2026-10-09, sans adoption).** Le texte transmis sur libp2p, OPA, ContextForge et Bifrost alimente l’évaluation, pas la stack obligatoire. Garder le relais interne actuel ; libp2p seulement si un besoin P2P mesuré le justifie. OPA est une piste de politiques administrables, pas une isolation des outils. ContextForge et Bifrost resteraient des intégrations chez le client ; Bifrost pourra être comparé aux options de T3.2a sans migration immédiate. PostgreSQL, Drop Cloud obligatoire, Opik et nouvelle pile de déploiement ne sont pas requis pour le laptop. Aucun déploiement VPS ni retour à Coolify. Sources officielles consultées : [libp2p](https://github.com/libp2p/js-libp2p), [OPA](https://www.openpolicyagent.org/docs), [ContextForge](https://github.com/IBM/mcp-context-forge), [Bifrost](https://github.com/maximhq/bifrost).

- **D42 : résultat de l’évaluation Hermes (2026-10-09, T3.1a).** Retenir une recette MCP manuelle facultative, différer l’auto-détection et la distribution d’un adaptateur. Le commit amont `73162b00eefde3794bed0afb53d84a19c0eed230` (MIT) passe accord/refus/expiration via son client MCP réel ; sa boucle AIAgent appelle le catalogue Drop avec un endpoint local simulé puis remonte une panne 503 sans connexion externe observée. Ce n’est pas une qualification de poids de modèle ni de Hermes sur macOS. `DROP_AGENT=other`, trois outils seulement ; aucun remplacement du runner, aucun ajout runtime Drop. La preuve utilise une installation Python editable jetable, réseau none, profil sans mémoire personnelle. Hermes conserve des diagnostics de requête locaux en cas de panne : la recette exige isolation et gestion de rétention, sans promettre la souveraineté de son profil général. Coût : pin, vérification des API/config et six scénarios à rejouer à chaque évolution ; retrait et sources dans [HERMES](HERMES.md). D39 est précisée, pas la stack de fournisseurs.

- **D43 : borne anti-rejeu (2026-10-09, T3.1b, choix de Guillaume).** Les nouvelles demandes Drop exigent un identifiant UUIDv7 horodaté ; les clients intégrés en émettent déjà. Un client tiers qui envoie un UUIDv4 doit migrer (**rupture de compatibilité explicite**). Fenêtre de fraîcheur et durée des tombstones bornées à la fenêtre de rejeu du protocole, avec marge de futur ; un identifiant trop ancien ou non v7 est rejeté avant tout consentement. Conserver une borne supérieure de stockage et refuser sans exécuter si elle est atteinte. Le relais limite par identité de Node malgré les reconnexions, plutôt que par socket. Une horloge persistante monotone doit empêcher qu’un retour en arrière de l’horloge ne rende un identifiant purgé réutilisable. Aucun nouveau fournisseur, compte ou serveur externe.

- **D44 : rétention bornée et révocation différée (2026-10-09, T3.1c).** Une carte de consentement ou de relecture visible ne peut pas être écrasée par un autre message portant le même `dropId`, même signé par un pair connu. Les enveloppes hors ligne gardent leur ordre d'émission pendant les tentatives de vidage ; un seul vidage s'exécute et son envoi en cours compte dans le plafond de 1 024. Pour une clé plafonnée OpenRouter facultative, un échec de DELETE conserve uniquement son hash en mémoire, journalise un code stable et déclenche de nouvelles tentatives sur les ticks du Node, avec délai croissant ; au plus 8 192 clés non expirées ou créations en cours sont suivies. Une création réserve sa place avant l'appel fournisseur, refuse les doublons et libère la place après échec. La clé créée expire également au bout de deux heures chez le fournisseur. Le Node ne peut pas garantir une révocation immédiate si celui-ci est indisponible, ni reprendre une suppression après un crash avec ce seul état volatil : l'API ne doit pas décrire une tentative comme une révocation confirmée. La durabilité des révocations et les autres chemins de financement restent à traiter séparément avant un usage multi-organisation sensible.

- **D45 : raccordement local T3.3 (2026-10-09).** Le panneau demande explicitement l'analyse puis la connexion d'une sélection. Le Node relit la configuration au moment de l'application et compare son empreinte ; une entrée `drop` différente bloque l'action. Cursor et Claude Desktop utilisent un fichier temporaire renommé et une sauvegarde privée limitée à trois versions par fichier ; Claude Code et Codex restent configurés par leurs CLI officielles, sans suppression préventive avant l'ajout. Le résultat CLI est relu et un état incertain n'est pas annoncé comme un succès. La déconnexion retire seulement l'entrée reconnue. L'ancien installateur direct est supprimé et la route historique du panneau refuse l'action sans aperçu. Une concurrence externe dans l'intervalle final lecture-renommage et l'absence de transaction des CLI restent des limites documentées ; aucune restauration intégrale automatique ne peut effacer un ajout tiers.

- **D46 : app Mac T3.4 (2026-10-09, direction visuelle de Guillaume).** Conserver un panneau discret et familier sur Mac : typographie système, palette neutre existante, accent vert réservé aux actions et états, navigation clavier et VoiceOver avant toute décoration. La coque vérifie qu'elle parle au Node qu'elle a démarré avant d'ouvrir une URL contenant le jeton ; une collision de port s'affiche comme un échec récupérable. Aucun service d'update n'est imposé : première distribution par DMG signé/notarisé, téléchargement et remplacement volontaires par le canal choisi. Le script de release refuse une construction sans prérequis de notarisation ; le paquet de développement n'est pas une preuve de distribution. Une mise à jour future à l'intérieur de l'app demanderait un contrat et une clé de signature spécifiques, non ajoutés ici. [Recette Mac](MAC_RELEASE.md).

## Repositionnement (10 octobre 2026, grilling avec Guillaume)

Ces décisions viennent d'un grilling mené le 10 octobre 2026 et des recherches qui l'ont nourri (sources dans `docs/research/2026-10-10-repositionnement.md`). Elles précisent D34 à D38 sans les annuler : la souveraineté reste la référence de conception. Rien n'est encore validé avec de vrais utilisateurs ; chaque hypothèse porte son critère de validation dans le PRD.

- **D47 : problème et positionnement (2026-10-10, choix de Guillaume).** Le premier problème traité : un agent a besoin d'une information qui vit dans les outils d'un collègue. Suivent l'avancée réelle pour un responsable, puis les non-techniciens passant par ChatGPT ou Claude, puis les agents de deux organisations. Positionnement : « la réponse, pas l'accès ». Le marché étudié (Glean, agentgateway, Preloop, Kong, Agent 365) contrôle des accès ; drop fait valider par le propriétaire la réponse qui sort et se place comme couche de consentement humain au-dessus d'A2A, sans le concurrencer.
- **D48 : cible (2026-10-10, choix de Guillaume).** Premiers utilisateurs : Guillaume puis deux amis techniques dans des contextes différents. Ouvert à tous, mais conçu selon les exigences d'une grande entreprise souveraine (A2A, zéro dépendance externe, cas rapporté par un ingénieur de Synopsys). Adoption par les petites équipes et PME ; aucun revenu attendu des grands comptes au départ. Le demandeur est technique ; le propriétaire de la donnée peut ne pas l'être. D31 n'est plus une cible de départ.
- **D49 : propriétaire sans agent (2026-10-10).** Deux voies dès maintenant : répondre à la main dans le panneau (texte ou fichier, même consentement et même reçu), ou laisser un agent fourni par drop répondre après accord, avec un modèle choisi par le propriétaire.
- **D50 : échelle des échanges (2026-10-10, tranché par l'agent à la demande de Guillaume).** Cinq niveaux : 1 fait publié servi sans modèle ; 2 petite question traitée dans un appel neuf, sans outil, sur un contexte déclaré partageable, jamais depuis la session vivante de l'agent ; 3 capacité (existant) ; 4 tâche déléguée (Task A2A longue, jalons INPUT_REQUIRED, ré-approbation si le périmètre s'élargit, budget et expiration) ; 5 conversation libre exclue. Raison : fuites mesurées dans les échanges entre agents (AgentLeak 2026 : 68,8 % dans les messages intermédiaires ; ConVerse 2025 : jusqu'à 88 % d'attaques de confidentialité réussies). Ordre de livraison : 3, 1, 2, 4. Ceci remplace l'exclusion de la délégation dans la vision.
- **D51 : contexte partagé décentralisé (2026-10-10, tranché par l'agent).** Un fait signé (énoncé, propriétaire, source, validité, public) reste sur le nœud de son propriétaire. Seul un catalogue de sujets sans contenu circule. Aucun agent n'écrit chez un autre : une proposition passe par une boîte de suggestions validée par l'humain. Un fait expiré n'est plus servi ; un fait contredit est invalidé, pas effacé. Limites écrites : une réponse livrée ne se rappelle pas, le catalogue révèle qui sait quoi, des réponses partielles peuvent s'agréger. Ceci remplace l'exclusion du contexte partagé dans la vision ; le RAG central reste exclu.
- **D52 : promesse de sécurité publique (2026-10-10, tranché par l'agent).** « Tes données restent sur ta machine. Seule une réponse que tu as approuvée en sort, chiffrée, vers la personne qui l'a demandée. Aucun index central, aucun serveur qui lit, code ouvert et journal local de tout ce qui est sorti. » Toujours accompagnée de sa limite : drop contrôle ce qui passe par drop ; un connecteur ou un modèle choisi par le propriétaire peut avoir ses propres flux.
- **D53 : connexion (2026-10-10, choix de Guillaume).** A2A ne fournit ni découverte locale, ni traversée de NAT, ni pair à pair : il suppose des endpoints HTTPS joignables. Trois modes : réseau local par découverte mDNS ; Internet par iroh embarqué (MIT/Apache-2.0, connexion directe dans environ 9 cas sur 10) ; entreprise par le relais drop interne livré en binaire, image Docker et chart Helm, en TLS sur 443. Par défaut, aucun relais de secours : si la connexion directe échoue, l'app l'explique et propose d'en activer un (relais de test n0 signalé comme tiers, relais Memo Labs sur demande d'une équipe, ou relais auto-hébergé). Chiffrement de bout en bout dans tous les modes. iroh devient une dépendance candidate, à justifier dans la change qui l'introduit.
- **D54 : politique d'entreprise (2026-10-10, choix de Guillaume).** Une politique signée, déployée par l'informatique (MDM), fixe les clients autorisés, l'interdiction des passerelles publiques, le relais interne obligatoire et les fournisseurs de modèles autorisés. Le poste l'applique et le relais interne la vérifie à nouveau. ChatGPT, qui n'accepte qu'un serveur MCP distant en HTTPS, passe par la passerelle publique de Guillaume, en option ; une entreprise peut l'interdire avec la garantie qu'aucun flux ne touche ce serveur.
- **D55 : raccordement des agents (2026-10-10, choix de Guillaume).** drop reste un serveur MCP standard. La détection est déterministe et doit couvrir les treize clients compatibles recensés (Claude Code, Claude Desktop, Cursor, Codex, OpenCode, Gemini CLI, Windsurf/Devin Desktop, Zed, goose, VS Code Copilot, Cline, Roo Code, JetBrains AI) avec leurs configurations globales et par projet ; configuration copiable pour les autres. Aucun modèle ne fouille la machine ni ne décide de ce qui est branché.
- **D56 : simulation (2026-10-10, choix de Guillaume).** Deux simulations sur le Mac, avec un relais dédié, jamais sur le VPS ni sur le relais de production : technique (50 nœuds en processus séparés, puis 500 nœuds virtuels regroupés) et d'usage (10 à 20 personnages dans une entreprise fictive). Modèles gratuits uniquement, via la passerelle LiteLLM du lab (`lab-fast`, `lab-agent`) et une clé virtuelle dédiée, appels espacés. Suivi : carte interactive locale (vue équipe regroupable, vue parcours par demande, lecture et pas à pas, injection de pannes et de sorties piégées), traces Langfuse et rapport par campagne. La boucle d'amélioration produit des rapports et ajuste seule, en versionnant, les éléments sans risque (textes, routage, consignes des personnages) ; jamais le code ni la sécurité. React Flow (xyflow, MIT) est candidat pour la carte, limité au paquet de simulation.
- **D57 : argent et nom (2026-10-10, choix de Guillaume).** Rien de payant avant d'avoir des utilisateurs. Contrats de support et pack entreprise restent des hypothèses sans tarif. Le nom se décide dans une session dédiée ; « drop » reste le nom de code.
- **D58 : documents produit et phases (2026-10-10, choix de Guillaume).** `docs/product/` porte PRD, TRD, APP_FLOW, UX_UI, BACKEND_SCHEMA et IMPLEMENTATION_PLAN. Ils décrivent et renvoient aux specs OpenSpec (seule source normative) et à `docs/TASKS.md` (seule source de l'ordre), sans les dupliquer. Phases : P0 documents puis mise en vérité de tout le reste ; simulation technique minimale avant l'essai ; P1 essai avec deux amis et mesure D24 ; P2 simulation complète ; P3 agent inclus, petite question, pack entreprise ; P4 tâches déléguées et contexte décentralisé ; P5 nom, offre, lancement. Aucune information fausse ne reste dans le dépôt ni sur le site.

## Connexion directe (10 octobre 2026, T4.2, choix de Guillaume)

- **D59 : T4.2 découpée et D53 corrigée pour Internet.** T4.2 livre le réseau local : découverte, connexion directe entre pairs, sans aucun serveur et hors ligne. T4.2b livre Internet par iroh. Correction de D53 : la doc d'iroh établit que la traversée de NAT passe d'abord par un relais commun de rendez-vous (https://docs.iroh.computer/concepts/nat-traversal) ; sans relais, une connexion sur Internet n'aboutit que si un pair est directement joignable. Par défaut aucun relais n'est configuré : l'app explique qu'il en faut un pour joindre quelqu'un hors du réseau local et propose un relais iroh auto-hébergé, celui d'une équipe ou d'une entreprise, ou les relais de test de n0 signalés comme tiers. Le relais ne voit que du chiffré. Sources : `docs/research/2026-10-10-repositionnement.md` et la recherche T4.2 citée dans la change.
- **D60 : règle du réseau local.** Une connexion directe sortante n'est permise que vers un pair déjà appairé, ou vers l'inviteur d'un code en cours d'utilisation, sur une adresse privée trouvée par la découverte locale. Chaque session commence par un défi signé dans les deux sens avec la clé Ed25519 attendue ; sans preuve, rien ne passe. Une session entrante d'une clé inconnue ne peut transmettre qu'une demande d'appairage, que le moteur rejette déjà sans jeton d'invitation valide. Les enveloppes restent chiffrées de bout en bout et signées. Le Node écoute alors sur le réseau local, ce qu'il ne faisait pas : seulement quand ce mode est actif, et seulement pour des sessions authentifiées.
- **D61** : `bonjour-service` pour la découverte locale. Dépendance nouvelle, JavaScript pur, licence MIT, maintenue (1.4.4, juillet 2026), construite sur `multicast-dns` ; elle annonce et découvre. Service `_drop._tcp`, enregistrement TXT portant l’identifiant du nœud. `@homebridge/ciao`, d’abord retenue sur la foi de la recherche, ne fait qu’annoncer (« discover functionality » sans date, README 1.3.12) : écartée à l’implémentation. Écartée aussi : la liaison Node d’iroh (pas de découverte locale, en retard sur iroh, Apple Silicon seulement).
- **D62 : autorisation réseau local de macOS.** L'app déclare `NSLocalNetworkUsageDescription` et `NSBonjourServices` (`_drop._tcp`) dans `src-tauri/Info.plist`, que Tauri fusionne. Si la personne refuse, le mode local échoue avec `E_LAN_DENIED` et le relais configuré reste utilisable. Le mode local peut être désactivé par la configuration ; le banc de simulation le désactive.
- **D63 : accusé signé plutôt que canal chiffré, après revue (T4.2).** La revue a montré que la poignée de main peut être relayée par quelqu'un sur le réseau local, qui pouvait alors faire passer pour remises des enveloppes perdues. Une enveloppe ne compte comme remise localement qu'après un accusé signé par la clé du destinataire ; sinon, relais. Corrige D60 : une clé inconnue n'ouvre une session entrante que tant qu'une invitation est en cours. Le bouclage n'est plus accepté depuis le réseau. Le client du relais ne signe plus qu'un défi de 32 octets, pour qu'aucun relais ne lui fasse signer une preuve locale. Limites acceptées : un intermédiaire voit qui parle à qui et peut forcer le relais ; l'annonce mDNS porte un identifiant fixe (T4.2c).

## Réponse humaine (10 octobre 2026, T4.3, choix de Guillaume)

- **D64 : réponse à la main du propriétaire.** Texte de 8 000 caractères au plus et fichier texte facultatif (texte brut, Markdown, CSV, JSON) de 128 Kio au plus, sans découpage ; les binaires viendront plus tard, avec un contrôle propre, car le scanner de secrets ne lit pas un PDF ni une image. Message `human_answer` de l'approbateur vers l'exécuteur, à la place de la décision : répondre vaut consentement pour cette seule demande. Le demandeur reçoit `{ kind: 'human', text, file? }` sous l'empreinte d'un schéma fixe, pas celui de la capacité. Le reçu signé porte `answeredBy: 'human'` ; un Node antérieur ne sait pas le vérifier (accepté, seul le prototype tourne). Un secret reconnu bloque l'envoi avec `E_SECRET_DETECTED` ; la réponse n'est jamais modifiée à la place du propriétaire. Après revue : la relecture montre le contenu du fichier et nomme l'exécuteur qui reçoit la réponse d'abord, d'après les pairs locaux ; l'exécuteur refait les contrôles et ne dit au demandeur que le refus ; l'agent demandeur présente la réponse comme écrite à la main d'après l'empreinte du schéma fixe. Limites acceptées : un pair appairé peut toujours présenter une carte d'approbation mensongère (demandeur, motif), seul le destinataire réel est garanti ; si deux approbateurs agissent en même temps, la réponse arrivée en second est déjà connue de l'exécuteur, qui l'ignore ; le scanner ne voit que les secrets aux motifs connus.

## Faits publiés (10 octobre 2026, T4.4, choix de Guillaume)

- **D65 : niveau 1, le fait publié.** Un fait est une entrée de catalogue à part (`fact.f<id>`) : son sujet et ses mots-clés sont visibles par son public, son énoncé ne part qu'à la demande. La publication vaut accord : il est servi sans décision, avec un reçu signé `answeredBy: 'fact'` à chaque envoi et un compteur, sans notification. Public : toute l'équipe (tous les pairs appairés) ou des pairs choisis, revérifié à chaque demande. Énoncé de 1 000 caractères, source en libellé avec lien https facultatif (jamais son contenu), fin obligatoire de 30 jours par défaut et d'un an au plus, signature du propriétaire, secrets refusés à la publication, sensibilité basse seulement. `ask_team` sert d'abord un fait dont un mot-clé ou le sujet figure dans la question. Modifier signe une nouvelle révision ; retirer arrête le service et garde la trace. Le demandeur vérifie la signature et la validité ; le MCP l'annonce « Fait publié par … ». Après revue : retrait, révision et compteur s'écrivent sans attente entre lecture et écriture, et un fait servi est revérifié après chaque attente ; 10 faits par pair et par minute ; seule la carte d'un fait peut porter l'empreinte d'un fait ; routage seulement sur des termes d'au moins trois lettres et des faits en ligne ; liens sans identifiants, mots-clés distincts sans virgule, aucun caractère invisible ; un stockage illisible ne retire que les faits ; aucune clé plafonnée pour un fait. « Toute l'équipe » s'affiche « Tous mes pairs appairés ». Limites acceptées : un pair du public peut réutiliser l'identifiant d'un fait d'autrui sur sa propre carte (attribuée à lui) ; un fait servi ne se rappelle pas.

## Clients MCP (10 octobre 2026, T4.5, choix de Guillaume)

- **D66 : treize clients, raccordement prudent.** Détection en lecture seule des treize clients de D55 à leurs emplacements documentés (revérifiés le 10 octobre, note de recherche §4) ; installation prouvée par l'application, le binaire ou l'extension, jamais par un dossier seul. Raccordement automatique seulement par commande officielle (Claude Code, Codex, Gemini CLI, VS Code) ou fichier JSON strict (Claude Desktop, Cursor, Cline), avec les règles de T3.3 ; configuration à copier pour OpenCode (JSONC commenté), Devin Desktop (emplacements contradictoires), Zed (JSONC), goose (YAML interactif), Roo Code (archivé le 15 mai 2026) et JetBrains AI (interface seulement). Projets : ceux que Claude Code et Codex connaissent, plus les dossiers ajoutés dans le panneau ; jamais de parcours du disque. `requestedBy.agent` passe à treize valeurs plus `other`, et toute autre valeur se lit `other` pour qu'un pair plus récent ne voie pas ses demandes refusées. Après revue : seuls des fichiers réguliers de taille bornée sont lus (un dépôt cloné peut porter un lien vers `/dev/zero`) ; le lecteur YAML de goose écarte toute extension qu'il ne lit pas exactement ; un serveur qui garde la syntaxe propre à son client (`${input:…}`, `{env:…}`) est montré mais pas partageable ; JSONC avec commentaire avant la virgule finale et BOM lus ; commandes officielles exécutables seulement et limitées à 60 s ; ni la racine ni le dossier personnel comme projet. Restent : Cline raccordé par son fichier partagé même pour l'extension seule (le code source de Cline l'utilise, sa doc ne le dit que pour la CLI) ; une URL Gemini `url` (SSE) partagée serait jointe en HTTP diffusable.

## Réseau local, suites (10 octobre 2026, T4.2c, choix de Guillaume)

- **D67 : annonce tournante, reprise, pas encore de canal chiffré.** L'annonce mDNS ne porte plus l'identifiant du nœud : un nom aléatoire et un jeton HMAC de sa clé de découverte, renouvelés toutes les 15 minutes, que seuls ses pairs reconnaissent ; tant qu'une invitation court, un jeton tiré de son code permet à l'invité de trouver l'inviteur. La clé (32 octets, `DROP_HOME/lan-key`, `0600`) part chiffrée à chaque pair par `lan_key`, à l'appairage, aux pairs présentés par l'équipe et à chaque démarrage ; les clés reçues restent dans `lan-keys.json` (`0600`). Après un refus de la découverte ou de l'écoute, nouvel essai à 30 s, 1, 2 puis 5 min. Pas de canal chiffré propre à la session : les enveloppes sont chiffrées de bout en bout et les accusés signés ; à rouvrir si l'essai T4.6 en montre le besoin. L'ancien format à identifiant fixe est abandonné. Limite : un ancien pair garde la clé tant qu'aucun retrait de pair n'existe. Après revue : celui qui se connecte frappe d'abord avec la clé du nœud visé ou le jeton d'invitation (HMAC), et le nœud joint ne dit rien, pas même son identifiant, tant que la frappe est fausse ; l'appelant ne se nomme qu'après une réponse qui prouve le même secret. L'annonce ne porte plus le nom de la machine (hôte aléatoire), ni d'adresse IPv6 globale ; elle est revue toutes les 5 s pour qu'une invitation soit trouvable aussitôt. Les annonces vues sont bornées, purgées après deux périodes, et toutes les correspondances sont essayées, les plus récentes d'abord. Les délais de reprise ne repartent de zéro qu'après dix minutes sans refus. Fenêtre de jetons : période précédente, courante et suivante. Limites assumées : sur un même réseau, le port d'écoute et les adresses restent ceux du processus et relient les périodes entre elles ; la clé part aussi aux pairs présentés par l'équipe.

## Internet par iroh (10 octobre 2026, T4.2b, choix de Guillaume)

- **D68 : iroh dans un programme séparé, sans infrastructure imposée.** Programme Rust `drop-iroh` (iroh 1.3.0, MIT ou Apache-2.0, avec du code BSD-3 repris de Tailscale dont la notice suit le binaire), préréglage `Minimal` : aucun annuaire, aucun relais sauf choix explicite. Il reçoit la graine de la clé drop par son entrée standard : l'identifiant iroh est l'identifiant drop (vérifié en exécutant les deux bibliothèques). Réutiliser la même clé Ed25519 pour les signatures drop et la poignée de main TLS d'iroh est accepté : les contextes signés sont distincts. Les pairs échangent leurs adresses par `iroh_addr`, chiffré, sans annuaire. Ordre des voies : réseau local, iroh, relais drop, file. Mode Internet désactivé par défaut ; relais au choix : le sien, celui de l'équipe, ou les relais de test de n0 (« development and hobby use only », voient les adresses IP), signalés comme tiers. Sans relais, deux pairs derrière un routeur ne se joignent pas : l'échec est expliqué. Choix écarté : la liaison Node officielle (iroh 1.0.2, préréglage n0 par défaut). Sources : https://docs.iroh.computer/concepts/nat-traversal.md, https://docs.iroh.computer/iroh-services/relays/public.md, https://docs.iroh.computer/configuring-networks.md, https://www.iroh.computer/blog/v1 et le code publié de la caisse 1.3.0.
- **D68, précisions de la réalisation (recette et revue adverse du 10 octobre 2026).** Une connexion iroh sert dans les deux sens : l'hôte d'une invitation répond à l'invité sur la connexion que celui-ci a ouverte, sans connaître son adresse (seul chemin derrière un NAT). L'invitation porte les adresses iroh de l'hôte, sinon deux nœuds sans relais drop ne peuvent pas s'appairer. Comme pour le réseau local (D60), un nœud inconnu peut se connecter pendant une invitation vivante, au plus 4 à la fois et 10 enveloppes par minute à eux tous ; il est coupé dès la fin de l'invitation ou au retrait d'un pair. Le programme n'utilise que les résolveurs DNS du système (jamais les résolveurs publics de secours d'iroh) et désactive le mappage de ports (UPnP, PCP, NAT-PMP). Dans le profil privé : pas de relais n0, relais parmi les origines autorisées, et seules les adresses privées sont annoncées ou appelées. `DROP_IROH_BIN` n'est lu qu'hors de l'app. Suites hors périmètre : T4.2d (cache anti-rejeu saturable par un inconnu, antérieur à T4.2b) et T4.2e (messages d'adresse mis en file).

- **D76 : réunion de la branche principale et du profil privé (2026-10-10, demande de Guillaume).** Les deux histoires partaient du 8 octobre ; la branche principale portait l'étape 2 (T2.1, T2.4, T2.6, T2.7, T2.13, T2.16 à T2.19), la branche Codex le profil privé (T3.x). Elles sont réunies par une fusion, sans réécrire l'historique. Règles suivies : le cap privé (D34 à D38) l'emporte quand les deux se contredisent ; une fonction de l'étape 2 est gardée si elle ne s'impose pas au profil privé. Ainsi la mise à jour signée dans l'app (D70) reste, mais seulement dans un build fait avec la clé de mise à jour (`--updates`) : le build par défaut n'en contient aucune et D46 vaut toujours pour lui. Les numéros en double sont renumérotés (D69 à D75).

- **D77 : T2.6b, publication de la vitrine (2026-10-08, numérotée D31 sur sa branche, renumérotée à la fusion).** Guillaume autorise la continuation après la proposition de publier sur `drop.memolabs.dev`, en demandant de travailler à côté de l'agent en cours. Deux worktrees isolés sont utilisés. Le site est livré par la stack Ansible `drop-site` de lab-infra, distincte de `drop` ; les routes `/v1*` et `/health` sont explicitement exclues. Les dix fichiers publics de T2.6a sont exportés avec manifeste SHA-256. nginx, déjà utilisé pour les sites statiques du lab, est fixé au digest existant ; aucune dépendance npm ni modification du code produit. Les sources éditoriales restent dans drop, la configuration d'hébergement et l'export versionné dans lab-infra. Le chantier voisin d'admission reste intact.

- **D78 : un inconnu n'occupe pas le cache anti-rejeu (2026-10-10, T4.2d, choix de Guillaume).** Pour un expéditeur inconnu, l'étape `E_REPLAY` ne fait que lire ; l'identifiant n'est retenu qu'après l'acceptation de sa demande d'appairage ou de liaison. L'ordre des vérifications ne change pas. Une liaison à la passerelle ne se revendique qu'une fois par session et n'occupe donc pas le cache. La purge s'arrête à la première entrée encore valide, avec un balayage complet avant de refuser un cache plein. Choix écarté : un cache séparé avec quota pour les inconnus, qui bornait le problème sans le supprimer. La borne mémoire du cache reste à T3.1c ; le budget des inconnus sur iroh (T4.2b) reste en défense supplémentaire.

- **D79 : messages d'état fusionnés dans la file d'envoi (2026-10-10, T4.2e, choix de Guillaume).** Pour un même pair, la file ne garde que le dernier `lan_key`, `iroh_addr`, `team_roster` et `catalog` ; le numéro d'ordre, pris avant tout délai, décide, et le dernier envoyé à chaque pair est retenu : un ancien message, remis en file ou en attente, ne part jamais après un plus récent, même déjà livré. Une annonce d'adresse s'arrête dès qu'une plus récente commence, et clé et adresse sont réannoncées au retour du relais. Choix écarté : ne plus mettre ces messages en file, ce qui privait un pair absent de la clé ou de l'adresse jusqu'au prochain redémarrage.

- **D80 : propriétaire désigné d'une capacité (2026-10-11, T4.17, choix de Guillaume).** Le catalogue donne l'identifiant vérifié du propriétaire de chaque entrée ; une demande peut le nommer (`ownerNodeId`, `owner_node_id` côté MCP). Sans lui, un identifiant publié par plusieurs pairs est refusé (409 `E_AMBIGUOUS_CAPABILITY`, avec les propriétaires) plutôt qu'envoyé au premier trouvé ; `ask_team` et l'A2A entrant visent le propriétaire de chaque route. Choix écarté : prendre le propriétaire en ligne, qui pouvait encore viser la mauvaise personne. Aucun changement de protocole.

- **D81 : politique d'entreprise et relais hébergé (2026-10-11, T4.10, choix de Guillaume).** Politique `{ policy, sig }` signée en Ed25519 par l'organisation (domaine `drop-policy-v1|`), déposée par MDM avec la clé de l'émetteur dans un dossier système (`/Library/Application Support/drop`, `/etc/drop`, `C:\ProgramData\drop`, chemins fixes) ; une variable d'environnement ne la remplace ni ne la déplace jamais. Invalide ou expirée : le daemon ne démarre pas (`E_POLICY`). Le poste borne relais, réseau local, iroh, passerelles, clients et fournisseurs de modèles ; le relais revérifie l'empreinte à chaque authentification et refuse un nœud non géré. L'empreinte n'est pas signée (D63) : le relais détecte un poste non géré ou en retard, pas un poste modifié. Relais livré en image Docker (non root, lecture seule) et chart Helm à un réplica, TLS natif facultatif. Le binaire autonome passe en T4.10b : Node 24 n'en fait qu'en CommonJS, expérimental, avec `postject` (doc Node v24). Après revue adverse : le chemin Windows ne lit plus `ProgramData` ; un dossier avec `issuer.pub` sans politique échoue ; `drop install` applique la liste des clients, le retrait d'un client reste possible et la configuration manuelle n'est pas proposée si la liste ne permet pas `other` ; une passerelle hors politique n'est plus un pair connu, même liée avant ; le financement par le demandeur suit `allowedProviders` ; sans `requireInternalRelay`, iroh n'utilise ou n'accepte d'un pair qu'un relais sur l'hôte d'un relais listé ; un appel de modèle ne suit jamais de redirection (tous profils) ; une politique qui expire coupe le relais côté poste et les connexions côté relais ; le relais refuse une config à moitié et une politique déjà expirée ; le chart redémarre le relais à chaque nouvelle politique, exige l'émetteur et fait parler l'ingress en HTTPS à un relais TLS (ingress-nginx). Limites acceptées, suivies en T4.10c : certificat et politique lus au démarrage seulement, garde du modèle prouvée sur la capacité et non à travers le daemon. Correction du 11 octobre : le runner `ubuntu-latest` de GitHub fournit Helm et la CI de la PR #24 a bien rendu le chart (journal du run 38095381461) ; le test échoue désormais en CI si Helm manque, au lieu de s'ignorer.

- **D82 : l'index suit le cap de l'essai (2026-10-11, T4.19, demande de Guillaume).** L'audit du 11 octobre réordonne `docs/TASKS.md` en trois tableaux ouverts : avant l'essai avec deux amis (T4.6), avant le lancement public, après l'essai. Toute ligne qui ne sert pas la mesure du besoin (simulation à 500 nœuds, binaire et exploitation du pack entreprise, petite question, tâches déléguées, contexte partagé, Windows, Linux, évaluations Hermes et adaptateurs) dépend désormais de T4.6 ; la règle « première `todo` éligible » ne peut plus les choisir avant l'essai. Deux statuts s'ajoutent : `superseded` (ligne reprise ailleurs : T1.14 par T3.5, T2.4 par T3.4, T2.6 et T2.11 par T3.6, T2.7 par T4.6) et `deferred` (option mise de côté : la passerelle grand public T2.13 et T2.20, refusée par le profil privé, D34). Deux lignes manquaient pour l'essai : le chemin de connexion entre deux réseaux (T4.6a) et le protocole en profil privé (T4.6b). Raison : D57 et D58 placent l'essai et la mesure D24 avant tout le reste, et le PRD ne prévoit le pack entreprise que sur demande écrite (H6). Choix écarté : garder l'ordre par série (T3, T4), qui laissait éligibles avant l'essai des chantiers sans lien avec la mesure.

- **D83 : mesurer le besoin d'abord, essayer en binômes de collègues (2026-10-11, choix de Guillaume).** La mesure D24 se détache de l'essai T4.6 et commence tout de suite (T0.7) : 3 à 5 développeurs n'installent que blocked-observer, sans app, sans relais ni revue de sécurité préalable. Au 11 octobre, Guillaume a 111 événements sur 26 jours actifs, 107 non classés et aucun blocage YES ; le seuil demande 3 développeurs au minimum, donc recruter jusqu'à 5 garde une marge si l'un décroche. L'essai T4.6 se fait en binômes de collègues, chaque testeur venant avec une personne avec qui il travaille : la valeur de drop est d'obtenir une réponse qui vit dans les outils d'un collègue, et deux amis qui ne travaillent pas ensemble n'auraient rien de réel à se demander. T4.6 attend un verdict D24 GO ou « à prolonger » (D24 reste requis avant le pilote). H3 demande cinq personnes non techniques et n'est pas mesurable dans cet essai : il lui faut un test séparé. Amende D48 (« deux amis ») et D58 (P1 : essai et mesure D24 ensemble). Choix écarté : garder la mesure dans T4.6, qui la retardait derrière les revues de sécurité, l'app Mac et le relais.
