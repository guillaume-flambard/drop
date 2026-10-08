# 04 — Relais

Package : `packages/relay`. Tourne sur le VPS derrière Caddy (TLS). Volontairement bête.

## Comportement

1. Un Node ouvre `wss://<relay>/v1`. Le relais envoie `{ challenge: <32 octets base64url> }`.
2. Le Node répond `{ nodeId, sig }` où `sig` = Ed25519(challenge). Le relais vérifie, puis vérifie que `nodeId` est
   dans `allowedNodeIds` (fichier de config). Sinon fermeture code 4401.
3. Ensuite, le Node envoie des enveloppes. Le relais valide **seulement** le schéma `Envelope` et la taille, vérifie
   que `from` = le `nodeId` authentifié sur cette connexion (sinon 4403), puis :
   - si `to` est connecté : transmet ;
   - sinon : met en file (max 100 enveloppes par destinataire, purgées à `exp`) et livre à la reconnexion.
4. Le relais ne déchiffre rien, ne logue jamais `body`, logue `id`, `from`, `to`, taille, issue.

## Robustesse

- Ping toutes les 25 s, déconnexion après 2 pings sans réponse.
- Limite : 60 enveloppes/minute par Node (au-delà : enveloppe rejetée avec `{ error: 'E_RATE' }`).
- Redémarrage = perte de la file, assumé en v1.

## Config

`relay.config.json` : `{ port, allowedNodeIds: string[], maxQueuePerNode, rateLimitPerMinute }`.
Commande d'ajout : `drop relay allow <nodeId>` (édite le fichier, nécessite un redémarrage en v1).

## Critères d'acceptation

- Test d'intégration avec deux Nodes en mémoire : livraison directe, livraison différée après reconnexion, rejet
  d'usurpation de `from`, rejet d'un Node non autorisé, rate limit.
- Aucun champ `body` dans les logs (test qui inspecte la sortie de log).
