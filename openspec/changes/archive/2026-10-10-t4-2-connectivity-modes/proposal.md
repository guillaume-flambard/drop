## Why

T4.2 (D59 à D62, choix de Guillaume le 10 octobre 2026) : deux collègues sur le même réseau doivent échanger sans aucun serveur, même hors ligne. Aujourd'hui tout passe par un relais WebSocket.

Prise à la demande explicite de Guillaume alors que sa dépendance T3.1b reste en cours chez Codex : la change ne touche ni au protocole ni au stockage anti-rejeu.

## What Changes

- **Découverte** : le Node annonce `_drop._tcp` sur le réseau local (`bonjour-service`, D61) avec son identifiant, et découvre ses pairs ; seules les adresses privées sont retenues.
- **Session authentifiée** : connexion WebSocket directe entre pairs, ouverte par un défi signé dans les deux sens avec la clé Ed25519 attendue (D60). Une clé inconnue ne peut transmettre qu'une demande d'appairage, que le moteur rejette déjà sans jeton d'invitation.
- **Chemin préféré** : une enveloppe vers un pair joignable localement passe par la session locale, sinon par le relais configuré, sinon elle attend dans la file d'envoi comme aujourd'hui.
- **Refus et désactivation** : `E_LAN_DENIED` si macOS refuse l'accès au réseau local ; mode désactivable par la configuration (`lan: false`) ; le banc de simulation le désactive. L'app déclare `NSLocalNetworkUsageDescription` et `NSBonjourServices`.

## Capabilities

### Modified Capabilities

- `node` : découverte locale, session locale authentifiée, chemin local préféré, mode local refusé ou désactivé.

## Non-goals

- Internet par iroh et choix d'un relais iroh : T4.2b.
- Pas de modification du format des enveloppes, du chiffrement, du rejeu ni du relais drop.
- Pas d'interface de choix du mode de connexion au premier lancement : T4.2b.
- Pas de Windows ni de Linux.

## Impact

`packages/node` (lan, daemon, config, api), dépendance `bonjour-service`, `apps/mac/src-tauri/Info.plist`, `packages/simulation` (désactive le mode local).
