## Context

`stop_daemon` (`main.rs`) tue le daemon quand l'app quitte ou redémarre son moteur. Si la coque meurt sans passer par là, rien ne prévient le daemon. Le Node expose déjà `stop()` (`daemon.ts`) qui ferme le relais, l'API locale et la minuterie.

## Decisions

- **Signal par fermeture de tube.** Le système ferme les descripteurs d'un processus mort, quelle que soit la façon dont il meurt. Une entrée standard en tube que seule la coque détient est donc un signal de vie fiable, sans sondage ni identifiant de processus réutilisable.
- **Activation explicite.** `DROP_EXIT_WITH_PARENT=stdin` ; sans cette variable, `serve` ignore son entrée standard, pour ne pas s'arrêter quand on le lance depuis un terminal ou un script qui ferme stdin.
- **Arrêt propre.** À la fin de stdin : `stop()`, puis sortie avec le code 0, avec une ligne `daemon_parent_gone` dans le journal.
- **Coque.** `Stdio::piped()` pour stdin ; le `Child` gardé dans l'état de l'app détient le tube, qui reste donc ouvert tant que la coque vit.

## Risks / Trade-offs

- Si une future version de la coque relâche le `Child` sans arrêter le daemon, celui-ci s'arrêtera : comportement voulu.
