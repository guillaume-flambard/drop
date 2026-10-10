## 1. Tests d'abord

- [x] 1.1 Protocole : schéma, limites et signature d'un fait, sortie fixe, carte de fait, transition.
- [x] 1.2 Moteur : publier, modifier, retirer ; catalogue selon le public ; service sans décision avec reçu ; refus retiré, expiré, hors public ; vérification chez le demandeur ; `ask_team`.
- [x] 1.3 API et panneau : « Ce que je publie ».
- [x] 1.4 MCP : présentation d'un fait.

## 2. Réalisation

- [x] 2.1 `packages/protocol` : `fact.ts`, `keywords` des cartes, `answeredBy: 'fact'`, transition.
- [x] 2.2 `packages/node` : stockage, moteur, routage, API.
- [x] 2.3 Panneau.
- [x] 2.4 `packages/requester-mcp`.
- [x] 2.5 Recette réelle : deux nœuds, fait publié, servi, retiré, expiré.

## 3. Vérification

- [x] 3.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --all --strict`, openspec-guard.
- [x] 3.2 Revue adverse, `/review` et `/cso`.
- [x] 3.3 Correctifs de la revue : écriture sans attente entre lecture et sauvegarde, revérification après attente, débit par pair, empreinte de fait réservée aux cartes de fait, routage sur des termes d'au moins trois lettres et des faits en ligne, lien sans identifiants, mots-clés distincts, caractères invisibles refusés, stockage illisible sans effet sur le catalogue, aucune clé plafonnée pour un fait, durée gardée à la modification.
