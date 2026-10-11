## Why

D54 : une entreprise doit pouvoir imposer, par MDM, une politique signée (clients autorisés, fournisseurs de modèles, relais interne obligatoire, passerelles interdites), appliquée par le poste et revérifiée par le relais, et héberger ce relais elle-même (image Docker, chart Helm, TLS sur 443). Choix de Guillaume le 11 octobre 2026 (« oui aux 6 ») ; décision D81. Le binaire autonome du relais est découpé en T4.10b : Node 24 ne fait des exécutables uniques qu'en CommonJS, en fonctionnalité expérimentale, avec la dépendance `postject` (doc Node v24, « Single executable applications »).

## What Changes

- **protocol** : politique d'entreprise signée (Ed25519, domaine `drop-policy-v1|`), schéma, signature, vérification, empreinte.
- **node** : la politique, déposée par l'informatique dans un dossier système avec la clé de l'émetteur, est lue au démarrage ; invalide ou expirée, le daemon refuse de démarrer (`E_POLICY`). Elle borne le relais, les clients proposés au raccordement, les fournisseurs de modèles, les passerelles et le mode Internet ; l'empreinte est présentée au relais ; l'état affiche la politique en vigueur.
- **relay** : avec une politique dans sa config, le relais la vérifie au démarrage et refuse un nœud qui ne présente pas son empreinte ; TLS natif facultatif ; image Docker dédiée ; chart Helm.

## Capabilities

### Modified Capabilities

- `protocol`, `node`, `relay`, `deploy-mac-vps`.

## Non-goals

- Binaire autonome du relais (T4.10b).
- Console de politiques, SSO, export d'audit (hypothèse H6 du PRD).
- Identifier de façon fiable le client qui appelle l'API locale : la liste des clients s'applique au raccordement.

## Impact

`packages/protocol/src/policy.ts`, `packages/node` (politique, daemon, API, onboarding, capacités), `packages/capabilities` (garde du modèle), `packages/relay` (auth, TLS), `docker/relay.Dockerfile`, `deploy/helm/drop-relay`.
