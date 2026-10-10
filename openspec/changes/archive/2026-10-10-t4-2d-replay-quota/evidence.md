# Preuves T4.2d

| Critère | Preuve |
|---|---|
| Un inconnu ne remplit pas le cache | Test « replay quota (T4.2d) > keeps unknown senders out of the replay cache until their pairing is accepted ». Avec un cache de 8 places, 20 enveloppes d'un inconnu et une demande au mauvais jeton reçoivent `E_UNKNOWN_PEER` sans être retenues (avant le correctif : `E_REPLAY`). Le pair passe, la demande d'appairage valide est retenue puis refusée si elle revient, deux copies simultanées ne passent qu'une fois. Côté Node (test complémentaire) : 25 enveloppes d'un inconnu pendant une invitation laissent le cache vide, l'appairage réel y entre. |
| Passerelle disponible | Test « … > keeps the gateway replay cache empty for envelopes without a pending session ». 30 enveloppes sans session, 10 liaisons répétées sur une session, une liaison valide envoyée deux fois : cache vide, une session revendiquée une fois, liaison accordée une fois. `OAuthServer.claimLink` testé directement. |
| Purge bornée | Test « … > purges only up to the first live entry and never counts an expired one as seen ». Arrêt à la première entrée valide, entrée périmée jamais vue, horloge revenue en arrière, saut en avant puis retour avec balayage complet du cache plein. |

Vérification : lint, typecheck, 61 fichiers et 500 tests, `openspec validate --strict`, openspec-guard.

## Mutation

13 protections retirées une à une sur deux tours. Au second tour, après les correctifs de la revue, 8 sur 8 sont tuées : inscription immédiate pour un inconnu, inscription d'une liaison, inscription retirée, lecture sans échéance, purge complète, balayage du cache plein, revendication de session (deux). Le premier tour avait trouvé une purge non observée (assertion ajoutée) et un mutant équivalent : la réinsertion sur place, qui change seulement l'ordre de purge, jamais ce qui compte comme vu.

## Revue

Revue adverse indépendante, deux défauts corrigés avec test :
1. Une session ouverte par l'attaquant lui-même restait acceptée 10 min, même liée ou refusée : liaison à usage unique (`claimLink`), qui n'a plus besoin du cache.
2. Un saut d'horloge en avant puis un retour pouvait bloquer la purge jusqu'à remplir le cache : balayage complet avant de refuser un cache plein.
Documenté : `acceptLinkSession` doit revendiquer la session ; `acceptPairToken` reste sans effet de bord.

## /cso

Run `1791666905165-eaf454599b2ea4e1`, statut `partial`. La soumission de couverture a été refusée (« gaps must be an array ») et la clôture, lancée dans la même commande, a fermé le run avant correction : le rapport de l'outil n'enregistre pas la couverture. L'évaluation, menée en lisant les fichiers par l'outil puis en reprenant chaque attaque l'une après l'autre (sans relancer d'agent indépendant), ne retient aucun constat :
- un appairage exige le jeton d'invitation, consommé dès l'appairage ;
- revendiquer une liaison suppose de connaître la session, qui ne passe que par le navigateur et l'app de l'utilisateur ;
- une session volée peut seulement être consommée.
