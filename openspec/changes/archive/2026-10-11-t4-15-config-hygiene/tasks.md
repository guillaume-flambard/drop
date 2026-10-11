# Tasks

## 1. Tests d'abord

- [x] 1.1 Écrire `config-hygiene.test.ts` : profil par défaut, payeur privé, migration d'un fichier sans profil, modes de `peers.json`/`team.json` (fichier existant et démarrage), `E_QUEUE_FULL`, agents alignés ; constater les quatre échecs attendus.

## 2. Réalisation

- [x] 2.1 Schéma : défaut `private`, `payer` à `owner` si omis en privé, `requester` refusé ; `drop init --profile legacy` et `migrate-private` explicites sur `legacy`.
- [x] 2.2 `writePrivate` resserre un fichier existant par son descripteur ; `peers.json` et `team.json` passent par lui ; `securePrivateFiles()` au démarrage du daemon.
- [x] 2.3 `E_QUEUE_FULL` dans `ERROR_CODES` ; commentaire D21 corrigé.
- [x] 2.4 Tests existants qui construisaient une config `legacy` sans le dire : `profile: 'legacy'` explicite.

## 3. Vérification

- [x] 3.1 Lint, typecheck, tests, OpenSpec strict et openspec-guard (baseline seulement en retrait).
- [x] 3.2 Archiver, passer T4.15 à `done`, consigner la décision dans `docs/DECISIONS.md`.
