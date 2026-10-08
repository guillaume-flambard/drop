# Démo T1.14 : exécution réelle Mac + VPS, 8 octobre 2026

Scénario de la spec 08, joué en vrai : le relais public `wss://drop.memolabs.dev/v1` sur le VPS lab, le Node « lab »
dans le VPS, le Node « Guillaume » et le Node « Julie » sur le Mac. Le script pour la rejouer est
[`scripts/demo.md`](../../scripts/demo.md).

La démo a été jouée deux fois, avec deux agents différents branchés sur le même serveur MCP `drop` : **Claude Code**
(`claude -p`, section suivante) puis **Codex** (plus bas). Le protocole ne change pas d'un agent à l'autre.

## Avec Claude Code (15:05 UTC)

Appels MCP, identiques aux deux questions : `list_capabilities`, puis `request_drop`, puis `get_drop_result`.

**« La prod de traefik va bien ? »** Carte chez Guillaume, « via Claude Code » :

![Carte de consentement, Claude Code](cc-01-consent-traefik.jpg)

> Oui, la prod de traefik va bien. J'ai utilisé la capacité « Résumer les erreurs de production » de lab, qui a
> accepté la demande. Fenêtre : la dernière heure. État du service : `ok`. Erreurs : 0 ligne d'erreur, donc aucun
> type d'erreur à remonter. Ce résultat ne porte que sur la dernière heure, et il vient de l'outil de lab : je n'ai
> rien vérifié moi-même sur le serveur.

**« Est-ce que l'implémentation de Julie gère déjà le mode sombre ? »** Carte et relecture chez Julie :

![Carte chez Julie, Claude Code](cc-02-consent-julie.jpg)
![Relecture chez Julie, Claude Code](cc-03-review-julie.jpg)

> Oui, d'après Julie, son implémentation gère déjà le mode sombre. Elle a accepté et relu la demande avant de répondre.
> Type `Theme` avec `'dark'` ; détection par `prefers-color-scheme` ; application par l'attribut `data-theme` sur
> l'élément racine ; tout est dans `src/theme.ts`. C'est ce que Julie déclare, je n'ai pas lu son code. Sa réponse ne
> précise pas si on peut forcer le thème à la main, ni si ce choix est sauvegardé.

Claude Code traite le résultat comme une donnée venue de quelqu'un d'autre, ce que demande le cadrage
`<drop_result>` : il cite la source, dit ce qu'il n'a pas vérifié et propose de reposer la question. Coût estimé
de l'agent demandeur, selon Claude Code : 0,49 $ et 0,26 $, pris sur l'abonnement de Guillaume. Les réponses de Julie, elles, coûtent 0 $
(modèle gratuit).

Reçus après ce passage :

```text
== Guillaume
2026-10-08T15:05:06.339Z  production.error_summary  allow_once  01a11c0b-ee15-7106-ba4a-823e48d1b6a3
2026-10-08T15:05:36.097Z  repo.answer  allow_once  01a11c0c-624a-7a20-8aec-b6509742e9c2
== Julie
2026-10-08T15:05:36.097Z  repo.answer  allow_once  01a11c0c-624a-7a20-8aec-b6509742e9c2
== lab (VPS)
2026-10-08T15:05:06.339Z  production.error_summary  allow_once  01a11c0b-ee15-7106-ba4a-823e48d1b6a3
```

## Avec Codex (15:00 UTC)

Premier passage. `claude -p` échouait alors à l'authentification (« OAuth session expired and could not be
refreshed ») ; Guillaume s'est reconnecté avec `claude auth login` avant le passage Claude Code ci-dessus.

### Étapes 1 à 3 : « La prod de traefik va bien ? »

Appels MCP de Codex, dans l'ordre :

```text
drop/list_capabilities (completed)
drop/request_drop (completed)
drop/get_drop_result (completed)
```

La carte de consentement chez Guillaume, dans l'UI locale :

![Carte de consentement, résumé des erreurs de Traefik](01-consent-traefik.jpg)

Après « Autoriser une fois », le VPS lit les logs de Traefik chez lui et ne renvoie que le résumé. Réponse finale de
Codex :

> Oui, d'après le résultat fourni par **lab**, Traefik est **OK** sur la dernière heure : **0 ligne d'erreur
> détectée**, aucun type d'erreur remonté.

### Étape 4 : « Est-ce que l'implémentation de Julie gère déjà le mode sombre ? »

La carte chez Julie. `repo.answer` est à sensibilité haute, et l'appel au modèle se fait avec la clé de Julie (ici
gratuit) :

![Carte de consentement chez Julie](02-consent-julie.jpg)

Julie relit la réponse avant qu'elle parte, champ par champ, avec la possibilité d'en retirer un :

![Écran de relecture chez Julie](03-review-julie.jpg)

Réponse finale de Codex, après « Envoyer » :

> Julie confirme une prise en charge **partielle du mode sombre** : il s'active automatiquement selon la préférence du
> système, via `prefers-color-scheme`. Il n'est pas encore possible de choisir manuellement le thème ni de mémoriser
> ce choix. Les fichiers concernés sont `src/theme.ts` et `docs/theme.md`.

Les noms de fichiers sont là, sans une ligne de code. Le premier `request_drop` de Codex a échoué et il l'a relancé ;
le journal de Codex ne dit pas pourquoi. La cause la plus probable est une entrée refusée localement par
`requester-mcp` (question de plus de 300 caractères ou raison de plus de 140).

### Étape 5 : les reçus, des deux côtés

```text
== Guillaume
2026-10-08T14:59:38.884Z  production.error_summary  allow_once  01a11c06-eef4-7ff4-baca-b8feec85c1e0
2026-10-08T15:00:48.644Z  repo.answer  allow_once  01a11c07-ff67-7e2d-b6ec-1847d408d40d
== Julie
2026-10-08T15:00:48.644Z  repo.answer  allow_once  01a11c07-ff67-7e2d-b6ec-1847d408d40d
== lab (VPS)
2026-10-08T14:59:38.884Z  production.error_summary  allow_once  01a11c06-eef4-7ff4-baca-b8feec85c1e0
```

Chaque reçu est signé par l'exécuteur et ne contient que des empreintes : ni l'entrée, ni la sortie.

## Étape 6 : le test des 30 secondes

Pas faite : il faut montrer les étapes 1 à 3 à une vraie personne sans prononcer « MCP ». Le déroulé est dans
`scripts/demo.md`.

## Observé en passant

- Codex a d'abord tenté `blocked-observer/report_blocked` (la consigne de son `AGENTS.md`), refusé en mode non
  interactif : « MCP tool call requires approval, but approval policy is never ».
- La notification macOS s'affiche à chaque demande, en plus de l'UI.
