## ADDED Requirements

### Requirement: Images de conteneur épinglées par empreinte
Chaque image de base d'un Dockerfile suivi par git SHALL être épinglée par son empreinte `@sha256:`, sauf une étape qui part d'une étape antérieure du même fichier. Chaque dossier qui contient un Dockerfile SHALL figurer dans l'entrée `docker` de `.github/dependabot.yml`.

#### Scenario: AC: images épinglées et surveillées
<!-- openspec-guard:test="container images pinned by digest (T4.26) > pins every base image of every Dockerfile by digest and keeps it under Dependabot" -->
- **WHEN** on lit les Dockerfile du dépôt, dont `scripts/hermes-proof/Dockerfile` et `scripts/private-proof/Dockerfile`
- **THEN** chaque `FROM` porte une empreinte ou nomme une étape antérieure, et Dependabot surveille chacun de leurs dossiers
