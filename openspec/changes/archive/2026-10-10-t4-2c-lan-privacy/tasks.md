## 1. Tests d'abord

- [x] 1.1 Protocole : message `lan_key`.
- [x] 1.2 Annonce tournante, reconnaissance par pair et par invitation.
- [x] 1.3 Clé de découverte partagée à l'appairage et au démarrage, stockage privé.
- [x] 1.4 Reprise après refus passager.

## 2. Réalisation

- [x] 2.1 `lan-tags.ts`, `lan.ts`, `lan-mdns.ts`.
- [x] 2.2 Moteur, stockage, daemon.
- [x] 2.3 Recette réelle : deux nœuds sur ce Mac, annonce sans identifiant, échange de bout en bout.

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --all --strict`, openspec-guard.
- [x] 3.2 Revue adverse, `/cso`.
- [x] 3.3 Correctifs de la revue : frappe préalable par HMAC (rien envoyé sans elle, l'appelant ne se nomme qu'après la réponse), hôte aléatoire et pas d'IPv6 globale, annonce revue toutes les 5 s, annonces vues bornées et purgées, toutes les correspondances essayées, délais qui ne repartent à zéro qu'après dix minutes, arrêt pendant un démarrage, fenêtre de jetons à trois périodes, cache des clés, fichiers de clés illisibles ni écrasés ni remplacés en silence, pas d'envoi de clé quand le mode local est coupé.
