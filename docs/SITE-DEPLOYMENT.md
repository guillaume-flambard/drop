# Publication du site drop

La vitrine et la documentation sont en ligne sur [drop.memolabs.dev](https://drop.memolabs.dev), vérifiées le 8 octobre 2026 à 19 h 40 (Paris). Cette livraison T2.6b publie l'export T2.6a du commit `54654b1`. La configuration est fusionnée par [lab-infra #103](https://github.com/guillaume-flambard/lab-infra/pull/103), commit `a92933a`. Le bilan produit reste un instantané daté du commit `cacf1cc`, comme indiqué sur la page Avancement.

## Organisation

Les sources sont `site/`, `docs/GUIDE.md`, `docs/AVANCEMENT.md` et `docs/diagrams/`. `pnpm site:build` produit une allowlist de dix fichiers dans `dist/site/`. Le dépôt lab-infra conserve leur export dans `stacks/drop-site/html/`, sa révision et ses hashes dans `SOURCE.json`, ainsi que la configuration nginx/Traefik.

Le serveur du site n'a accès ni au dépôt drop, ni aux clés, ni aux données des Nodes. Il tourne sans privilèges, avec montages en lecture seule et sans port hôte. Les règles excluent `/v1*` et `/health`, qui restent servis par le relais. Arrêter ou mettre à jour la stack `drop-site` ne nécessite pas de redémarrer `drop`.

## Déployer une révision

Dans un worktree propre, construire le site et vérifier les commandes du dépôt. Dans un worktree lab-infra distinct, remplacer l'export public complet, mettre à jour son manifeste et ouvrir une PR limitée à la stack. Les instructions d'exploitation détaillées et le contrôle HTTP sont dans `lab-infra/stacks/drop-site/README.md` et `check.py`.

Après revue, le chemin de déploiement reste `make check`, puis `make deploy-stack app=drop-site` depuis lab-infra. Le rôle utilise le verrou autodeploy. Vérifier le HTTPS, les dix hashes, les refus, le challenge WebSocket du relais et les identifiants/dates de démarrage de ses conteneurs avant et après.

La sonde déclarée dans l'inventaire ne constitue pas à elle seule une surveillance HTTPS périodique. Le conteneur dispose de son propre healthcheck. Les mises à jour de contenu passent par Ansible, pas par un tag d'image latest.

## Revenir en arrière

Rétablir l'export précédent par un revert dans lab-infra, puis redéployer uniquement `drop-site`. Pour retirer la vitrine, arrêter uniquement cette stack sous le verrou autodeploy et retirer son entrée d'inventaire par PR. Le relais et les données utilisateur restent indépendants.

## Preuves de cette publication

Voir les critères, commandes et résultats de la change `t2-6b-site-publication` dans `openspec/changes/`, puis `openspec/changes/archive/` après clôture. La mise en ligne n'achève pas T2.6 : la vidéo et les boutons de distribution finale restent à livrer.
