# Design

## Parcours et frontière

La coque Tauri garde le tray et le WebView système. La logique de consentement reste dans le panneau du Node local, avec le même jeton et la même CSP. Le panneau conserve ses couleurs neutres et son accent vert ; T3.4 affine l’interface d’opération existante, sans refonte de marque. Au premier lancement, la coque affiche un état d’attente ; en cas d’échec, elle donne une cause courte, une action Réessayer et la possibilité de quitter. Aucune erreur ni journal n’affiche le jeton ou le contenu des demandes.

## Démarrage et reprise

Le bootstrap doit vérifier le code de sortie de `drop init`. Le port vient d’un JSON parsé, jamais d’une recherche textuelle. Avant de lancer `drop serve`, la coque teste l’occupation du port et refuse de lancer un second daemon. Elle garde le `Child` qu’elle a démarré, attend son état de disponibilité dans une borne de 15 secondes, et n’ouvre le panneau qu’après une réponse authentifiée du Node. Une sortie du child ou un délai dépassé entraîne un état d’échec. La surveillance recontrôle l’état après une veille ; la reprise automatique est bornée, puis une action manuelle Réessayer reste disponible. Quitter demande l’arrêt du child et l’attend, sans tuer un autre processus.

Le jeton local ne doit pas être envoyé à un service arbitraire. L’état de santé peut être vérifié d’abord au moyen d’une empreinte de session non sensible que le Node embarqué expose exclusivement sur loopback. L’app ne met le jeton dans l’URL du WebView qu’après cette vérification. Si le port est déjà occupé au démarrage, même par un autre Node, l’app n’adopte pas ce processus : elle affiche le conflit.

## Panneau accessible

Les trois onglets utilisent le motif `tablist` : une tabulation entre dans l’onglet actif, les flèches changent d’onglet, `Home` et `End` atteignent les extrémités. Chaque onglet contrôle un `tabpanel` nommé. Les réponses asynchrones périmées ne remplacent pas une vue plus récente ; une action en cours désactive son bouton jusqu’au résultat. Le rendu garde le focus sur l’action correspondante ou le premier titre de la nouvelle vue. Un état de chargement, un état vide, une erreur actionnable et le retour d’une décision sont annoncés dans une zone `role=status` ou `role=alert` selon le cas. Les intitulés restent précis ; le contenu distant est inséré par `textContent`.

## Distribution et mise à jour

La construction embarque le Node de l’architecture cible et les deux bundles. Le script contrôle la version et l’architecture du runtime, le code de sortie de l’assemblage, et écrit un manifeste de provenance avec hash SHA-256. Le canal initial de mise à jour est **manuel** : aucun service de mise à jour appelé par l’app. Une nouvelle version est un paquet signé/notarisé distribué par un canal choisi ; le propriétaire peut vérifier sa signature et son empreinte avant remplacement. Refuser ou être hors ligne n’affecte pas l’app courante. La recette de retour arrière exige une sauvegarde cohérente de `~/.drop` et respecte les migrations de stockage décrites dans `PRIVATE_PROFILE.md`. Le script distingue construction de développement et release qualifiée ; une release exige l’identité Developer ID et les variables Apple de notarisation avant le build. La signature/notarisation effective et la recette sur un Mac propre restent des preuves à obtenir, jamais inférées d’une compilation.

## Vérification

Tests unitaires du cycle de vie et du contrat de santé, tests DOM du clavier/focus et des erreurs, test de construction sur Mac avec les ressources embarquées, inspection VoiceOver manuelle, contrôle `codesign`/`spctl`/`stapler`, installation hors Node développeur et scénario de mise à jour invalide. Les quatre AC-MAC sont prouvés séparément dans `proof/verification.md` et l’état reflète les preuves réelles.
