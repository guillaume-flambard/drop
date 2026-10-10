## Context

Recherche du 10 octobre 2026 (code publié d'iroh 1.3.0 et docs.iroh.computer) : `SecretKey::from_bytes` prend la graine RFC 8032, dont la clé publique est celle de libsodium, donc l'`EndpointId` vaut l'identifiant drop ; le préréglage `Minimal` n'a ni annuaire ni relais ; sans relais, pas de traversée de NAT, la connexion n'aboutit que si un chemin direct existe ; `iroh-relay` s'auto-héberge, avec liste d'accès par identifiant ; les relais publics de n0 sont « development and hobby use only » et voient les adresses IP ; iroh contient du code BSD-3 dont la notice doit suivre le binaire.

## Decisions

- **Processus** : `drop-iroh` lit une ligne JSON d'initialisation sur l'entrée standard (`seed`, `relay`, `peers`) puis des commandes (`send`, `peers`) ; il écrit `ready`, `addr`, `env`, `sent`, `error`. La graine ne passe jamais par les arguments ni l'environnement. Fin de l'entrée standard : il s'arrête. Il n'ouvre aucun port local en écoute TCP ; seulement le socket UDP d'iroh.
- **Endpoint** : `presets::Minimal`, `RelayMode::Disabled` ou `RelayMode::custom([relais])`, ALPN `drop/1`. Aucune autre infrastructure.
- **Flux** : longueur sur 4 octets puis l'enveloppe en JSON (256 Kio au plus) ; accusé `{ id, sig }`, signature Ed25519 de `drop-iroh-ack-v1|<id>|<destinataire>|<expéditeur>` vérifiée avec l'identifiant distant authentifié par TLS. Entrant : identifiant distant hors des pairs, fermeture.
- **Adresses** : `iroh_addr { relay?, direct[] }` (relais https, ou http en boucle locale pour les essais ; 8 adresses directes au plus, sans adresse de lien local) accepté d'un pair connu pour lui-même, gardé dans `iroh-addrs.json` (`0600`). L'invitation porte aussi les adresses de l'hôte : sans elles, deux nœuds sans relais drop ne pourraient jamais s'appairer.
- **Accueil** : comme pour le réseau local (D60), le programme accepte les pairs et les appairages en cours, et n'importe quel nœud seulement pendant une invitation vivante ; le moteur vérifie ensuite le jeton. Une enveloppe dont l'expéditeur n'est pas le nœud authentifié par TLS n'est ni transmise ni acquittée.
- **Relais d'un pair** : on ne contacte le relais d'un pair que s'il est celui qu'on a soi-même choisi ; sinon seules ses adresses directes servent. Choisir « aucun relais » garantit qu'aucun relais n'est contacté.
- **Ordre** : réseau local, iroh si l'adresse du pair est connue et le programme prêt, relais drop, file. Un chemin iroh en échec n'est pas réessayé pendant 60 s pour ce pair, sauf si son adresse change : une enveloppe n'attend pas deux fois le même délai.
- **Relais** : choix du panneau gardé dans `internet.json` (`0600`) : `off` (défaut), `direct`, `relay` (URL), `n0`. Un changement relance le programme. Le profil privé refuse `n0` et exige un relais dans les réseaux autorisés (D34).
- **Échec expliqué** : sans chemin, `E_IROH_NO_PATH` et, dans le panneau, « Ton collègue n'est pas joignable directement : il faut un relais iroh (le tien, celui de l'équipe, ou celui de test de n0). »
- **Distribution** : copié dans les ressources de l'app à côté du Node embarqué (même chemin que lui, plutôt qu'`externalBin`), signé avec le runtime durci et notarisé avec l'app. `scripts/drop-iroh-notice.ts` écrit l'inventaire des 246 caisses liées et de leurs textes de licence, dont la notice BSD-3 d'iroh. Le daemon le cherche à côté de `node`, ou à `DROP_IROH_BIN` en développement ; absent, le mode Internet est indisponible.
- **Programme** : environnement vide, graine sur l'entrée standard ; il vérifie que l'identifiant annoncé est celui du nœud, sinon il est arrêté. Il redémarre après 5 s, 30 s puis 120 s en cas d'arrêt.

## Risks / Trade-offs

- Même clé pour drop et la poignée de main TLS d'iroh : contextes de signature distincts (TLS 1.3 et préfixes drop), consigné dans D68.
- Sans relais, la plupart des paires derrière un routeur ne se joignent pas : c'est attendu et expliqué.
- Un relais voit les adresses IP et les volumes, jamais le contenu chiffré.

## Revue et recette

- La recette a montré deux défauts, corrigés avec un test chacun : l'hôte n'apprenait l'invitation qu'au rafraîchissement suivant (le moteur émet désormais `access`), et il ne pouvait pas répondre à l'invité dont il ignorait l'adresse (connexion réutilisée dans les deux sens).
- La revue adverse a conduit à : réglages Internet sérialisés et attendus à l'arrêt ; échec de lancement expliqué (`E_IROH_SPAWN`) au lieu d'un démarrage bloqué ; connexions entrantes bornées (64, 16 poignées de main, 4 inconnus, 8 flux par connexion) et fermées quand le nœud n'est plus accepté ; DNS système seulement, mappage de ports désactivé ; adresses privées seulement dans le profil privé ; pairs prévenus quand le mode s'arrête ; corps lu au fil de l'eau, sortie bornée, arrêt explicite si le point d'accès meurt.
