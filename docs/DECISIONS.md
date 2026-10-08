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

## À décider par l'humain

- **Seuil go/no-go de l'étape 0** : à écrire ici avant de lancer la mesure (blocages « YES » par dev-jour actif,
  minutes perdues par blocage).
- **Nom de produit** : à vérifier (nom + domaine) avant le pilote.
- **Incohérences héritées du kit d'origine**, relevées pendant la migration. À trancher au début de la tâche citée :
  - T1.2 : le message de décision s'appelle `drop_decision` dans la séquence d'architecture et `approval_decision`
    dans la table des messages de `protocol`.
  - T1.2 : un Drop `low` passe-t-il directement de `running` à `delivered` ?
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
