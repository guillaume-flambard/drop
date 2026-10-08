# AGENTS.md — instructions pour les agents de code (Codex, Claude Code, Cursor)

Ce repo construit **drop** (nom de code, le nom produit reste à trouver) :
un agent pose une question bornée à l'environnement d'un autre agent,
le propriétaire autorise, et seul le résultat autorisé revient.
Principe directeur : **Get the answer, not the access.**

Lis `docs/specs/00-vision.md` une fois par session avant de coder.

## Comment travailler dans ce repo

1. **Une tâche par session.** Les tâches sont dans `docs/TASKS.md`, avec un identifiant (`T0.1`, `T1.3`…).
   Prends la première tâche `todo` dont toutes les dépendances sont `done`, sauf si l'humain en désigne une autre.
2. **Lis la spec de la tâche** (lien dans `docs/TASKS.md`) et `docs/specs/01-architecture.md`.
   Ne lis pas les autres specs sauf si la tâche y renvoie.
3. **Plan court avant de coder** : fichiers touchés, tests prévus. Si la spec est ambiguë ou contradictoire,
   arrête-toi et pose la question au lieu de deviner. Note la réponse dans `docs/DECISIONS.md`.
4. **Tests d'abord pour la logique** (schémas, crypto, politique, filtres). Les critères d'acceptation de la tâche
   sont la définition de « fini ».
5. **Fin de tâche** : `pnpm -r lint && pnpm -r typecheck && pnpm -r test` passent ; passe la tâche à `done` dans
   `docs/TASKS.md` ; ajoute une ligne dans `docs/DECISIONS.md` si tu as pris une décision non écrite dans la spec.
6. **Ne touche jamais** au périmètre d'une autre tâche. Si tu découvres un manque, ajoute une tâche `todo` dans
   `docs/TASKS.md` au lieu de l'implémenter.

## Stack imposée

- TypeScript strict, Node 22+, monorepo **pnpm workspaces**.
- Validation : **zod** (les schémas zod sont la source de vérité des messages et des capacités).
- Tests : **vitest**. Lint : **eslint** + **prettier**.
- MCP : `@modelcontextprotocol/sdk` (transport stdio côté poste de travail).
- Crypto : `libsodium-wrappers` (Ed25519 pour signer, `crypto_box` / X25519 pour chiffrer). Pas de crypto maison.
- WebSocket : `ws`. Pas de framework web lourd.
- Runner LLM : `@anthropic-ai/claude-agent-sdk` **avec clé API** (`ANTHROPIC_API_KEY`), jamais un login d'abonnement.

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
- Un package = une responsabilité (voir `docs/specs/01-architecture.md`).
- Commits petits, au format `T1.3: short description`.
- Pas de `any`. Pas d'exception avalée en silence : une erreur est loguée avec un code stable (`E_SCHEMA`, `E_EXPIRED`…).
