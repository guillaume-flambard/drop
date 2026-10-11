## 1. Tests d'abord

- [x] 1.1 Protocole : signature, vérification, empreinte, refus d'une politique altérée ou d'un autre émetteur.
- [x] 1.2 Node : chargement, fail closed, application (relais, réseau local, iroh, passerelles, clients, modèle), empreinte au relais.
- [x] 1.3 Relais : refus sans empreinte ou avec une autre, politique expirée, TLS natif.
- [x] 1.4 Chart Helm rendu et durci.

## 2. Réalisation

- [x] 2.1 `packages/protocol/src/policy.ts`.
- [x] 2.2 Node et capacités.
- [x] 2.3 Relais : auth, TLS.
- [x] 2.4 Image Docker, chart Helm.

## 3. Vérification

- [x] 3.1 lint, typecheck, test, `openspec validate --strict`, openspec-guard, `helm lint`, image construite et lancée, revue adverse, `/cso`.
