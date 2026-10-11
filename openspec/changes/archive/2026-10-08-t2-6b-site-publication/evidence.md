# Evidence

Vérification le 8 octobre 2026, vers 19 h 40, heure de Paris. Scope : T2.6b, publication du site déjà livré, sans modification du code produit. Les détails de l'infrastructure privée (dépôt, chemins, conteneurs, outillage de déploiement) ne figurent pas dans ce dépôt public ; ce résumé garde les résultats.

## EV-PUB-1 : export et configuration

**PASS, AC-PUB-1, AC-PUB-2, AC-PUB-4.** `pnpm site:build` produit dix fichiers depuis `drop@54654b1`. Le service du site possède un manifeste SHA-256 et un contrôle HTTP reproductible. Les dix fichiers ont été comparés au snapshot par le relecteur indépendant.

nginx 1.31.6, digest `sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2`. `nginx -t` passe dans un conteneur sans privilèges et sans réseau. Un second conteneur isolé, non routé et sans port hôte, a servi l'export pour le contrôle HTTP : dix hashes, racine HTML, MIME, CSP, HEAD, refus POST et huit chemins privés/inconnus, tous PASS.

## EV-PUB-2 : tests, revue et PR

**PASS, AC-PUB-5.**

- `pnpm -r lint` : PASS.
- `pnpm -r typecheck` : PASS.
- `pnpm -r test` : 229 tests, 20 fichiers, PASS.
- `openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail` : PASS, 54 critères explicitement reliés, 259 gelés, 14 exclus.
- Même commande avec `--update-baseline` : zéro ajout et zéro retrait.
- `openspec validate t2-6b-site-publication --strict` et `git diff --check` : PASS.
- Revue indépendante suivant la méthode gstack /review par l'agent `docs_site_review` : `NO_FINDINGS`, aucun P1/P2. Les dix fichiers, leurs hashes, les routes, la configuration nginx, les permissions et le chemin de déploiement ont été inspectés. Revue native dans Codex ; aucun processus de second fournisseur lancé.
- PR du dépôt d'infrastructure privé : contrôles hors ligne, détection de secrets et revue automatique verts, aucun commentaire de revue en ligne ; fusionnée.

Les tests existants ont été rejoués dans le worktree isolé. Aucun test de code produit ajouté pour cette publication d'artefacts statiques. Le script HTTP est une recette réutilisable de déploiement.

## EV-PUB-3 : déploiement et isolation

**PASS, AC-PUB-3 et AC-PUB-4.**

Le contrôle à blanc complet de l'infrastructure passe sans échec ni hôte injoignable ; ses changements simulés ne sont pas appliqués globalement. Le déploiement ciblé n'inclut que le service du site ; le relais et les autres services sont ignorés, les modules partagés restent sans modification.

Les conteneurs du relais avaient changé auparavant pendant les travaux concurrents. La référence pertinente est le relevé immédiatement avant NOTRE déploiement, comparé au relevé après : les trois conteneurs du relais gardent le même identifiant et la même heure de démarrage.

Le chantier voisin d'admission n'a pas été modifié. Le code et le suivi de cette change restent sur une branche drop dédiée ; leur intégration ne force pas un nouveau build et redémarrage du relais pendant le travail voisin.

## EV-PUB-4 : publication réelle

**PASS, AC-PUB-1, AC-PUB-2, AC-PUB-3.**

Le contrôle HTTP contre `https://drop.memolabs.dev` : PASS, dix fichiers identiques au manifeste, racine HTML, types MIME, CSP, HEAD, POST et huit chemins privés/inconnus. HTTP redirige en 302 vers HTTPS ; le certificat est accepté par les clients sans désactiver la validation TLS.

Le tout premier contrôle a reçu 404 pendant l'état Docker `health: starting` : le reverse proxy attend le premier healthcheck. Après le passage à `healthy`, la recette complète passe. Aucun correctif ni contournement TLS nécessaire.

Le conteneur du site : `running`, `healthy`, zéro redémarrage, utilisateur non root, racine en lecture seule, aucun port hôte. `/health` du relais renvoie `ok:true, nodes:3`. Une connexion WebSocket sans authentification reçoit toujours le message de type `challenge` sur `/v1`, avant et après publication.

La sonde d'inventaire sert au diagnostic ; elle ne crée pas une surveillance HTTPS périodique. Le healthcheck Docker est actif toutes les 30 secondes. Le retrait et le retour à l'export précédent sont documentés et ne nécessitent aucune restauration de données.

## EV-PUB-5 : rendu et recette

**PASS, AC-PUB-5.** Site HTTPS ouvert dans le navigateur intégré. Accueil affiché avec sa feuille de style, simulation passée à l'étape Réponse, navigation vers Guide, deux schémas chargés, largeur de contenu égale au viewport à 690 pixels. Les octets publiés sont les mêmes que ceux vérifiés en bureau et mobile dans T2.6a. Aperçu public sauvegardé localement, hors du dépôt.

Recette humaine : ouvrir le site, parcourir l'échange, lire le guide et le bilan. Aucun compte requis pour les pages et les téléchargements ; les liens des documents vers les sources GitHub nécessitaient alors l'accès au dépôt, encore privé.

## Closure

Les cinq critères sont vérifiés. P0/P1 restants : 0, critères échoués ou en attente : 0, risques critiques/élevés ouverts : 0 dans le périmètre T2.6b. R1 traité par exclusions et preuve de non-redémarrage ; R2 par export exact et refus HTTP ; R3 par branches, PR isolée et comparaison des chemins. R4 accepté avec révision et manifeste.

Statut : **READY_FOR_MANUAL_ACCEPTANCE**. L'acceptation visuelle humaine reste distincte des vérifications techniques. T2.6 demeure ouverte pour la vidéo et la distribution finale ; ces travaux ne sont pas annoncés livrés ici.
