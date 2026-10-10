## Context

Le moteur envoie par `Transport.send(envelope)` et reçoit par `handleEnvelope` (`daemon.ts`). Les enveloppes sont chiffrées pour leur destinataire et signées ; `openEnvelope` rejette tout expéditeur inconnu sauf une demande d'appairage portant un jeton d'invitation valide. La recherche T4.2 (même date) : la liaison Node d'iroh n'a pas de découverte locale ; `bonjour-service` est du JavaScript pur, MIT (ciao ne sait qu’annoncer) ; macOS 15+ demande l'autorisation réseau local à l'app pour ses enfants (TN3179).

## Decisions

- **Poignée de main symétrique.** À l'ouverture, chaque côté envoie `hello { id, nonce }` (32 octets aléatoires). En recevant le `hello` de l'autre, il répond `proof { sig }`, signature Ed25519 de `drop-lan-v1|<nonce de l'autre>|<son id>|<id de l'autre>`. La session n'est authentifiée qu'après les deux preuves vérifiées contre l'identifiant annoncé ; côté sortant, cet identifiant doit être celui visé. Préfixe de domaine pour séparer ces signatures de celles des enveloppes.
- **Trames.** Après authentification, une trame `env { envelope }` par enveloppe ; taille maximale celle d'une enveloppe ; toute trame invalide ferme la session, jamais le Node. Une enveloppe arrivée pendant la vérification de la preuve du pair attend le verdict (16 au plus). Plafonds : 64 connexions, 64 sessions, 100 trames par seconde et par session, 256 pairs découverts.
- **Accusé signé (D63, après revue).** La session n'est pas un canal sûr : quelqu'un sur le réseau peut relayer les deux poignées de main et couper ensuite. Le destinataire répond donc `ack { id, sig }`, signature de `drop-lan-ack-v1|<id>|<destinataire>|<expéditeur>`. Sans accusé valide sous 5 s, l'envoi local échoue, la session est fermée et le moteur passe au relais ; le contrôle de rejeu du moteur écarte un doublon tardif. Un ping toutes les 15 s ferme une session muette. Si les deux côtés se joignent en même temps, la session ouverte par le plus petit identifiant est gardée.
- **Qui peut-on joindre.** Sortant : pair appairé ou inviteur d'un code en cours (`engine.canReachDirectly`). Entrant : pair appairé, appairage en cours, ou toute clé tant qu'une invitation est en cours (`engine.canAcceptDirectly`) ; le moteur filtre ensuite les enveloppes.
- **Adresses.** Seules les adresses IPv4 privées (10/8, 172.16/12, 192.168/16) et IPv6 ULA, comme la politique réseau privée. Le bouclage n'est accepté que sur option (tests, banc) : venu du réseau, il ferait viser au Node ses propres services locaux.
- **Défi du relais.** Le client du relais ne signe plus qu'un défi de 32 octets en base64url, pour qu'un relais ne puisse pas lui faire signer une preuve de session locale ou un accusé.
- **Écoute.** Port local choisi par le système (`lanPort: 0`), annoncé par mDNS. Rien n'écoute si le mode est désactivé.
- **Découverte injectable.** Interface `LanDiscovery` ; `bonjour-service` en production, découverte en mémoire dans les tests (pas de multicast en CI).

## Risks / Trade-offs

- Le multicast mDNS peut être filtré (Wi-Fi invité, réseaux d'entreprise) : la découverte échoue sans erreur ; le relais reste la voie.
- Une adresse annoncée peut être fausse : la poignée de main l'emporte, l'adresse n'est qu'un indice.
- Quelqu'un sur le réseau local peut relayer une session et voir qui parle à qui ; il ne lit ni ne forge rien (enveloppes chiffrées et signées, accusés signés) et ne peut que forcer le passage par le relais. Un canal chiffré propre à la session reste possible plus tard.
- L'annonce mDNS porte l'identifiant fixe du nœud : on peut suivre une personne d'un réseau à l'autre. Une annonce tournante reconnaissable par les seuls pairs est inscrite en T4.2c, avec la reprise après un refus passager.
