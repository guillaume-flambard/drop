# Audit du 11 octobre 2026 : preuves et bilan

## Note d'avancement : 58 sur 100

La note pèse trois choses, parce que le but n'est pas d'avoir du code mais des utilisateurs.

| Partie | Poids | Avancement | Points |
| ------ | ----- | ---------- | ------ |
| Le produit est construit et tient (code, sécurité, tests) | 50 | 80 % | 40 |
| Il est prêt pour l'essai avec deux amis (T4.6) | 30 | 55 % | 16,5 |
| Il est prêt pour le lancement et le besoin est prouvé (D24) | 20 | 10 % | 2 |
| **Total** | 100 | | **58** |

### Avancement par domaine

| Domaine | % | Pourquoi |
| ------- | - | -------- |
| Protocole et sécurité du cœur | 85 | Signature, chiffrement, anti-rejeu, relais, consentement : construits et testés. Restent les revues formelles de T3.1b et T3.1c, et la robustesse sous charge (T3.1d) et après crash (T3.1e). |
| Profil privé | 75 | Prouvé avec des modèles factices. Aucun vrai modèle local qualifié (T3.2), pas de preuve d'ensemble sans Internet (T3.5). |
| Raccordement des agents | 85 | Treize clients détectés, sept raccordés tout seuls. Le partage depuis le panneau ne laisse pas encore choisir outils, modèle et approbateur (T4.16). |
| Connectivité | 80 | Réseau local, Internet par iroh, relais d'entreprise. Deux amis sur deux réseaux ont besoin d'un relais choisi, pas encore installé (T4.6a). |
| App Mac | 75 | Signée et notarisée, panneau refait. Restent la recette sur un Mac neuf, VoiceOver, et une build Intel notarisée. |
| Qualité du code et tests | 80 | Lint, types et 556 tests verts. Deux fichiers restent durs à lire (`engine.ts`, 1 800 lignes ; le script du panneau, 900 lignes hors typecheck), voir T4.21. 73 % des scénarios de spec sont reliés à un test, voir T4.20. |
| Docs et site | 80 | Remis en vérité dans le dépôt. Le site en ligne sert encore l'export du 8 octobre. |
| Prêt pour l'essai | 55 | Manquent : revues T3.1b et T3.1c, recette Mac, hygiène T4.15, relais de l'essai, protocole d'essai. |
| Prêt pour le lancement | 15 | Aucun utilisateur, D24 non mesuré, pas de nom, dépôt privé, T3.5 et T3.6 non commencées. |

### Où ça coince, et pourquoi

1. **Personne ne l'a encore utilisé.** Tout ce qui a été construit repose sur des hypothèses. Tant que deux amis ne
   s'en sont pas servis dix jours, on ne sait pas si le besoin existe (D24). C'est le seul vrai risque du projet.
2. **Le travail est parti vers l'entreprise avant le premier utilisateur.** Le pack entreprise (politique signée,
   Docker, Helm) et quatre durcissements réseau ont été livrés avant l'essai, alors que le PRD ne prévoit le pack que
   sur demande écrite. D82 remet l'essai en tête de l'index pour que cela ne se reproduise pas.
3. **Des revues de sécurité attendent depuis le 9 octobre** (T3.1b, T3.1c). Elles bloquent l'essai. La cause était
   un quota d'outil de revue, échu depuis.
4. **Deux amis ne peuvent pas encore se joindre.** Derrière deux routeurs, il faut un relais. Aucune ligne de l'index
   ne le prévoyait (ajoutée : T4.6a). Le choix revient à Guillaume.
5. **Sans modèle local qualifié, le partage par modèle échoue.** L'essai peut commencer avec la réponse à la main et
   les faits publiés, ou attendre T3.2 et T4.16. Décision de Guillaume.
6. **Ce qui ne peut être fait que par Guillaume s'accumule** : 22 changes archivées attendent son acceptation, une
   recette Mac, deux PR à fusionner, des branches à supprimer.

## Ce qui a été fait

### Branches

| Branche | État | Action |
| ------- | ---- | ------ |
| `codex/t3-1b-replay-storage-bounds` | entièrement sur `main` | à supprimer (local et distant) |
| `codex/t3-1a-hermes-evaluation` | entièrement sur `main` | à supprimer (local) |
| `codex/drop-site-deploy` | entièrement sur `main`, worktree Codex propre | à supprimer avec son worktree |
| `codex/t3-1b-final-review` | 9 commits, tous déjà sur `main` sous d'autres hashes ; la fusion produit des conflits et du code en double | obsolète, à supprimer (worktree `/private/tmp/drop-t31b-final-review` propre) |
| `t4-10c-chart-ci` (PR #25) | 1 commit, CI verte | à fusionner |

La fusion de la PR #25 et la suppression des branches ont été refusées par le garde-fou de l'agent (fusion sans
revue humaine). Elles attendent Guillaume.

### Revue du code (open-code-review)

Outil : `@alibaba-group/open-code-review` 1.12.13, mode délégation (`ocr delegate rule` sur les 114 fichiers source),
règles : coquilles, code mort, doublons, nombres magiques, `any`, ternaires imbriqués, erreurs asynchrones, XSS,
`eval`, secrets. Six relectures parallèles (tâches, docs et site, specs contre tests, `node`, paquets du cœur,
outils et app Mac), puis cinq agents de correction, chacun sur des fichiers distincts.

Constat d'ensemble : les règles de sécurité d'AGENTS.md tiennent. La question d'un pair n'est jamais une instruction,
les outils sont fixés avant le modèle, la lecture de fichiers passe par une liste blanche, les sorties sont validées
puis passées au scanner et rejetées, jamais réparées. Aucun `eval`, aucun `any`.

### Défauts corrigés (chacun avec un test écrit d'abord et vu rouge)

| Gravité | Où | Défaut | Correction |
| ------- | -- | ------ | ---------- |
| Moyenne | `node` engine | Un pair pouvait afficher n'importe quel nom sur la carte de consentement (« Alice (CTO) ») | Le nom vient du carnet de pairs local |
| Moyenne | `node` cli | Des caractères de contrôle d'un pair pouvaient réécrire l'écran de `drop pending` | Contrôles et inversions bidi retirés |
| Moyenne | `node` onboarding | Le raccordement d'un agent bloquait tout le daemon jusqu'à 60 s par agent | Appel asynchrone |
| Moyenne | `node` api | Erreurs avalées sans journal, JSON invalide en 500, tout échec en 404 | 400, 413, 404 seulement si capacité inconnue, 500 journalisé avec un code stable |
| Moyenne | `relay` | Une révocation lancée d'un autre dossier écrivait dans le mauvais fichier | Chemins résolus près du fichier de configuration |
| Moyenne | `relay` | Un nœud admis pouvait faire grossir la mémoire du relais sans limite | Destination non admise et durée trop longue refusées, file totale bornée, balayage |
| Moyenne | `a2a` | Le jeton du propriétaire pouvait partir vers un autre hôte choisi par la carte distante | En-têtes envoyés au seul hôte configuré |
| Moyenne | `requester-mcp` | Un titre ou un message d'erreur d'un pair pouvait fermer le cadre de données (`</DROP_RESULT>`) | Tout `<` et tout contrôle neutralisés |
| Moyenne | `scripts/bundle.ts` | `--out` sans valeur effaçait le dossier courant, donc le dépôt | Valeur vide, dépôt, parents et dossier personnel refusés |
| Moyenne | app Mac | « Réessayer » consommait le budget de redémarrages, qui ne se rechargeait jamais | Budget rechargé après 5 minutes saines |
| Moyenne | blocked-observer | Une ligne tronquée cassait la CLI ; écritures concurrentes perdues ; réponse vide comptée 0 minute (fausse D24) | Lignes invalides ignorées et comptées, écriture atomique, réponse vide = inconnue |
| Moyenne | `scripts/mac-updates.ts` | Une build Intel aurait été publiée comme Apple silicon | Plateforme tirée de la machine de build |
| Faible | divers | DMG périmé choisi, site qui plante sur une erreur de lecture, auth du relais en double, fichiers 0600 non forcés, invitations expirées jamais oubliées, refus A2A sans demande, messages d'erreur périmés ou trompeurs, simulation qui accepte `NaN` | Corrigés et testés |

### Simplifications

Boucle d'outils commune à `repo.answer` et `mcp.answer` (`capabilities/src/tool-loop.ts`), un seul schéma de nom de
variable d'environnement, liste des clients dérivée du protocole, aides `refuse`, `isPeer`, `onLanKey`,
`onIrohAddr` dans le moteur, `logEntry` et `receive` dans le daemon, `sendHtml` et `dropErrorStatus` dans l'API,
`authenticate` dans le relais, options esbuild partagées, nombres magiques nommés, code mort retiré (`isTerminal`,
`isClientId`, `library.ts` de la simulation, exports internes, branche inatteignable). Bilan : 101 fichiers, plus
de tests (869 lignes) que de code net ajouté.

### Docs, site et index

README raccourci (promesse, ce qui existe, ce qui reste), AVANCEMENT réécrit au 11 octobre, statuts « visé »
corrigés pour T4.1 à T4.18, profil payeur, passerelle grand public marquée différée, app notarisée, treize clients,
`SITE-DEPLOYMENT.md` fusionné dans `deploiement-lab.md`, `apps/mac/README.md` renvoie à `MAC_RELEASE.md`, protocole
d'essai historique marqué comme tel. `docs/TASKS.md` réordonné (D82).

## Vérification

Sur la branche `chore/audit-2026-10-11`, le 11 octobre 2026 :

- `pnpm -r lint` : vert (eslint et prettier).
- `pnpm -r typecheck` : vert.
- `pnpm -r test` : 70 fichiers, 556 tests verts, 1 ignoré (chart Helm sans Helm v3/v4 local ; rendu obligatoire en
  CI par la PR #25). Avant l'audit : 512.
- `cargo test` et `cargo clippy --all-targets` dans `apps/mac/src-tauri` : 5 tests verts, aucun avertissement.
- `openspec validate --all --strict` : 22 éléments valides.
- `openspec-guard@0.3.0 check --require-selector --fail-on fail` : 0 échec nouveau ; la baseline perd une entrée
  (« Description exposée », désormais couverte), aucune ajoutée.

## Non fait, et pourquoi

- Fusion de la PR #25, suppression des branches et worktrees : refusées par le garde-fou, attendent Guillaume.
- Republication du site : passe par `lab-infra`, hors de ce dépôt.
- Découpage de `NodeEngine` et du script du panneau : trop gros pour une passe de correction sûre, inscrit en T4.21.
- 143 scénarios déjà testés mais sans marqueur : inscrit en T4.20.
- Passerelle `packages/gateway` : 784 lignes que rien n'importe, refusées par le profil privé. Garder ou sortir du
  dépôt est un choix de Guillaume.
- `build.yml` est généré depuis `lab-infra/ci/build-selfhosted.yml` : le bloc `permissions` ajouté ici doit aussi
  l'être dans ce modèle.
