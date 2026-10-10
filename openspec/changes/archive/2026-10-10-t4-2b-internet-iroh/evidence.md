# Preuves T4.2b

| Critère | Preuve |
|---|---|
| Identité iroh issue de drop | Test « internet (T4.2b) > derives the iroh identity from the drop key, so the iroh id is the drop node id ». Sans programme : `unavailable`. Programme impossible à lancer : `failed`, `E_IROH_SPAWN`, sans bloquer le démarrage. |
| Échange direct avec accusé | Test « … > delivers an envelope directly between two nodes with no relay, with a signed acknowledgement ». Connexion réutilisée ; réponse sur la connexion ouverte par l'autre, sans connaître son adresse ; accusé non signé par le destinataire refusé (`E_IROH_ACK`). |
| Non-pair refusé | Test « … > refuses a connection from a node that is not a paired peer ». Inconnu sans invitation refusé ; enveloppe signée par un autre que le nœud authentifié ni transmise ni acquittée ; pendant une invitation, 10 enveloppes par minute au plus, puis coupure à la fin de l'invitation. |
| Échec expliqué | Test « … > explains the failure when no path exists without a relay ». `E_IROH_NO_PATH`, phrase du panneau, voie suivante essayée, pas de nouvelle attente sur le même chemin mort, relais nommé par un pair jamais contacté sans relais choisi. |
| Adresses partagées | Test « … > shares its iroh addresses with each paired peer and keeps only valid ones ». Relais https gardé, http public refusé, http en boucle locale accepté, arrêt annoncé (`direct: []`), invitation porteuse des adresses, accès poussé aussitôt (`access`), adresse plantée par un inconnu ignorée. |
| Format `iroh_addr` | Test « internet (T4.2b) > carries iroh addresses only in their documented shape » (protocole). |
| Choix du relais | Test « … > lets the owner choose no relay, their own relay or the n0 test relays, flagged as third party ». API, refus d'un relais http public, profil privé (pas de n0, relais parmi les origines autorisées, adresses privées seulement), libellés du panneau. |

Vérification : `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` (53 fichiers, 428 tests), `cargo clippy --release -- -D warnings`, `openspec validate --strict`, openspec-guard.

## Recette réelle (10 octobre 2026, ce Mac)

Deux `drop serve`, réseau local coupé (`DROP_LAN=off`), relais drop pointé sur un port vide, mode `direct` :
- `drop-iroh` sans argument ni variable d'environnement, aucune socket TCP ;
- invitation porteuse des adresses (privées seulement, profil privé) ;
- appairage et catalogue en 1 s, demande consentie jusqu'à `receipted`, aucune connexion au relais drop ;
- `iroh-addrs.json` en `0600` ; graine absente des journaux ;
- relais `iroh-relay --dev` auto-hébergé : envoi livré à un pair connu seulement par son relais ; sans relais choisi, le relais du pair n'est pas contacté (`E_IROH_NO_PATH`) ;
- profil privé : relais hors des origines autorisées refusé, relais http public refusé ;
- aucun `drop-iroh` restant après l'arrêt des deux daemons.

La recette a trouvé deux défauts avant la revue, corrigés avec un test : l'hôte apprenait l'invitation 2 s trop tard, et ne savait pas répondre à l'invité.

## Mutation

13 protections retirées une à une, 10 tuées. Survivantes, toutes de second rang :
- `iroh_addr` d'un inconnu : `openEnvelope` rejette déjà l'enveloppe d'un inconnu qui n'est pas une demande d'appairage ;
- fermeture des connexions d'un nœud qui n'est plus accepté, et refus à l'acceptation : chaque flux revérifie l'accès, aucune enveloppe ne passe ; l'effet propre (libérer des places) n'est pas observable par l'interface.

## Revue

Revue adverse indépendante : 2 hautes, 5 moyennes, 4 basses. Corrigées :
- réglages concurrents laissant un second programme avec la graine : changements sérialisés, attendus à l'arrêt ;
- connexions entrantes jamais évincées : 64 au plus, 16 poignées de main, 4 inconnus, 8 flux, fermeture au retrait d'un pair ou à la fin de l'invitation ;
- lancement en échec bloquant le daemon : `E_IROH_SPAWN`, nouvel essai ;
- résolveurs DNS publics de secours et mappage de ports d'iroh : désactivés ;
- adresses directes hors réseau privé dans le profil privé : filtrées à l'annonce et à l'appel ;
- arrêt du mode non annoncé, `stop()` pendant `start()`, corps dimensionné par la longueur annoncée, sortie non bornée, point d'accès mort silencieux, `DROP_IROH_BIN` lu dans l'app.

Hors périmètre, en tâches : T4.2d (cache anti-rejeu saturable par un inconnu pendant une invitation, antérieur à T4.2b ; le chemin iroh le borne à 10 enveloppes par minute) et T4.2e (messages d'adresse mis en file pouvant évincer de vrais messages). Exposition acceptée et documentée : l'invitation porte les adresses de l'hôte.

## /cso

Lancé sur le diff (`--diff --code --offline`), run `1791658123441-083d265f8145d5eb`, statut `partial`. La première soumission a été refusée parce que son constat visait `packages/protocol/src/envelope.ts`, hors du diff. Le run a été clos avant la correction, si bien que le rapport de l'outil n'enregistre pas la couverture. L'évaluation elle-même :
- modèle d'application, surface d'attaque, OWASP, STRIDE et classification des données, lus par l'outil (`iroh.ts`, `envelope.ts`) et par la revue adverse ;
- aucun constat retenu dans le diff ;
- le seul constat (cache anti-rejeu) est hors du diff, suivi en T4.2d.
