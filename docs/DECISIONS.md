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
  4 erreurs `NOT_IMPLEMENTED` (501), statut `ok`, aucune ligne de log transmise, reçus signés des deux côtés. Restent hors code : le moniteur
  Uptime Kuma (commande de `lab-infra/README.md`, bloquée par le hook tirith dans cette session) et `make map`.

## À décider par l'humain

- **Seuil go/no-go de l'étape 0** : à écrire ici avant de lancer la mesure (blocages « YES » par dev-jour actif,
  minutes perdues par blocage).
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
  Détail : `coverage.md` de la change `migrate-spec-kit` (archivée sous `openspec/changes/archive/`).
- **Financement des demandes, options gardées pour plus tard** (D21 a retenu A). B : une clé d'équipe ou
  d'organisation sur chaque Node ; aucun code, c'est la variable d'environnement. C : le demandeur finance, en joignant
  à sa demande une clé jetable à plafond dur (OpenRouter sait en créer), chiffrée pour l'exécuteur ; il faut l'ajouter
  au protocole et à la carte. D : refacturation, où le propriétaire paie et les reçus signés (`costUsd`) servent de
  relevé. C ou D ne valent que si drop sert entre entreprises différentes ; à trancher à ce moment-là.
