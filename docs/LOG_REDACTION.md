# Expurgation des journaux

Règle unique de T4.37 pour tout ce que drop écrit dans `DROP_HOME/logs/` : le Node (`packages/node/src/logs.ts`,
`redactText`) et la coque (`apps/desktop/src-tauri/src/main.rs`, `redact_stray`) l'appliquent tous deux, et les deux
passent les mêmes vecteurs (`test/fixtures/log-redaction-vectors.json`). Principe : **masquer par défaut** dans le texte
libre. On perd parfois une information utile ; on ne garde jamais un morceau de secret. La revue du propriétaire avant
tout envoi reste obligatoire : aucune règle ne reconnaît tout.

## Règles, dans l'ordre

1. **Valeurs connues.** Le jeton local, et pour le Node les valeurs des variables d'environnement au nom de secret
   (8 caractères ou plus), sont remplacés par `[expurgé]` partout. Le Node écrit aussi le dossier personnel `~`.
2. **En-tête de clé.** Une ligne qui contient `PRIVATE KEY` est remplacée en entier.
3. **Identifiants d'URL.** De `://` jusqu'au **dernier** `@` avant le prochain blanc ou guillemet, tout est remplacé :
   `https://[expurgé]@hôte/…`. Un `/`, un `@` ou un `:` dans le mot de passe ne coupent rien.
4. **Schémas d'authentification.** Le mot qui suit `Bearer` ou `Basic` est remplacé.
5. **Noms de secret.** Un nom (lettres, chiffres, `_`, `.`, `-`) qui contient `pass`, `secret`, `token`, `key`, `auth`,
   `cred` ou `seed`, quelle que soit la casse, entre guillemets (`"`, `'`), guillemets échappés (`\"`, `\'`) ou sans,
   suivi d'espaces quelconques, de `=` ou `:`, d'espaces quelconques puis d'une valeur : la valeur entière est
   remplacée, jusqu'au guillemet fermant de même forme, ou sinon jusqu'au prochain blanc ou à `, ; } & ) ] " ' \`.
   Une valeur `Bearer` ou `Basic` reste : la règle 4 a déjà remplacé ce qui suit. Un `=` disparaît avec la valeur (`NAME [expurgé]`), pour que la ligne ne se lise plus comme une affectation ; un `:`
   et les guillemets restent.
6. **Suites hexadécimales coupées.** Des groupes hexadécimaux séparés par `:`, `-` ou une espace, qui totalisent au
   moins 32 chiffres hexadécimaux dont au moins un chiffre décimal, sont remplacés en entier.
7. **Suites de caractères de clé.** Toute suite d'au moins 16 caractères de l'alphabet base64, base64url et
   hexadécimal (`A-Z a-z 0-9 + / = _ -`) qui mêle lettres et chiffres, ou qui compte au moins 32 chiffres
   hexadécimaux, est remplacée en entier, y compris dans un chemin : `/tmp/<clé>/drop.log` devient `[expurgé].log`.

## Ce que les règles 6 et 7 laissent passer

Liste fermée, protégée avant ces deux règles, parce que drop en a besoin pour diagnostiquer :

- les UUID au format `8-4-4-4-12` hexadécimal, quelle que soit leur version (identifiants de demande `dropId`, en
  UUIDv7) ;
- les codes d'erreur stables `E_…` (lettres capitales, chiffres, `_`), dont ceux de `ERROR_CODES`
  (`packages/protocol/src/errors.ts`) ;
- les versions (`0.1.0`, `24.21.0`, `27.0.0`) et les dates ISO 8601 : le `.` et le `:` les coupent en morceaux trop
  courts pour la règle 7, sans protection particulière.

Tout le reste qui ressemble à une clé est masqué, identifiants de Node compris. Le Node remplace par
`[expurgé #<8 hex HMAC-SHA-256>]` (même valeur, même empreinte pendant le processus, pour suivre un pair d'une ligne à l'autre ; secret aléatoire en mémoire, non conservé) ; la coque, sans
fonction de hachage, par `[expurgé]`.

## Au-delà de cette règle, dans le Node seulement

- Une ligne JSON est expurgée champ par champ : la valeur d'une clé dont le nom contient l'un des mots de la règle 5,
  ou `cookie`, `session`, `invite`, `bearer`, est remplacée, puis chaque valeur texte passe par les règles ci-dessus.
- Une ligne que le scanner de secrets du runner reconnaît encore, motifs connus (`sk-`, `ghp_`, `AKIA`, JWT, PEM,
  affectation) ou suite hexadécimale de 32 chiffres, est remplacée en entier par `log_line_redacted`. La règle
  d'entropie du scanner ne s'applique pas aux journaux : la règle 7 la remplace, et elle masquerait les chemins.
- Le diagnostic réapplique tout, écrit `\uXXXX` les caractères de contrôle et bidirectionnels, et retire les lignes
  encore suspectes.
