## Decisions

- **Inscription retardée pour un inconnu.** Un pair connu suit l'ordre actuel : à l'étape `E_REPLAY`, son identifiant est vérifié et retenu d'un seul pas. Pour un inconnu, l'étape ne fait que lire : un identifiant déjà retenu donne `E_REPLAY`, sinon on poursuit. L'identifiant n'est retenu qu'après la dernière étape, quand la demande d'appairage (jeton d'invitation vivant) ou de liaison (session en attente) est acceptée. Si deux copies passent en même temps, la seconde trouve l'identifiant retenu et reçoit `E_REPLAY`.
- **Liaison à usage unique (revue adverse).** La passerelle acceptait une liaison pour toute session vivante, même déjà liée ou refusée : un nœud qui ouvre lui-même ses sessions (l'enregistrement OAuth est ouvert) pouvait encore remplir le cache. Une session se revendique désormais une seule fois (`claimLink`), au premier `link_grant`, accepté ou non. Une liaison ne peut donc pas être rejouée et n'a plus besoin du cache : un inconnu n'y occupe aucune place à la passerelle.
- **Ordre inchangé.** `E_SCHEMA` → `E_SIG` → `E_UNKNOWN_PEER` → `E_EXPIRED` → `E_REPLAY` → `E_DECRYPT` → `E_MESSAGE_SCHEMA`, puis le contrôle d'appairage existant. Un inconnu sans jeton valide reçoit `E_UNKNOWN_PEER`, comme avant, et n'occupe plus aucune place.
- **Purge bornée.** Les entrées sont rangées par ordre d'insertion et leur échéance croît avec l'heure ; la purge s'arrête à la première entrée encore valide. La lecture d'une entrée vérifie son échéance : une entrée périmée restée en place, si l'heure a reculé, ne compte jamais comme déjà vue. Si l'heure a sauté en avant puis est revenue, une entrée lointaine bloquerait la purge : un cache plein est donc balayé en entier une fois avant tout refus (revue adverse).

## Risks

- Un inconnu pendant une invitation coûte encore une vérification de signature et un déchiffrement par enveloppe : c'est borné par le relais (admission, débit) et, sur iroh, par le budget de T4.2b.
