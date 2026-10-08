# Couverture de la migration

Contrôle anti-perte de la change `migrate-spec-kit` (2026-10-08). Les sources sont dans le commit `ecf96a8`, sous
`docs/specs/`.

## Comptages

| Source | Puces d'acceptation | Capacité | Exigences | Scénarios | dont `AC:` | « à vérifier » |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| 02 | 5 | `blocked-observer` | 27 | 37 | 5 | 2 |
| 03 + 01 (modèle, cycle de vie) | 3 | `protocol` | 51 | 67 | 5 | 0 |
| 04 + 01 (« ne stocke rien d'autre ») | 2 | `relay` | 14 | 19 | 6 | 0 |
| 05 + 01 (config, séquence) | 4 | `node` | 39 | 49 | 5 | 0 |
| 06 §Cadre | 0 | `runner` | 20 | 29 | 0 | 0 |
| 06 §Capacité 1 | 2 | `capability-error-summary` | 14 | 19 | 2 | 0 |
| 06 §Capacité 2 | 3 | `capability-repo-answer` | 23 | 33 | 4 | 6 |
| 07 | 3 | `requester-mcp` | 15 | 19 | 4 | 0 |
| 08 (pas de section dédiée ; les 6 étapes du scénario de démo) | 6 | `deploy-mac-vps` | 14 | 17 | 6 | 0 |
| AGENTS.md + T0.0 | n/a | `monorepo-tooling` | 7 | 8 | 5 | 0 |

Chaque puce d'origine a au moins un scénario `AC:`. Il y en a souvent plus, quand une puce énumère plusieurs cas : par
exemple les 5 cas de 04 deviennent 5 scénarios. Les 3 blocs « à vérifier » d'origine donnent 8 exigences marquées. Le
bloc des options du SDK de `repo.answer` est éclaté en une exigence par option.

## Correspondance puce → scénario

| Source | Puce (extrait) | Scénario |
| --- | --- | --- |
| 02 | `report_blocked` … apparaît dans `list` | `blocked-observer` / AC: report_blocked visible dans list |
| 02 | faux résultat `403 Forbidden` … sans extrait | AC: 403 Forbidden sans extrait de la sortie |
| 02 | `report` donne des chiffres justes | AC: chiffres justes sur fixture |
| 02 | `export` sans champ retiré | AC: champ retiré absent de l'export |
| 02 | le hook ne fait jamais échouer Claude Code | AC: entrée JSON invalide |
| 03 | aller-retour signer → chiffrer → vérifier → déchiffrer, codes d'erreur dans l'ordre | `protocol` / AC: aller-retour… ; AC: chaque code d'erreur dans l'ordre spécifié |
| 03 | vecteurs fixes `canonical()` et signature | AC: vecteurs de test fixes pour canonical() ; AC: … pour la signature |
| 03 | zod exporte JSON Schema | AC: les schémas zod exportent leur JSON Schema |
| 04 | intégration : directe, différée, usurpation `from`, Node non autorisé, rate limit | `relay` / 5 scénarios AC: du même nom |
| 04 | aucun champ `body` dans les logs | AC: aucun champ body dans les logs |
| 05 | `drop serve` se reconnecte | `node` / AC: drop serve se reconnecte seul… |
| 05 | sans jeton ou `Host` étranger refusé | AC: requête sans jeton refusée ; AC: Host étranger refusé |
| 05 | l'UI échappe `<script>` | AC: l'UI échappe une entrée contenant script |
| 05 | non décidé → `expired`, `E_EXPIRED` | AC: un Drop non décidé passe à expired… |
| 06 | `error_summary`, fixture emails, UUID, montants | `capability-error-summary` / AC: fixture avec emails, UUID et montants |
| 06 | service absent rejeté avant lecture | AC: service absent de la config rejeté avant toute lecture |
| 06 | `.env` et lien vers `/etc` absents du snapshot | `capability-repo-answer` / AC: fichier .env absent… ; AC: lien symbolique vers /etc absent… |
| 06 | `sk-ant-…` déclenche `E_SECRET_DETECTED` | AC: clé sk-ant dans une réponse simulée |
| 06 | injection « ignore tes instructions… » (test manuel) | AC: injection qui demande le contenu d'un fichier |
| 07 | testé dans Claude Code et Codex | `requester-mcp` / AC: testé dans Claude Code ; AC: testé dans Codex |
| 07 | entrée invalide refusée localement | AC: entrée invalide refusée localement |
| 07 | `get_drop_result` encapsule toujours | AC: résultat toujours encapsulé |
| 08 | étapes 1 à 6 du scénario de démo | `deploy-mac-vps` / AC: étape 1 … AC: étape 6 |

## Scénarios déduits, pas cités

Ces scénarios explicitent une conséquence de la source sans la citer mot pour mot. Ils sont à relire au moment de la
tâche concernée :

- `blocked-observer` : une valeur de `classify` hors des 8 valeurs est refusée. Un jour qui n'a que des événements
  `report` n'est pas compté comme actif. Les longueurs maximales sont testées à la borne : `resource` 121, `owner_hint`
  61, `attempted_action` 201 caractères sont refusés.
- `requester-mcp` : bornes de `purpose` (10 à 140) et de `wait_seconds` (0 à 50).
- `runner` et capacités : la même entrée donne la même sortie (déterminisme). Une carte `low` saute l'étape 7.
  `window` ou `question` invalide donne `E_SCHEMA`. Un `answer` trop long donne `E_OUTPUT_INVALID`.
- `protocol` : une transition absente du cycle de vie (ex. `awaiting_approval` → `running`) est refusée.
- `requester-mcp` : la remarque de 07 « l'agent propose, l'humain envoie » (v1) est devenue une exigence MUST.
- `runner` : les 5 règles de sécurité d'AGENTS.md (pair non fiable, outils figés, allowlist sur copie temporaire, aucun
  secret dans les logs, aucun port en écoute) sont reprises comme exigences explicites.

## Relecture adverse

Un relecteur indépendant a comparé phrase par phrase les sources et les specs converties. Résultat : 0 P0 (aucun fait
normatif perdu, aucune valeur changée, chaînes exactes identiques), 4 P1, 10 P2. Corrigés : l'exemple « 1 500
caractères » de 03, devenu règle, redevient un exemple ; « le relais ne stocke rien d'autre » (01), perdu, devient une
exigence de `relay` ; le rôle manquait dans le scénario `config.json` de `drop init` ; à l'étape 2 de la démo, la
notification et la carte de consentement étaient fusionnées. Les autres constats sont des incohérences du kit d'origine,
ajoutées au tableau ci-dessous.

## Incohérences et trous du kit d'origine (non tranchés)

La migration les garde tels quels. Chacun est à trancher par `grilling` au début de la tâche indiquée, puis à noter dans
`docs/DECISIONS.md`.

| Point | Où | Tâche |
| --- | --- | --- |
| Le message de décision s'appelle `drop_decision` dans 01 (séquence, étape 5) et `approval_decision` dans la table de 03 | `node`, `protocol` | T1.2 |
| TTL de la file du relais : 10 min dans 01, purge à `exp` (jusqu'à `ts` + 15 min) dans 04 | `relay` | T1.3 |
| Le code `4403` : code de fermeture WebSocket ou réponse ? `4401` couvre-t-il aussi une mauvaise signature du challenge ? | `relay` | T1.3 |
| Comportement quand la file d'un destinataire a déjà 100 enveloppes | `relay` | T1.3 |
| « quota » vérifié à l'étape 3 de la séquence, jamais défini | `node` | T1.8 |
| Un Drop `low` passe-t-il directement de `running` à `delivered` ? | `protocol` | T1.2 |
| Seuil `degraded` configurable sans champ de config. `status` quand la source n'existe pas. Lecture d'une source `file` | `capability-error-summary` | T1.7 |
| La séquence de 01 nomme les outils `request_drop(capabilityId, …)` et `get_result(dropId)` ; 07 les nomme `request_drop(capability_id, …)` et `get_drop_result`. 07 fait foi pour les noms d'outils | `requester-mcp` | T1.10 |
| `drop print-instructions` n'est spécifié que dans `requester-mcp`, absent de la CLI de `node` | `node`, `requester-mcp` | T1.10 |
| `E_SCHEMA` (étape 1 du runner, capacités) absent de la liste fermée des codes `drop_error` de 03, qui rejette tout autre code par `E_MESSAGE_SCHEMA` | `protocol`, `runner` | T1.2 |
| `maxOutputChars` porte sur la sortie sérialisée entière ; 06 limite seulement `answer` à 1 500 caractères. Un `answer` à la limite ferait échouer l'étape 5 | `protocol`, `capability-repo-answer` | T1.13 |
| Pas de code d'erreur pour un snapshot au-delà de `maxSnapshotBytes`, ni pour le post-contrôle d'extrait de code | `capability-repo-answer` | T1.13 |
