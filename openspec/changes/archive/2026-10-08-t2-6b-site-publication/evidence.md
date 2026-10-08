# Evidence

Vérification le 8 octobre 2026, vers 19 h 40, heure de Paris. Scope : T2.6b, publication du site déjà livré, sans modification du code produit.

## EV-PUB-1 : export et configuration

**PASS, AC-PUB-1, AC-PUB-2, AC-PUB-4.** `pnpm site:build` produit dix fichiers depuis `drop@54654b1`. La stack lab-infra possède un manifeste SHA-256 et un contrôle HTTP reproductible `stacks/drop-site/check.py`. Les dix fichiers ont été comparés au snapshot par le relecteur indépendant.

nginx 1.31.6, digest `sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2`, réutilise l'image déjà présente dans le lab. `nginx -t` passe dans un conteneur sans privilèges et sans réseau. Un second conteneur isolé, sans route Traefik ni port hôte, a servi l'export pour le contrôle HTTP : dix hashes, racine HTML, MIME, CSP, HEAD, refus POST et huit chemins privés/inconnus, tous PASS.

## EV-PUB-2 : tests, revue et PR

**PASS, AC-PUB-5.**

- `pnpm -r lint` : PASS.
- `pnpm -r typecheck` : PASS.
- `pnpm -r test` : 229 tests, 20 fichiers, PASS.
- `openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail` : PASS, 54 critères explicitement reliés, 259 gelés, 14 exclus.
- Même commande avec `--update-baseline` : zéro ajout et zéro retrait.
- `openspec validate t2-6b-site-publication --strict` et `git diff --check` : PASS.
- Revue indépendante suivant la méthode gstack /review par l'agent `docs_site_review` : `NO_FINDINGS`, aucun P1/P2. Les dix fichiers, leurs hashes, les routes, la configuration nginx, les permissions et le chemin Ansible ont été inspectés. Revue native dans Codex ; aucun processus de second fournisseur lancé.
- [PR lab-infra #103](https://github.com/guillaume-flambard/lab-infra/pull/103) : tests `hors-ligne`, GitGuardian et CodeRabbit verts, aucun commentaire de revue en ligne ; fusionnée en `a92933aab2c84a638492d58598e0944c957a6d78`.

Les tests existants ont été rejoués dans le worktree isolé. Aucun test de code produit ajouté pour cette publication d'artefacts statiques. Le script HTTP est une recette réutilisable de déploiement.

## EV-PUB-3 : Ansible et isolation

**PASS, AC-PUB-3 et AC-PUB-4.**

`make check` complet : `ok=457 changed=10 unreachable=0 failed=0 skipped=189`. Il s'agit d'un dry-run ; les dix changements simulés ne sont pas appliqués globalement. Les modules partagés sont déjà identiques au serveur.

`make deploy-stack app=drop-site` : `ok=12 changed=3 unreachable=0 failed=0 skipped=3`. Seule la stack drop-site est incluse ; drop et les autres stacks sont ignorées. Réseau lab, dossier parent et modules partagés restent `ok`, sans modification.

Les conteneurs du relais avaient changé auparavant pendant les travaux concurrents. La référence pertinente est le relevé immédiatement avant NOTRE déploiement, comparé au relevé après :

| Conteneur | ID identique avant/après | Démarrage UTC identique |
| --- | --- | --- |
| drop-drop-relay-1 | `b7b59eac713c` | 2026-10-08T17:31:02.018223463Z |
| drop-drop-node-1 | `413e5509aa7f` | 2026-10-08T17:31:02.258065077Z |
| drop-drop-logs-1 | `12a887e89790` | 2026-10-08T14:55:51.68619017Z |

La stack `drop-admission` et les checkouts partagés n'ont pas été modifiés. Le code et le suivi de cette change restent sur une branche drop dédiée ; leur intégration ne force pas un nouveau build et redémarrage du relais pendant le travail voisin.

## EV-PUB-4 : publication réelle

**PASS, AC-PUB-1, AC-PUB-2, AC-PUB-3.**

`python3 stacks/drop-site/check.py https://drop.memolabs.dev` : PASS, dix fichiers identiques au manifeste, racine HTML, types MIME, CSP, HEAD, POST et huit chemins privés/inconnus. HTTP redirige en 302 vers HTTPS ; le certificat est accepté par les clients sans désactiver la validation TLS.

Le tout premier contrôle a reçu 404 pendant l'état Docker `health: starting` : Traefik attend le premier healthcheck. Après le passage à `healthy`, la recette complète passe. Aucun correctif ni contournement TLS nécessaire.

`drop-site-drop-site-1` : `running`, `healthy`, zéro redémarrage, utilisateur `101:101`, racine en lecture seule, aucun port hôte. `/health` du relais renvoie `ok:true, nodes:3`. Une connexion WebSocket sans authentification reçoit toujours le message de type `challenge` sur `/v1`, avant et après publication.

La sonde stacks.tsv sert à l'inventaire et au diagnostic ; elle ne crée pas une surveillance HTTPS périodique. Le healthcheck Docker est actif toutes les 30 secondes. Le retrait et le retour à l'export précédent sont documentés et ne nécessitent aucune restauration de données.

## EV-PUB-5 : rendu et recette

**PASS, AC-PUB-5.** Site HTTPS ouvert dans le navigateur intégré. Accueil affiché avec sa feuille de style, simulation passée à l'étape Réponse, navigation vers Guide, deux schémas chargés, largeur de contenu égale au viewport à 690 pixels. Les octets publiés sont les mêmes que ceux vérifiés en bureau et mobile dans T2.6a. Aperçu public sauvegardé sous `~/.codex/visualizations/2026/10/08/01a11c51-73ef-7561-adec-6e812d5bbe4b/drop-public.jpg`.

Recette humaine : ouvrir le site, parcourir l'échange, lire le guide et le bilan. Aucun compte requis pour les pages et les téléchargements ; les liens des documents vers les sources GitHub nécessitent l'accès au dépôt privé.

## Closure

Les cinq critères sont vérifiés. P0/P1 restants : 0, critères échoués ou en attente : 0, risques critiques/élevés ouverts : 0 dans le périmètre T2.6b. R1 traité par exclusions et preuve de non-redémarrage ; R2 par export exact et refus HTTP ; R3 par worktrees, PR isolée et comparaison des chemins. R4 accepté avec révision et manifeste.

Statut : **READY_FOR_MANUAL_ACCEPTANCE**. L'acceptation visuelle humaine reste distincte des vérifications techniques. T2.6 demeure ouverte pour la vidéo et la distribution finale ; ces travaux ne sont pas annoncés livrés ici.
