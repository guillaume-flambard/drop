# Vérification T3.4 — état en cours

Date : 9 octobre 2026. Les preuves ci-dessous concernent un **paquet de développement arm64**, pas une release distribuable.

## Preuves obtenues

- OpenSpec strict : `openspec validate t3-4-private-mac-app --strict` passe. Les quatre scénarios AC-MAC sont définis et marqués comme recettes système manuelles ; le garde de la change indique 4 critères non automatisables, sans nouvelle dette de sélecteurs.
- Suite TypeScript : `pnpm -r lint && pnpm -r typecheck && pnpm -r test` passe, 338 tests dans 35 fichiers. Les tests du panneau vérifient l’authentification de `/app` et la réponse de la sonde de session sur loopback. Le garde canonique passe sur 423 critères, dont 146 reliés à des tests et 258 historiques gelés ; la mise à jour de sa baseline donne +0/−0.
- Shell Rust : `cargo check` et `cargo test` passent ; 2 tests, dont la sonde qui refuse une réponse portant l’identité d’un autre processus.
- Le script `node scripts/build-mac.ts --debug` produit un `.app` et un DMG arm64 avec Node 24.21.0 embarqué. Le manifeste de développement annonce clairement `development-only` ; SHA-256 du dernier DMG construit sur le code revu : `396699c5ac3ee1181eaeb25aa2465dfbf699c77133890e9dc00be56fa307a069`.
- Essai isolé avec `DROP_HOME` temporaire, port 17881 : le `.app` démarre son Node embarqué, `/ui/admin/status` renvoie HTTP 200 pour l’identité `Test` sans connexion au relais, puis le port est libéré à la fermeture. Sur un autre profil temporaire, le port 7781 déjà occupé provoque `drop shell E_PORT` sans arrêter ni remplacer le Node présent. Les deux profils temporaires ont été effacés après l’essai.
- Prévisualisation à 380 × 620 : une carte de consentement et l’écran de collision ont été inspectés. Une flèche droite sélectionne « Équipe » et y garde le focus. Après « Autoriser une fois » sur fixture, le message de résultat est annoncé et reçoit le focus. Impeccable detect sur les deux sources d’interface renvoie `[]`.
- `node scripts/build-mac.ts --release` refuse le build avant assemblage en l’absence d’identité Developer ID et de justificatifs de notarisation dans l’environnement. Aucun secret n’a été lu ni journalisé.

## Ce qui n’est pas encore prouvé

- **AC-MAC-01** : pas de DMG signé/notarisé, pas d’installation sur un Mac propre sans Node développeur, pas de matrice publiée macOS/architecture. Le certificat Developer ID existe sur ce Mac, mais les justificatifs de notarisation ne sont pas configurés dans cet environnement.
- **AC-MAC-02** : la navigation clavier en prévisualisation est observée ; VoiceOver dans le vrai WKWebView, le focus de chaque chemin de décision, la relecture et le zoom restent à tester humainement.
- **AC-MAC-03** : collision et démarrage/arrêt isolés observés ; panne du sidecar après démarrage, veille/reprise et borne de tentatives restent à jouer sur le vrai Mac.
- **AC-MAC-04** : canal manuel défini et préflight de release en place ; le refus d’une mise à jour, l’installation d’un DMG altéré et le retour arrière avec un état cohérent restent à tester.
- La revue fonctionnelle et la revue de sécurité formelles du diff demandées par le repo restent à terminer. La relecture locale a corrigé un risque de port relu après vérification en conservant le port vérifié dans l’état du shell.

T3.4 reste `doing` et la change reste ouverte. Ne pas présenter le paquet de développement ou la prévisualisation comme une validation des quatre AC-MAC.
