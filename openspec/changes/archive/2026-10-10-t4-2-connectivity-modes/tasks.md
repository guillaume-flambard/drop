## 1. Tests d'abord

- [x] 1.1 Filtre d'adresses, poignée de main (succès, imposteur, sans preuve), refus d'une cible non autorisée.
- [x] 1.2 Échange complet entre deux moteurs appairés sans relais, par sessions locales et découverte en mémoire.
- [x] 1.3 Mode désactivé : ni écoute ni annonce.

## 2. Réalisation

- [x] 2.1 `lan.ts` : poignée de main, sessions, service, découverte injectable ; `lan-mdns.ts` avec `bonjour-service`.
- [x] 2.2 Moteur : `canReachDirectly` ; daemon : transport local puis relais ; configuration `lan` ; état dans l'API.
- [x] 2.3 `Info.plist` de l'app ; banc de simulation sans mode local.
- [x] 2.5 Correctifs de la revue : erreurs de socket, accusé signé, refus des clés inconnues hors invitation, plafonds, trames précoces, bouclage sur option, ping, abandon des connexions à l'arrêt, écoute impossible en `E_LAN_DENIED`, défi du relais au format strict.
- [x] 2.4 Recette réelle : deux nœuds sur ce Mac, relais arrêté, découverte mDNS et demande aboutie.

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `cargo clippy`, openspec-guard avec sélecteurs et baseline sans ajout.
- [x] 3.2 `/review` (gstack) et `/cso` (la change touche `node` et ouvre une écoute réseau).
