## 1. Tests d'abord

- [x] 1.1 Protocole : un inconnu sans jeton n'occupe aucune place ; une demande acceptée est retenue et sa copie refusée.
- [x] 1.2 Node : pendant une invitation, des enveloppes d'inconnus laissent le cache vide et un pair passe.
- [x] 1.3 Passerelle : des enveloppes sans session valide laissent le cache vide ; une liaison valide est retenue.
- [x] 1.4 Purge : arrêt à la première entrée valide, entrée périmée jamais comptée comme vue.

## 2. Réalisation

- [x] 2.1 `ReplayCache.seen`, purge bornée, `size`.
- [x] 2.2 `openEnvelope` : inscription retardée pour un inconnu.
- [x] 2.3 `memoryStats` du Node et de la passerelle.

## 3. Vérification

- [x] 3.1 lint, typecheck, test, `openspec validate --strict`, openspec-guard.
- [x] 3.2 Revue adverse, `/cso`.
