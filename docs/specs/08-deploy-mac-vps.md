# 08 — Déploiement de test : Mac + VPS

## Cible

| Machine | Process | Rôle |
| --- | --- | --- |
| VPS | `drop-relay` | Relais derrière Caddy, `wss://relay.<domaine>/v1` |
| VPS | `drop-node` (`DROP_HOME=/var/lib/drop`) | Exécuteur de `production.error_summary`, propriétaire `machine` |
| Mac | `drop serve` (`DROP_HOME=~/.drop`) | Guillaume : demandeur + approbateur des capacités du VPS |
| Mac | `drop serve` (`DROP_HOME=~/.drop-julie`, autre port) | « Julie » simulée : exécuteur de `repo.answer` sur un repo de test |
| Mac | `requester-mcp` | Lancé par Claude Code / Codex |

## VPS

- Utilisateur système `drop`, sans shell, membre du seul groupe qui lit les journaux visés (`systemd-journal` ou `adm`
  selon la distribution ; pour Docker, documenter l'option choisie dans `docs/DECISIONS.md`, l'accès au socket Docker
  équivalant à root).
- `deploy/vps/drop-relay.service` et `deploy/vps/drop-node.service` : `User=drop`, `NoNewPrivileges=yes`,
  `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `ReadWritePaths=/var/lib/drop`.
- `deploy/vps/Caddyfile.example` : reverse proxy `relay.<domaine>` → `localhost:<port>`.
- Le Node VPS **n'a pas besoin de clé API** : `production.error_summary` est déterministe.
- Aucun port ouvert hors 443 (Caddy).

## Mac

- Deux `DROP_HOME` pour simuler deux personnes. Seule « Julie » a `ANTHROPIC_API_KEY` dans son environnement.
- `requester-mcp` pointe vers l'API locale du Node de Guillaume (`DROP_LOCAL_URL`, `DROP_LOCAL_TOKEN_FILE`).

## Scénario de démo (critère de fin de l'étape 1)

1. Dans Claude Code sur le Mac : « La prod de {service} va bien ? » → l'agent appelle `list_capabilities`, propose
   `production.error_summary`, l'utilisateur accepte, `request_drop`.
2. Notification sur le Mac, carte de consentement, « Autoriser une fois ».
3. Le VPS exécute, l'agent reçoit `status` et `topErrors`, et continue.
4. « Est-ce que l'implémentation de Julie gère déjà le mode sombre ? » → `repo.answer` → carte chez « Julie » →
   relecture → envoi → réponse avec noms de fichiers, sans code.
5. `drop receipts` montre les deux reçus des deux côtés.
6. Le test des 30 secondes : montrer les étapes 1 à 3 à quelqu'un sans prononcer « MCP ».
