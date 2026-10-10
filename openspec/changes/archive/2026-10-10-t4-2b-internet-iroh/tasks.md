## 1. Tests d'abord

- [x] 1.1 Protocole : `iroh_addr`.
- [x] 1.2 Programme : identité, échange direct avec accusé signé, refus d'un non-pair, échec expliqué.
- [x] 1.3 Moteur : adresses partagées et gardées.
- [x] 1.4 Panneau et API : choix du relais.

## 2. Réalisation

- [x] 2.1 `crates/drop-iroh`.
- [x] 2.2 `IrohService`, moteur, daemon, configuration.
- [x] 2.3 Panneau et API.
- [x] 2.4 Build Mac : binaire annexe, notice BSD-3.
- [x] 2.5 Recette : deux nœuds sans réseau local, en direct puis par un `iroh-relay` local.

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `cargo clippy`, `openspec validate --all --strict`, openspec-guard.
- [x] 3.2 Revue adverse, `/cso`.
