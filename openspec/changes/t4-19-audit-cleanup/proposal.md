# Proposal

## Why

Guillaume demande le 11 octobre 2026 de tout ramener sur `main`, de relire le code, de remettre docs, site et index
en vérité, de vérifier l'alignement avec l'essai et le lancement, de simplifier le code et de donner une note
d'avancement compréhensible.

## What Changes

- Inventaire des branches : tout est sur `main` sauf la PR #25 (Helm en CI, verte) et la branche obsolète
  `codex/t3-1b-final-review`, dont le contenu est déjà sur `main` sous d'autres commits (la fusionner créerait des
  conflits et du code en double).
- Revue de tout le code avec les règles d'open-code-review d'Alibaba (v1.12.13, mode délégation : l'outil choisit
  les fichiers et les règles, des agents relisent), puis corrections de chaque défaut trouvé, avec un test écrit
  d'abord.
- Simplifications sans changement de comportement : code mort retiré, doublons extraits, nombres magiques nommés.
- Docs et site remis en accord avec le code et l'index.
- `docs/TASKS.md` réordonné selon le cap de l'essai (D82), deux lignes ajoutées pour l'essai (T4.6a, T4.6b), deux
  pour la dette restante (T4.20, T4.21).

## Capabilities

### New Capabilities
Aucune.

### Modified Capabilities
`relay` (refus d'une destination non admise ou d'une durée de vie trop longue, file bornée, chemins relatifs au
fichier de configuration, fichiers en 0600 même existants), `node` (refus définitif du relais traité tout de suite),
`requester-mcp` (description de `request_drop` et entrée `owner_node_id` alignées sur le code). Ces trois specs ont
été modifiées directement dans `openspec/specs/`, sans delta : écart assumé au processus, la change étant une
correction de revue et non une fonction nouvelle.

## Impact

Code de tous les paquets sauf `gateway`, scripts, app Mac, CI, docs et site. Aucune dépendance ajoutée. Aucune
action externe : rien n'est fusionné, publié ni supprimé sans l'accord de Guillaume.

## Non-goals

Découper `NodeEngine` ou le script du panneau (T4.21), relier les 143 scénarios déjà testés à leurs tests (T4.20),
republier le site en ligne, supprimer des branches.
