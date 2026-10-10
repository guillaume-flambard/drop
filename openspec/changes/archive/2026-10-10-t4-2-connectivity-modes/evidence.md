# Preuves T4.2

| Critère | Preuve |
|---|---|
| Adresses publiques ignorées | Test « local network (T4.2) > keeps only private addresses from discovery, loopback only when allowed ». |
| Imposteur refusé | Test « … > refuses a peer whose proof does not match the announced or expected key » : fermeture `E_LAN_IDENTITY` sans trame envoyée après la preuve, la même session signée avec la bonne clé reste ouverte ; une cible sortante dont la preuve ne correspond pas est `unreachable`. |
| Clé inconnue refusée hors invitation | Test « … > refuses an unknown key when no invite is live » : fermeture `E_LAN_UNKNOWN`, rien transmis au moteur. |
| Trames invalides sans arrêt du Node | Test « … > survives malformed, oversized and early frames, and dead addresses » : trame de 600 Kio, texte hors JSON, enveloppe envoyée avant la fin de la vérification (retenue puis livrée), pair annoncé sur un port mort ; vitest échoue sur toute exception non rattrapée. |
| Accusé signé exigé | Test « … > counts an envelope as delivered only after the peer signed its acknowledgement » : un accusé signé par une autre clé donne `unreachable`, le vrai pair donne `delivered`. |
| Échange sans relais | Test « … > completes a consented drop between two paired nodes with no relay at all », et recette réelle le 10 octobre 2026 (`lan-live.sh`, après correctifs) : deux `drop serve` sur ce Mac, relais pointé sur un port vide, découverte mDNS réelle, état `lan:"on"`, appairage et catalogue en 2 s, demande consentie jusqu'à `receipted`, 0 connexion au relais, aucun événement `lan_*` d'erreur. |
| Mode local désactivé | Test « … > neither listens nor announces when the local mode is off ». |
| Écoute impossible | Test « … > reports E_LAN_DENIED and keeps going when the local port cannot be opened ». |
| Défi du relais au format strict | Test « relay > signs only a 32-byte challenge, never another text a relay sends ». |

Contrôle par mutation : quatre protections retirées une à une (vérification de la preuve, écouteur d'erreur de socket, vérification de l'accusé, refus des clés inconnues) ; chaque fois au moins un test échoue.

## Revue

Revue adverse et sécurité (sous-agent indépendant) sur la première version : trois critiques, toutes corrigées.
1. Socket entrant sans écouteur `error` : une trame trop grande arrêtait le Node avant toute preuve.
2. Poignée de main relayable par un tiers du réseau, qui remplaçait la vraie session.
3. Remise locale comptée sans accusé : enveloppes perdues en silence.

Corrigés aussi : rejet non rattrapé sur adresse morte, clés inconnues acceptées hors invitation, absence de plafonds, bouclage accepté depuis le réseau, échec d'écoute qui arrêtait le daemon, connexions en cours après l'arrêt, test d'imposteur qui ne prouvait pas la vérification de signature, défi du relais signé sans contrôle de format. Décision D63. Restent, acceptés et inscrits en T4.2c : identifiant fixe dans l'annonce mDNS, absence de canal chiffré propre à la session (un tiers voit qui parle à qui et peut forcer le relais), état `denied` sans reprise après une erreur passagère.

`/cso` gstack ciblé en mode diff (run `1791642086789-1c5b71193695993a`) : statut partiel (seules des images et archives binaires du dépôt n'ont pas été lues), deux constats, faible et informatif, ceux de T4.2c ; aucune faille élevée.

D61 corrigée à l'implémentation : `@homebridge/ciao` ne sait qu'annoncer ; `bonjour-service` le remplace.

## Vérification

`pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` (380 tests), `cargo clippy -D warnings` sans avertissement, `openspec validate --all --strict`, openspec-guard avec sélecteurs.
