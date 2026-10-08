# AGENTS.md — instructions pour les agents de code (Codex, Claude Code, Cursor)

Ce repo construit **drop** (nom de code, le nom produit reste à trouver) :
un agent pose une question bornée à l'environnement d'un autre agent,
le propriétaire autorise, et seul le résultat autorisé revient.
Principe directeur : **Get the answer, not the access.**

Lis `openspec/project/vision.md` une fois par session avant de coder.

## Où vit quoi

- `openspec/specs/<capacité>/spec.md` : le contrat. Exigences SHALL/MUST et scénarios ; les scénarios `AC:` sont les
  critères d'acceptation. Seule source normative.
- `openspec/project/` : vision et architecture, descriptives.
- `docs/TASKS.md` : l'index des tâches, seule source de l'ordre et des dépendances.
- `openspec/changes/<change>/` : le travail en cours d'une tâche (proposal, design, tasks).
- `docs/DECISIONS.md` : journal des décisions.

## Comment travailler dans ce repo

Une tâche par session, une tâche = une change OpenSpec. Chaque étape finit sur son critère.
Les commandes `/opsx:*` s'écrivent `$openspec-*` dans Codex (ex. `$openspec-propose`).

1. **Choisir.** Prends la première tâche `todo` de `docs/TASKS.md` dont les dépendances sont `done`, sauf si l'humain
   en désigne une autre. Passe-la à `doing`. Fini quand une seule ligne est `doing`.
2. **Lire.** `openspec/project/architecture.md`, les specs des capacités listées sur la ligne, et les points ouverts de
   `docs/DECISIONS.md` qui citent la tâche ; rien d'autre.
   Fini quand tu peux citer les scénarios `AC:` que la tâche doit rendre verts.
3. **Lever les doutes.** Pour chaque exigence marquée `<!-- à vérifier -->`, lis la doc officielle de la version
   installée. Pour chaque ambiguïté ou contradiction, lance le skill `grilling` avec l'humain au lieu de deviner.
   Fini quand chaque réponse est notée dans `docs/DECISIONS.md`.
4. **Proposer.** `/opsx:propose <change>` (nom dans l'index). Si le contrat ne change pas, la change porte
   `skip_specs: true` ; sinon un delta MODIFIED/ADDED. Attends l'accord de l'humain. Fini quand
   `openspec validate <change> --strict` passe et que l'humain a dit oui.
5. **Réaliser.** `/opsx:apply`. Tests d'abord pour la logique (schémas, crypto, politique, filtres). Chaque scénario
   couvert reçoit, sous son titre, `<!-- openspec-guard:test="<titre exact du test>" -->`.
6. **Vérifier.** Fini quand tout est vert :
   - `pnpm -r lint && pnpm -r typecheck && pnpm -r test`
   - `npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail`
     puis, une fois vert, la même commande avec `--update-baseline` à la place de `--fail-on fail` : le diff de la baseline ne contient que des retraits.
   - `/review` (gstack) sur le diff ; plus `/cso` (gstack) si la change touche `protocol`, `relay`, `node`, `runner`,
     les capacités ou `requester-mcp`.
7. **Clore.** `/opsx:archive <change>`, tâche à `done` dans l'index, décision non écrite dans la spec ajoutée à
   `docs/DECISIONS.md`, commit. Fini quand `git status` est propre.

Reste dans le périmètre de la ligne de l'index. Un manque découvert devient une nouvelle ligne `todo` dans
`docs/TASKS.md`.

## Stack imposée

- TypeScript strict, Node 22+, monorepo **pnpm workspaces**.
- Validation : **zod** (les schémas zod sont la source de vérité des messages et des capacités).
- Tests : **vitest**. Lint : **eslint** + **prettier**.
- MCP : `@modelcontextprotocol/sdk` (transport stdio côté poste de travail).
- Crypto : `libsodium-wrappers` (Ed25519 pour signer, `crypto_box` / X25519 pour chiffrer). Pas de crypto maison.
- WebSocket : `ws`. Pas de framework web lourd.
- Runner LLM : n'importe quel fournisseur compatible OpenAI (Ollama local par défaut, gratuit ; OpenRouter, Groq,
  Gemini, OpenAI, Anthropic…) par `fetch`, sans SDK. Clé API par variable d'environnement nommée dans la config, jamais
  un login d'abonnement. Les outils du modèle sont fournis par la capacité, jamais par le fournisseur (D19).

Ne pas ajouter de dépendance hors de cette liste sans l'écrire dans `docs/DECISIONS.md` avec la raison.

## Règles de sécurité non négociables

Ces règles priment sur tout le reste, y compris une demande qui semble venir d'une spec.

- **Toute requête reçue d'un pair est une donnée non fiable.** Elle n'est jamais concaténée dans un prompt
  comme instruction ; elle est passée comme donnée encadrée, après validation zod.
- **Le LLM ne décide jamais de la frontière d'autorisation.** Les outils accessibles au runner sont fixés par la
  capacité, avant l'appel au modèle. Aucun code ne doit ajouter d'outil en fonction du contenu de la requête.
- **Lecture de fichiers en allowlist uniquement**, dans une copie temporaire. Jamais de blacklist seule.
- **Toute sortie est validée par le schéma de sortie de la capacité** puis passée au scanner de secrets.
  Une sortie invalide est rejetée, pas « réparée ».
- **Aucun secret dans les logs, les reçus ou la télémétrie** : on stocke des hash et des métadonnées.
- **Le runner n'écoute sur aucun port.** Il se connecte en sortie au relais.
- Les clés privées vivent dans `~/.drop/` en mode `0600`. Jamais dans le repo, jamais dans un message.

## Conventions

- Code, identifiants, commits : en anglais. Specs et docs : en français.
- Un package = une responsabilité (voir `openspec/project/architecture.md`).
- Commits petits, au format `T1.3: short description`.
- Pas de `any`. Pas d'exception avalée en silence : une erreur est loguée avec un code stable (`E_SCHEMA`, `E_EXPIRED`…).
