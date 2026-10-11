# Vérification T3.4 — état en cours

Date : 9 octobre 2026. Les preuves ci-dessous concernent un **paquet de développement arm64**, pas une release distribuable.

## Preuves obtenues

- OpenSpec strict : `openspec validate t3-4-private-mac-app --strict` passe. Les quatre scénarios AC-MAC sont définis et marqués comme recettes système manuelles ; le garde de la change indique 4 critères non automatisables, sans nouvelle dette de sélecteurs.
- Suite TypeScript : `pnpm -r lint && pnpm -r typecheck && pnpm -r test` passe, 338 tests dans 35 fichiers. Les tests du panneau vérifient l’authentification de `/app` et la réponse de la sonde de session sur loopback. Le garde canonique passe sur 423 critères, dont 146 reliés à des tests et 258 historiques gelés ; la mise à jour de sa baseline donne +0/−0.
- Shell Rust : `cargo check` et `cargo test` passent ; 2 tests, dont la sonde qui refuse une réponse portant l’identité d’un autre processus.
- Le script `node scripts/build-mac.ts --debug` produit un `.app` et un DMG arm64 avec Node 24.21.0 embarqué. Le manifeste de développement annonce clairement `development-only` ; SHA-256 du dernier DMG construit après correction des états d’erreur : `8c660248610faa8ee7dab851fd0749fea52d4ecba521dff90e71e6aca98ee9c7`.
- Essai isolé avec `DROP_HOME` temporaire, port 17881 : le `.app` démarre son Node embarqué, `/ui/admin/status` renvoie HTTP 200 pour l’identité `Test` sans connexion au relais, puis le port est libéré à la fermeture. Sur un autre profil temporaire, le port 7781 déjà occupé provoque `drop shell E_PORT` sans arrêter ni remplacer le Node présent. Les deux profils temporaires ont été effacés après l’essai.
- Essai de cycle de vie isolé, port 17883 : après deux arrêts forcés successifs du Node, un nouveau PID répond à `/ui/admin/status` à chaque fois ; le troisième arrêt donne `E_RESTART`, sans listener ni boucle de lancement, tandis que l’app reste ouverte. Un premier essai a exposé la course de démarrage `E_START` ; après correction, un profil volontairement invalide sur le port 17884 provoque exactement deux nouvelles tentatives puis `E_RESTART`. `cargo fmt --check` et `cargo test` passent toujours (2 tests). Les profils temporaires ont été effacés.
- Essai du jeton vide sur l’app Mac, port 17885 : `E_TOKEN` reste le seul diagnostic, et aucun daemon n’écoute. Impeccable v4.5.2 ne détecte aucun défaut mécanique sur l’écran d’erreur modifié (`[]`). La commande d’automatisation de l’app native a expiré ; le bouton dans le vrai WebView n’est donc pas qualifié.
- Après cette protection, le dernier `.app` démarre encore sur un profil privé valide isolé (port 17887) : `/ui/admin/status` répond `200`, et le port est libéré à l’arrêt.
- Défaut distinct confirmé sur le Node autonome avant correction : avec `local-token` vide, une requête HTTP sans en-tête vers `/ui/admin/status` a reçu `200`. La coque bloque désormais ce lancement, mais le correctif API et ses régressions sont planifiés en T3.4a, prérequis de T3.5.
- Prévisualisation à 380 × 620 : une carte de consentement et l’écran de collision ont été inspectés. Une flèche droite sélectionne « Équipe » et y garde le focus. Après « Autoriser une fois » sur fixture, le message de résultat est annoncé et reçoit le focus. Impeccable detect sur les deux sources d’interface renvoie `[]`.
- `node scripts/build-mac.ts --release` refuse le build avant assemblage en l’absence d’identité Developer ID et de justificatifs de notarisation dans l’environnement. Aucun secret n’a été lu ni journalisé.

## Ce qui n’est pas encore prouvé

- **AC-MAC-01** : pas de DMG signé/notarisé, pas d’installation sur un Mac propre sans Node développeur, pas de matrice publiée macOS/architecture. Le certificat Developer ID existe sur ce Mac, mais les justificatifs de notarisation ne sont pas configurés dans cet environnement.
- **AC-MAC-02** : la navigation clavier en prévisualisation est observée ; VoiceOver dans le vrai WKWebView, le focus de chaque chemin de décision, la relecture et le zoom restent à tester humainement.
- **AC-MAC-03** : collision, arrêt forcé et borne de tentatives observés sur une instance isolée du vrai binaire Mac ; veille/reprise et action Réessayer dans le WebView restent à jouer.
- **AC-MAC-04** : canal manuel défini et préflight de release en place ; le refus d’une mise à jour, l’installation d’un DMG altéré et le retour arrière avec un état cohérent restent à tester.
- La revue fonctionnelle et la revue de sécurité formelles du diff demandées par le repo restent à terminer. La relecture locale a corrigé un risque de port relu après vérification en conservant le port vérifié dans l’état du shell.

T3.4 reste `doing` et la change reste ouverte. Ne pas présenter le paquet de développement ou la prévisualisation comme une validation des quatre AC-MAC.

## Build signée et notarisée (10 octobre 2026)

Construite par `node scripts/build-mac.ts --release --sign "Developer ID Application: Guillaume Flambard (Q52VN4UT34)" --notary-profile drop-notary` sur le commit `5242fd7` (branche `t3-4-notary-profile`), Mac arm64, Node 24.21.0.

- `xcrun notarytool submit` : statut `Accepted` ; ticket agrafé au DMG et à l'app.
- `spctl --assess --type open --context context:primary-signature -vv dist/mac/drop_0.1.0_aarch64.dmg` : `accepted`, `source=Notarized Developer ID`, `origin=Developer ID Application: Guillaume Flambard (Q52VN4UT34)`.
- `xcrun stapler validate` sur le DMG : `The validate action worked!`.
- SHA-256 du DMG : `f5098f1b8bf656c4c0c0a916d2d2a6f496de6fe5c463c9b9aed8f3ced4d6f1ba`, identique au manifeste `drop-build-manifest.json`.
- Node embarqué re-signé avec l'identité Developer ID, runtime renforcé, sans `get-task-allow`, et exécutable depuis l'app.

Cela lève la partie « pas de DMG signé/notarisé » d'AC-MAC-01. Restent ouverts : installation sur un Mac propre sans Node de développement, matrice publiée macOS et architecture (arm64 seulement), recette VoiceOver. T3.4 reste `blocked` sur ces recettes humaines.

## Revues formelles et gates (12 octobre 2026)

La partie du libellé de l’index qui disait « Reste agent : archiver la preuve de notarisation » était périmée : cette preuve
était déjà consignée ci-dessus le 10 octobre. Le travail agent restant était la revue formelle du diff et les gates.

**Gates (tous verts sur `3ca7ce9`) :** `pnpm -r lint` (eslint `--max-warnings 0` + prettier) 0, `pnpm -r typecheck` 0,
`openspec validate --specs --strict` 18/18, garde `openspec-guard` 0.3.0 en sortie 0 : 419 critères reliés par sélecteur,
0 incertain, 141 gelés par la baseline. `pnpm -r test` : 609 réussis, 1 échoué puisque `packages/simulation/test/campaign.test.ts`
(« AC stops every process it started when the bench receives SIGTERM mid-campaign », T4.1) dépasse son délai de 60 s en charge
parallele. Rejouée seule : 4/4 en 12,4 s. Faux positif de charge, hors périmètre T3.4, signalé en ligne `todo` séparée.

**Revue fonctionnelle du diff (PR #8, +427/-125 sur 7 fichiers, aucune revue avant ce passage).** Verdict : conforme.
Le panneau redessiné ne crée aucun nœud dangereux : `el()` passe par `textContent` et `createTextNode`, toutes les clés
d’attributs sont des littéraux de source (0 clé variable). La seule liaison `href` (`signInLink`, `ui`/`panel.ts`) est
précédée d’un test `indexOf('https://') === 0` et porte `rel="noopener noreferrer"`. Contrat coque/écran vérifié de bout en
bout : les seuls codes affichés sont `E_INIT`, `E_PORT`, `E_TOKEN` et `E_RESTART` (`E_START` étant réécrit en `E_RESTART`
avant affichage), et chacun a un texte dans la carte de messages du splash ; `E_WORKSPACE` et `E_UPDATE_*` vont au journal
seulement, ce qui est correct pour une mise à jour facultative (D70). Deux réserves ouvertes sur le diff d’origine —
`navigator.clipboard.writeText` et le `unlink` sans gestionnaire d’échec — sont déjà corrigées depuis, avec un test de
régression (`panel.test.ts`, « reports a failed invite, unlink or link copy instead of leaving its promise unhandled »).
Reste une note sans impact de sécurité : `drop.state in TONES` interroge la chaîne d’héritage, donc un état nommé
`toString` produirait une classe CSS incohérente — cosmétique, aucune injection possible car la valeur passe par
`setAttribute`. Non corrigé volontairement : toucher à `panel.ts` pour cela n’apporte rien de matériel.

**Revue de sécurité (`/cso`, exécution `1791760833297-b0a8d6b05a6b3097`, terminée).** Aucun constat soutenu dans le périmètre
évalué, complétude `partial`. Le point de vigilance restant est l’entitlement `com.apple.security.cs.allow-unsigned-executable-memory`
appliqué au Node embarqué : il affaiblit le runtime renforcé sans justification écrite dans `docs/` ni dans
`docs/DECISIONS.md`. La notarisation acceptée du 10 octobre prouve qu’il est suffisant, pas qu’il est minimal ; faute de
scénario d’échec concret il est consigné comme dette de durcissement, pas comme vulnérabilité. Deux limites de couverture
à assumer : le profil `application-preparation` est absent (dépôt pnpm, pas de `package-lock.json`), donc aucune reproduction
dynamique n’a été jouée, et la base de comparaison `7d26a04220` dépasse T3.4 — le diff audité est un sur-ensemble du périmètre
de la tâche.

**Ce que la coque fait réellement sur veille.** Elle ne s’abonne à aucun événement système : le sondeur de santé continue
de tourner, et c’est le budget de reprise borné qui absorbe un moteur mort au réveil. La politique est couverte par des
tests unitaires Rust (`a_user_retry_restarts_without_spending_the_restart_budget`, épuisement du budget en boucle, seuil
`MIN_HEALTHY_RUN`), et la preuve du 10 octobre a déjà joué trois arrêts forcés successifs jusqu’à `E_RESTART`.

**Obstacle matériel pour la recette veille.** Elle exige que le Mac dorme vraiment et se réveille de façon fiable. Or
`pmset -g` montre le sommeil empêché par des assertions actives (Safari en lecture média, Claude, runningboardd) et la
planification d’un réveil automatique demande les droits root, absents ici (`sudo` exige le mot de passe ; un
`pmset relative wake 1` sans droits n’enregistre rien dans `pmset -g sched`). Sans réveil planifié garanti, dormir la machine
risquerait de la laisser endormie jusqu’à une frappe physique. La recette veille part donc en recette humaine, aux côtés de
VoiceOver et de l’installation sur un Mac propre. Le bouton « Réessayer » reste pour sa part non qualifié dans le vrai
WebView : le chemin est présent (`index.html` + commande `retry_daemon` exposée à `generate_handler`), le budget est
testé, mais une tentative d’automatisation de l’app native avait déjà expiré précédemment.

**Ouvert après ce passage :** recette veille réelle, recette VoiceOver, installation du paquet notarisé sur un Mac propre,
et justification écrite de l’entitlement du Node embarqué.
