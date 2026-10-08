# 03 — Protocole

Package : `packages/protocol`. Aucune I/O : schémas zod, fonctions pures, crypto. 100 % testé.

## Identité

- Chaque Node a une paire **Ed25519** (`crypto_sign_keypair`). `NodeId` = base64url(clé publique).
- Pour chiffrer, on dérive la paire X25519 (`crypto_sign_ed25519_pk_to_curve25519` / `_sk_`).
- `identity.json` : `{ nodeId, publicKey, secretKey, createdAt, displayName }`, mode fichier 0600.

## Appairage

- `drop invite` produit un code d'invitation : base64url de `{ relayUrl, nodeId, displayName, oneTimeToken, expiresAt }`
  (expiration 15 min).
- `drop pair <code>` envoie `pair_request` (signé, avec le `oneTimeToken`) ; l'invitant valide et répond `pair_accept`.
- Les deux côtés écrivent l'autre dans `peers.json` : `{ nodeId, displayName, ownerKind, pairedAt }`.
- **Un Node rejette toute enveloppe dont l'émetteur n'est pas dans `peers.json`**, sauf `pair_request` avec un token valide.

## Enveloppe (ce que voit le relais)

```ts
const Envelope = z.object({
  v: z.literal(1),
  id: z.string().uuid(),          // UUID v7
  from: NodeId,
  to: NodeId,
  ts: z.number().int(),           // ms epoch
  exp: z.number().int(),          // ms epoch, ≤ ts + 15 min
  nonce: z.string(),              // base64url, 24 octets
  body: z.string(),               // base64url de crypto_box_easy(JSON du message, nonce, pk_to, sk_from)
  sig: z.string(),                // Ed25519 sur canonical({v,id,from,to,ts,exp,nonce,body})
});
```

- Le **type** du message est dans le corps chiffré : le relais ne sait pas si c'est une requête ou un résultat.
- `canonical()` = JSON avec clés triées, sans espaces. Testé avec vecteurs fixes.
- Vérifications à la réception, dans cet ordre, chaque échec ayant un code stable :
  `E_SCHEMA` → `E_SIG` → `E_UNKNOWN_PEER` → `E_EXPIRED` (`exp` passé ou `ts` à plus de 5 min dans le futur) →
  `E_REPLAY` (id déjà vu, cache 30 min) → `E_DECRYPT` → `E_MESSAGE_SCHEMA`.

## Messages (corps déchiffré)

Union discriminée sur `type`. Tous portent `dropId` sauf les messages d'appairage et de catalogue.

| type | De → vers | Champs clés |
| --- | --- | --- |
| `pair_request` / `pair_accept` | nouveau Node ↔ invitant | `oneTimeToken`, `displayName`, `ownerKind` |
| `catalog_request` | demandeur → exécuteur | — |
| `catalog` | exécuteur → demandeur | `cards: CapabilityCard[]` (signées par l'exécuteur) |
| `drop_request` | demandeur → exécuteur | `dropId`, `capabilityId`, `capabilityVersion`, `input` (JSON), `purpose` (≤ 140 car.), `requestedBy` ({ nodeId, displayName, agent: 'claude_code' \| 'codex' \| 'cursor' \| 'other' }) |
| `drop_status` | exécuteur → demandeur | `dropId`, `state` (cycle de vie de 01-architecture) |
| `approval_request` | exécuteur → approbateur | `dropId`, `card` (titre, receives, neverReceives, sensibilité), `inputPreview` (rendu lisible de l'entrée), `purpose`, `requestedBy`, `expiresAt` |
| `approval_decision` | approbateur → exécuteur | `dropId`, `decision: 'allow_once' \| 'deny' \| 'not_now'`, `decidedAt` |
| `review_request` | exécuteur → approbateur | `dropId`, `output` (déjà validé et scanné) |
| `review_decision` | approbateur → exécuteur | `dropId`, `decision: 'send' \| 'discard'`, `redactions?: string[]` (chemins JSON à retirer) |
| `drop_result` | exécuteur → demandeur | `dropId`, `output`, `outputSchemaHash` |
| `drop_error` | exécuteur → demandeur | `dropId`, `code` (`E_DENIED`, `E_NOT_NOW`, `E_EXPIRED`, `E_BUDGET`, `E_OUTPUT_INVALID`, `E_SECRET_DETECTED`, `E_RUNNER`), `message` lisible sans détail interne |
| `receipt` | exécuteur → demandeur et approbateur | voir ci-dessous |

`not_now` est un refus poli : le demandeur reçoit `E_NOT_NOW` et peut redemander plus tard.

## Reçu

```ts
const Receipt = z.object({
  dropId, capabilityId, capabilityVersion,
  requester: NodeId, executor: NodeId, approver: NodeId,
  inputHash: z.string(),          // SHA-256 hex du JSON canonique de l'entrée
  outputHash: z.string().optional(),
  decision: z.enum(['allow_once', 'deny', 'not_now', 'expired']),
  reviewed: z.boolean(),
  toolCalls: z.array(z.object({ name: z.string(), count: z.number().int() })),
  costUsd: z.number().optional(),
  timestamps: z.object({ requested, decided, started, finished, delivered }), // optionnels selon l'issue
  sig: z.string(),                // signature de l'exécuteur
});
```

Aucun contenu d'entrée ou de sortie dans le reçu : seulement des hash.

## Limites

- Taille max d'une enveloppe : 256 Ko. Au-delà : `E_TOO_LARGE`, côté émetteur avant envoi.
- Une capacité déclare sa propre taille max de sortie (ex. 1 500 caractères pour `repo.answer`).

## Critères d'acceptation

- Aller-retour signer → chiffrer → vérifier → déchiffrer testé, y compris chaque code d'erreur dans l'ordre spécifié.
- Vecteurs de test fixes pour `canonical()` et pour la signature.
- Les schémas zod exportent leur JSON Schema (pour les cartes de capacité et le MCP demandeur).
