# Design : CI plus rapide sans retirer de contrôle

## Context

Voir proposal.md, section Why, pour les mesures de départ. La CI fait tourner la même suite sur Linux, macOS et
Windows, et les trois jobs sont des checks obligatoires de la règle de branche `main` (`test`, `test-windows`,
`test-macos`, avec branche à jour exigée). Les noms des jobs ne changent pas.

## Decisions

### Cache Cargo par système, clé sur notre crate

- Chemins : `crates/drop-iroh/target` et le registre Cargo (`~/.cargo/registry/index`, `~/.cargo/registry/cache`,
  `~/.cargo/git/db`). Le registre évite de retélécharger les crates ; `target` évite de les recompiler.
- Clé : `drop-iroh-<os>-<hash de Cargo.lock, Cargo.toml, src/**>`. Clé de repli : `drop-iroh-<os>-`. Quand seul
  `src/` change, le cache précédent est restauré : Cargo ne recompile que notre crate, les dépendances restent.
- Un cache par système, puisque les binaires diffèrent. La taille locale de `target/` est de 555 Mo, dans la limite
  de 10 Go par dépôt de GitHub pour trois systèmes.
- Choix écarté : `Swatinem/rust-cache`. C'est une action tierce de plus à épingler et à auditer, alors que
  `actions/cache` suffit pour un seul crate.

### Typecheck incrémental, et pas de cache eslint

- `tsc --incremental` suit lui-même le graphe des dépendances entre fichiers : une erreur dans un fichier causée par
  un changement dans un autre est toujours signalée. Vérifié à la main (tâche 2.2) et à chaque run par le test
  « Échec propagé ».
- Le fichier d'état vit sous `node_modules/.cache/drop/`, ignoré par git, Prettier et eslint, et présent sur les
  trois systèmes.
- Prettier se met en cache par contenu (`--cache-strategy content`), pas par date de modification, puisque le
  checkout remet les dates à zéro.
- eslint n'est pas mis en cache : les règles typées (`no-floating-promises`, `no-unsafe-*`) dépendent des types
  d'autres fichiers, et le cache d'eslint ne compare que le fichier lui-même.

## Risks / Trade-offs

- **Un cache Cargo périmé** ne peut pas masquer un changement : la clé suit nos sources, et Cargo recompile tout ce
  dont les entrées ont changé.
- **Le premier run d'une PR qui touche le crate** reste lent (cache froid pour cette clé, repli sur les
  dépendances).
- **L'éviction du cache** par GitHub (7 jours sans accès, ou 10 Go dépassés) ramène au coût d'aujourd'hui, sans
  rien casser.

## Measurements

Avant : run 38185292252, voir proposal.md. Après : rempli en tâche 4 avec les runs de la PR.
