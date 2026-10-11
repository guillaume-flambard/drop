## 1. Documentation d'abord

- [x] 1.1 Emplacements, formats et signes d'installation des treize clients sur macOS, Windows et Linux, sources datées : `docs/research/2026-10-11-clients-par-systeme.md`.
- [x] 1.2 API de `jsonc-parser` 3.3.1 et `yaml` 2.9.1 lues dans les paquets installés ; page `child_process` de Node pour les scripts `.cmd`.
- [x] 1.3 D85 dans `docs/DECISIONS.md` (dépendances et arbitrages).

## 2. Tests d'abord

- [x] 2.1 Édition en place : JSONC commenté, BOM, CRLF, tabulations, fichier absent, refus, YAML de goose (`config-edit.test.ts`).
- [x] 2.2 Raccordement des onze clients par fichier sur chacun des trois systèmes simulés, idempotence, retrait rendant le fichier d'origine (`clients-auto.test.ts`).
- [x] 2.3 Fichier modifié, autre entrée drop, fichier créé, ajout tiers, Claude Desktop Store, commande officielle non bloquante, script `.cmd`, secours.
- [x] 2.4 Installation et variables par système.
- [x] 2.5 Panneau : plus de « à la main » pour un client automatique.

## 3. Réalisation

- [x] 3.1 `packages/capabilities` : hôte, chemins et installation par système.
- [x] 3.2 `packages/node` : édition en place, entrées par mise en page, raccordement, commande officielle sous Windows, secours, sauvegardes par fichier.
- [x] 3.3 CLI (`drop install`, aide), panneau, bundle.
- [x] 3.4 `docs/ONBOARDING.md`, `README.md`, `docs/GUIDE.md`, `docs/AVANCEMENT.md`.

## 4. Vérification

- [x] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --all --strict`, openspec-guard.
- [x] 4.2 Lecture seule sur ce Mac (aperçu et `drop detect` du bundle) ; aucune écriture réelle.

Reste hors de cette change : la recette sur de vrais PC Windows 10 et 11 et sur Linux, au banc maison (T4.6c).
