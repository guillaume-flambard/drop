## Why

D50 (niveau 1) et D51 : une information que son propriétaire accepte de partager doit pouvoir être servie telle quelle, sans modèle et sans lui redemander chaque fois. Aujourd'hui toute réponse passe par une capacité ou par une réponse à la main, avec une décision humaine à chaque demande.

Choix de Guillaume le 10 octobre 2026 (« oui aux 8 ») : une entrée de catalogue par fait ; servi sans décision, avec reçu ; public toute l'équipe ou personnes choisies ; énoncé de 1 000 caractères, source en libellé et lien facultatif, fin obligatoire (30 jours par défaut, un an au plus), signé, contrôlé contre les secrets ; sujet et mots-clés pour `ask_team` ; section « Ce que je publie » dans « Mes outils » ; sortie signée sous un schéma fixe, `answeredBy: 'fact'` ; sensibilité basse seulement. Décision D65.

## What Changes

- **Protocole** : `Fact` signé (domaine `drop-fact-v1`), `FACT_OUTPUT_SCHEMA`, identifiant de carte `fact.f<hex>`, champ facultatif `keywords` des cartes, `answeredBy: 'fact'`, transition `proposed → approved` réservée aux faits.
- **Node** : publier, modifier (nouvelle révision signée), retirer ; stockage sous `DROP_HOME` ; catalogue par pair selon le public ; service sans décision avec reçu signé ; refus d'un fait retiré, expiré ou hors public ; vérification de la signature et de la validité chez le demandeur ; `ask_team` sert d'abord un fait dont un mot-clé figure dans la question.
- **Panneau** : « Ce que je publie » dans « Mes outils » : ajouter, modifier, retirer, compteur de service, fait expiré en grisé.
- **MCP demandeur** : « Fait publié par …, valable jusqu'au … ».

## Capabilities

### Modified Capabilities

- `protocol` : fait signé, sortie fixe, carte de fait, reçu, transition.
- `node` : publication, service, public, `ask_team`.
- `owner-app` : « Ce que je publie ».
- `requester-mcp` : présentation d'un fait.

## Non-goals

- Catalogue de sujets entre équipes, boîte de suggestions, invalidation par contradiction : T4.12.
- Petite question sur un contexte déclaré : T4.9.
- Faits de sensibilité haute, pièces jointes, faits publics au-delà des pairs appairés.

## Impact

`packages/protocol`, `packages/node` (moteur, stockage, API, panneau, routage), `packages/requester-mcp`.
