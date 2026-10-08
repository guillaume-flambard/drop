# Evidence

Date : 8 octobre 2026. Périmètre : T2.6a, analyse, documentation illustrée et site local. Cette clôture ne qualifie ni le produit complet ni son déploiement public. Sources produit arrêtées au commit `cacf1cc` ; fichiers de cette change ajoutés au workspace pour les vérifications.

## EV-01 : analyse et documentation

**PASS**, AC-DOC-1 et AC-DOC-2. Inspection des sept packages, de l'architecture, des specs, de `docs/TASKS.md`, des décisions, des tests et des traces de démonstration. Le bilan compte 32 tâches produit : 25 `done`, 2 `doing`, 4 `todo`, 1 `blocked`, hors T2.6a. Les ajouts T2.9 et T2.5 survenus pendant la session ont été intégrés. La documentation distingue implémentation, tests locaux, démonstration historique et validation utilisateur absente.

Livrables : `docs/GUIDE.md`, `docs/AVANCEMENT.md`, `README.md` et trois SVG dans `docs/diagrams/`. Le guide explique les autorisations, le modèle distant, le paiement, les limites du scanner et les erreurs. Les commandes d'assemblage utilisent bien `node scripts/bundle.ts` ; la démo avec un modèle requiert une clé. La démo payante et le serveur distant n'ont pas été exécutés ou inspectés pour cette analyse.

## EV-02 : comportement et frontières du serveur

**PASS**, AC-SITE-1 et AC-SITE-3. Les trois tests de `test/site.test.ts` passent. Ils ont été écrits avant le serveur et observés en échec lorsque le module n'existait pas, puis exécutés après implémentation et corrections.

- Trois pages françaises, ancres et liens locaux valides, images avec texte alternatif.
- Fichiers privés et traversées de chemin refusés ; encodage invalide refusé ; POST refusé ; Host extérieur refusé ; HEAD sans corps.
- Assemblage reproductible et suppression d'un fichier obsolète introduit dans la sortie de test ; réécriture des liens des exports Markdown.

Le serveur écoute sur `127.0.0.1`. L'allowlist contient exactement dix fichiers. La CSP interdit les scripts, connexions et formulaires. Aucun code applicatif JavaScript dans les pages, aucun service drop appelé par la simulation.

## EV-03 : vérification navigateur

**PASS**, AC-DOC-2, AC-SITE-1 et AC-SITE-2. Vérification dans le navigateur intégré Codex sur `http://127.0.0.1:4173`.

- Vue bureau à 1440 × 1000 et capture de la page d'accueil.
- Trois pages vérifiées à 390 pixels de largeur, sans débordement horizontal selon le DOM ; bilan vérifié aussi à 320 pixels.
- Les quatre étapes de l'échange se sélectionnent par leur libellé et par les flèches du clavier, avec le panneau correspondant visible.
- Navigation vers guide et bilan, ouverture de l'accordéon « Qui paie le modèle ? », images chargées.
- SVG intégrés lisibles et feuille de route ouverte directement. Après la revue, les SVG utilisent des attributs de présentation compatibles avec la CSP, sans style incorporé.
- Focus clair sur le bloc sombre après correction de contraste.

Captures de session conservées sous `/tmp/drop-site-verification/`. Le rendu mobile a été inspecté en capture de page entière, car la capture de viewport du navigateur présentait un recadrage instrumental. Ces vérifications ne constituent pas un audit exhaustif avec lecteur d'écran.

## EV-04 : contrôles du dépôt

**PASS**, AC-VERIFY-1 et AC-SITE-3. Commandes exécutées avec le préfixe RTK demandé par l'environnement ; les commandes ci-dessous montrent les programmes effectivement vérifiés.

| Contrôle | Résultat |
| --- | --- |
| `pnpm -r lint` | PASS, ESLint et Prettier |
| `pnpm -r typecheck` | PASS, commande exécutée via `rtk proxy` pour préserver le mode récursif |
| `pnpm -r test` | PASS, 229 tests dans 20 fichiers, dont 3 tests du site |
| `node scripts/bundle.ts` | PASS, bundles CLI et MCP générés |
| `pnpm site:build` / `pnpm site:preview` | PASS, dix fichiers publics, serveur local utilisé dans le navigateur |
| `npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail` | PASS, 54 critères reliés, 259 gelés, 14 exclus |
| Même commande avec `--update-baseline` à la place de `--fail-on fail` | PASS, zéro ajout et zéro retrait, baseline inchangée |
| `openspec validate t2-6a-docs-site-preview --strict` | PASS, change documentaire avec `skip_specs: true` |
| `git diff --check` | PASS |

54 / 313 est un taux de traçabilité explicite des critères testables, pas une mesure de couverture du code. Les 229 tests incluent les modifications concurrentes T2.9 et T2.5 ; ils ne sont pas tous ajoutés par T2.6a. Aucun changement de code produit ni de dépendance par cette change.

Documentation primaire consultée pour le serveur : API [HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html) et [fs](https://nodejs.org/docs/latest-v24.x/api/fs.html) de Node 24. Le runtime utilisé est Node 24.21.0.

## EV-05 : revue indépendante et tentative de falsification

**PASS après corrections**, tous les critères. Revue avec la checklist et la méthode adversariale du skill gstack `review`. Un agent natif en contexte neuf a cherché les défauts dans le contenu, les commandes, les liens, les contrôles HTTP et le CSS.

Trois défauts P2 trouvés et résolus dans les tâches existantes : sortie générée pouvant conserver des fichiers obsolètes (2.2), styles de SVG bloqués à l'ouverture directe sous CSP (2.1), contraste insuffisant du focus sur le bloc sombre (2.1). Le test de construction contient maintenant le cas du fichier obsolète. La seconde revue conclut `NO_FINDINGS`, confirme les trois corrections, 61 liens Markdown valides et les comptes de tâches. Elle a relancé les trois tests du site : PASS.

La revue est indépendante du contexte d'implémentation, dans le même environnement Codex ; aucun second modèle externe n'a été invoqué. Pas de `/cso` requis : aucun package protocole, relais, Node, runner, capacité ou requester MCP modifié.

## EV-06 : risques et clôture

| Risque | Statut final | Preuve / mesure |
| --- | --- | --- |
| R1 : promesse excessive de maturité | Mitigé | Prototype et simulation explicitement nommés ; bilan daté ; aucun faux bouton d'installation ; EV-01 et EV-05 |
| R2 : confusion sur le modèle distant | Mitigé | Frontière du fournisseur expliquée sur le site et dans le guide ; EV-01 et EV-05 |
| R3 : fichiers privés servis | Mitigé | Allowlist, écoute locale, nettoyage de sortie et tests adversariaux ; EV-02 |
| R4 : dérive ultérieure du bilan | Accepté avec mesure | Snapshot `cacf1cc`, date et commandes de rafraîchissement visibles |
| R5 : bibliothèque ou police distante | Évité | Ressources locales, aucune dépendance ajoutée |

Les six exigences ont un critère vérifié. P0 ouverts : 0 ; P1 ouverts : 0 ; critères en attente ou échoués : 0 ; risques critiques ou élevés ouverts : 0, dans le périmètre T2.6a. Les sujets non applicables ou inchangés sont classifiés dans `design.md` ; aucun inconnu bloquant ne subsiste pour la prévisualisation.

Travaux produit restants hors de cette change : app Mac, distribution publique, vidéo de démonstration, publication du site, essais chez les testeurs et autres lignes de l'index. T2.6 reste ouverte ; son point d'arrêt humain avant mise en ligne est conservé. Aucune publication, aucun push et aucune modification du serveur distant effectués.

## Manual acceptance

1. Ouvrir `http://127.0.0.1:4173` après `pnpm site:preview` si le serveur n'est plus lancé.
2. Parcourir les quatre étapes de l'échange pour juger si le principe se comprend rapidement.
3. Lire les pages Guide et Avancement, puis valider le ton et l'identité visuelle.

Le travail d'implémentation est vérifié ; l'acceptation humaine de la présentation reste attendue. Statut : **READY_FOR_MANUAL_ACCEPTANCE**.
