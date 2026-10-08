# 05 — Node, CLI et consentement

Package : `packages/node`. Binaire `drop`. Un process long (`drop serve`) + des sous-commandes.

## Sous-commandes

| Commande | Effet |
| --- | --- |
| `drop init --name "Guillaume" --kind human --relay wss://…` | Crée `DROP_HOME`, l'identité, la config |
| `drop invite` / `drop pair <code>` | Appairage (voir 03-protocol) |
| `drop peers` | Liste les pairs |
| `drop serve` | Daemon : connexion relais avec reconnexion exponentielle (1 s → 30 s), API locale, UI locale, runner si des capacités sont publiées |
| `drop publish <capability-id> [--approver <nodeId>]` | Publie une capacité du package `capabilities` sur ce Node |
| `drop pending` | Liste les demandes en attente d'approbation (alternative CLI à l'UI) |
| `drop approve <dropId>` / `drop deny <dropId>` / `drop not-now <dropId>` | Décision en CLI |
| `drop receipts [--since 7d]` | Historique |

## API locale (utilisée par `requester-mcp`)

HTTP sur `127.0.0.1:<port>` (défaut 7781), authentifiée par un jeton aléatoire écrit dans `DROP_HOME/local-token`
(0600), en en-tête `Authorization: Bearer`. Refus de toute requête dont l'en-tête `Host` n'est pas `127.0.0.1:<port>`
ou `localhost:<port>` (protection contre le DNS rebinding).

| Route | Effet |
| --- | --- |
| `GET /peers` | Pairs et leur statut de connexion |
| `GET /capabilities` | Catalogue agrégé des pairs (cache 60 s, rafraîchi par `catalog_request`) |
| `POST /drops` | `{ capabilityId, input, purpose, agent }` → `{ dropId }` |
| `GET /drops/:id` | État courant + résultat ou erreur |

## Consentement

Deux surfaces, la même file d'attente :

1. **UI web locale** servie par `drop serve` sur `127.0.0.1` (même jeton, transmis par un lien ouvert localement).
   Page unique, sans framework, qui liste les demandes en attente. Rafraîchissement par SSE.
2. **Notification macOS** via `osascript` (titre : « {Nom} a besoin d'aide », sous-titre : titre de la capacité).
   Clic → ouvre l'UI locale. Sur Linux : pas de notification, CLI `drop pending` suffit.

### Carte de consentement (contenu exact, dans cet ordre)

```text
{requestedBy.displayName} a besoin d'aide            via {agent}
{card.title}
« {inputPreview} »

Pourquoi : {purpose}

{displayName} recevra :            {receives[]}
{displayName} ne recevra jamais :  {neverReceives[]}
Sensibilité haute : vous relirez le résultat avant envoi.   (si high)

Expire dans {mm:ss}

[ Pas maintenant ]   [ Refuser ]   [ Autoriser une fois ]
```

Règles :
- Aucun identifiant technique visible (pas de `nodeId`, pas de nom d'outil, pas d'id de capacité).
- `inputPreview` est un rendu lisible et **échappé** de l'entrée (pas de HTML interprété).
- Le bouton par défaut au clavier est « Pas maintenant », jamais « Autoriser ».
- Expiration par défaut : 10 minutes, puis `E_EXPIRED` envoyé au demandeur.

### Écran de relecture (`sensitivity: 'high'`)

Affiche la sortie champ par champ, avec une case à cocher par champ de premier niveau pour le retirer
(`redactions`). Boutons : « Ne pas envoyer » / « Envoyer ». Le texte long est affiché tel quel, échappé.

## Critères d'acceptation

- `drop serve` se reconnecte seul après coupure du relais.
- Une requête de l'API locale sans jeton, ou avec un `Host` étranger, est refusée (test).
- L'UI échappe une entrée contenant `<script>` (test).
- Un Drop non décidé passe à `expired` à l'échéance et le demandeur reçoit `E_EXPIRED` (test avec horloge simulée).
