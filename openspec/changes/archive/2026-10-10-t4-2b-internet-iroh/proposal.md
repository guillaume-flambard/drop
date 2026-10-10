## Why

D59 : deux collègues qui ne sont pas sur le même réseau doivent pouvoir échanger sans serveur drop, par iroh, avec un relais seulement s'ils le choisissent. Aujourd'hui seuls le réseau local (T4.2) et le relais WebSocket drop existent.

Choix de Guillaume le 10 octobre 2026 (« oui aux 8 ») : programme Rust séparé `drop-iroh` (iroh 1.3.0, préréglage `Minimal`) piloté par l'entrée et la sortie standard ; même clé Ed25519 que l'identité drop ; adresses échangées entre pairs par message chiffré `iroh_addr`, sans annuaire ; aucun relais par défaut, choix explicite dans le panneau ; ordre réseau local, iroh, relais drop, file ; un flux QUIC par enveloppe avec accusé signé ; binaire Apple Silicon embarqué et notice BSD-3 ; essais en direct et par relais iroh auto-hébergé, sans contact avec n0. Faits vérifiés dans la doc et le code d'iroh 1.3.0 le même jour. Décision D68.

## What Changes

- **`crates/drop-iroh`** : programme Rust ; clé iroh = graine de la clé drop ; aucun annuaire ni relais n0 ; relais seulement s'il est configuré ; connexions entrantes limitées aux pairs appairés ; flux par enveloppe, accusé signé `drop-iroh-ack-v1`.
- **Node** : `IrohService` lance le programme si le mode Internet est actif, lui passe la graine par l'entrée standard, garde les adresses des pairs ; voie iroh entre réseau local et relais drop ; `iroh_addr` envoyé aux pairs au démarrage et à chaque changement ; échec expliqué.
- **Panneau** : « Connexion par Internet » : désactivée, mon relais ou celui de l'équipe, relais de test n0 signalé comme tiers.
- **Distribution** : binaire annexe de l'app Mac, notice BSD-3.

## Capabilities

### Modified Capabilities

- `node` : voie Internet par iroh.
- `protocol` : message `iroh_addr`.
- `owner-app` : choix du relais Internet.

## Non-goals

- Binaire Intel, Windows et Linux.
- Annuaire auto-hébergé (`iroh-dns-server`) et mDNS d'iroh : le réseau local reste celui de T4.2.
- Jeton d'accès au relais : l'accès se règle sur le relais par liste d'identifiants.
- Retrait du relais WebSocket drop : il reste pour l'entreprise (T4.10).

## Impact

`crates/drop-iroh` (nouveau), `packages/protocol`, `packages/node` (iroh, moteur, daemon, configuration, API, panneau), `scripts/build-mac.ts`, `apps/mac/src-tauri`.
