# Tasks

## 1. Contrat

- [ ] 1.1 Écrire la delta `openspec/changes/t4-6a-trial-connectivity/specs/relay/spec.md` : la sonde porte l'identité de build, et un build sans identité répond quand même.
- [ ] 1.2 Écrire la delta `specs/deploy-mac-vps/spec.md` : retrait des exigences `deploy/vps/*.service` et `Caddyfile.example` (D22, fichiers jamais en git), ajout des deux exigences du relais de l'essai.
- [ ] 1.3 Vérifier `npx --yes openspec validate t4-6a-trial-connectivity --strict`.

## 2. Code du relais (tests d'abord)

- [ ] 2.1 Écrire le test de `GET /health` qui exige le compte de connexions et une identité de build non vide, en échec avant le code.
- [ ] 2.2 Écrire le test du build sans identité : `GET /health` répond toujours en 200 avec la valeur explicite d'absence.
- [ ] 2.3 Passer l'identité de build à la construction de l'image (`Dockerfile` racine, qui est celui que la CI construit) et la faire lire par la sonde.
- [ ] 2.4 Faire passer les deux tests.

## 3. Documentation

- [ ] 3.1 Mettre à jour `docs/deploiement-lab.md` : « Vérifier l'état » dit comment lire l'identité de build et ce qu'elle prouve.
- [ ] 3.2 Ajouter D91 à `docs/DECISIONS.md` : identité de build par la construction, repointage GHCR décidé par Guillaume, retrait des exigences Caddy/systemd, `revokedPath` sur le volume persistant.
- [ ] 3.3 Passer T4.6a à `doing` dans `docs/TASKS.md`.

## 4. lab-infra (dépôt voisin, PR distincte)

- [ ] 4.1 Ouvrir un worktree de lab-infra sur une branche nommée d'après la décision, jamais sur `main`.
- [ ] 4.2 Corriger `stacks/drop/compose.yml` : `ghcr.io/guillaume-flambard/drop:latest` pour `drop-relay` et `drop-node`, conformément à ce que le dépôt IaC déclare déjà.
- [ ] 4.3 Ajouter `"revokedPath": "/var/lib/drop-relay/revoked.json"` à `stacks/drop/relay.config.json`, même volume que `admittedPath`.
- [ ] 4.4 Pousser la branche et ouvrir la PR, sans la fusionner ni déclencher de déploiement à la main.

## 5. Vérification

- [ ] 5.1 `pnpm -r lint`
- [ ] 5.2 `pnpm -r typecheck`
- [ ] 5.3 `pnpm -r test`
- [ ] 5.4 `npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail`, avec les globs `--tests` qui excluent les worktrees de `.claude/`, puis `--update-baseline` : le diff de la baseline ne contient que des retraits.
- [ ] 5.5 `/review` (gstack) sur le diff.
- [ ] 5.6 `/cso` (gstack), la change touchant `relay`.
