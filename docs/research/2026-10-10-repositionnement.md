# Recherches du repositionnement (10 octobre 2026)

Trois recherches web menées pendant le grilling qui a produit D47 à D58. Légende : **[F]** fait sourcé, **[I]** inférence. Plusieurs chiffres viennent d'études financées par des éditeurs ; ils sont signalés. Sources consultées le 10 octobre 2026.

## 1. Douleurs, adoption A2A et concurrents

### Douleurs des organisations multi-agents

- [F] 53 % des organisations ont vu des agents dépasser leurs permissions, 47 % ont eu un incident lié à un agent, 31 % ont une politique de gouvernance formelle. Enquête CSA financée par Zenity, 445 répondants, avril 2026. https://cloudsecurityalliance.org/articles/more-than-half-of-organizations-experience-ai-agent-scope-violations-cloud-security-alliance-study-finds
- [F] Gravitee (éditeur, 750 décideurs UK/US) : 48 % des agents en production non sécurisés, 54 % d'incidents avérés ou suspectés, permissions excessives liées aux comptes de service partagés. https://gravitee.io/state-of-ai-agent-security
- [F] OWASP MCP Top 10 (bêta), MCP01 : jetons mal gérés et fuite de secrets. https://owasp.org/www-project-mcp-top-10/
- [F] IDC : beaucoup d'organisations européennes ne savent pas combien d'agents tournent chez elles ; motifs de souveraineté cités : demandes extraterritoriales, NIS2, DORA, AI Act. https://www.idc.com/resource-center/blog/european-ciso-priorities-in-2026-ai-agents-platformization-and-sovereignty/
- [F] Gartner : plus de 40 % des projets agentiques annulés d'ici fin 2027 (coûts, valeur floue, contrôle des risques). https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027
- [I] Ces études portent surtout sur les grandes entreprises ; aucune donnée solide propre aux PME de 20 à 500 personnes n'a été trouvée.

### A2A

- [F] A2A v1.0, première version stable, mars 2026 ; projet hébergé par l'AAIF depuis le 17 août 2026, avec MCP, goose, AGENTS.md et agentgateway. https://aaif.io/blog/a2a-joins-aaif
- [F] Plus de 150 organisations ; la feuille de route annonce encore interopérabilité, registre et bonnes pratiques de sécurité. https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year
- [F] Analyse indépendante : autorisation à portée limitée, délégation et audit restent ouverts. https://www.glukhov.org/ai-systems/comparisons/a2a-protocol-2026-adoption/

### Concurrents proches

- [F] Glean : serveur MCP managé qui respecte les permissions de chaque utilisateur, SaaS. https://docs.glean.com/administration/platform/mcp/about
- [F] agentgateway (Apache-2.0, AAIF) : passerelle LLM, MCP et A2A avec RBAC et observabilité. https://agentgateway.dev/docs/about/introduction
- [F] Preloop (Apache-2.0) : pare-feu MCP avec approbation humaine par appel ; withHuman et Impri : files d'approbation auto-hébergeables (descriptions des éditeurs). https://preloop.ai/vs/mintmcp , https://mcpservers.org/de/servers/withhuman-ai
- [F] Microsoft Agent 365 et Entra Agent ID : registre d'agents et approbation administrateur. https://blog-en.topedia.com/2026/04/agent-registry-is-moving-from-microsoft-entra-to-agent-365/
- [I] Tous contrôlent un accès : l'agent lit directement la donnée après politique ou approbation. Aucun n'est construit pour que le propriétaire valide le contenu qui sort.

## 2. Connexion

- [F] A2A v1.0 définit JSON-RPC, gRPC et HTTP+JSON au-dessus de HTTP et SSE ; HTTPS obligatoire en production ; aucune mention de pair à pair, de NAT ni de découverte locale ; l'Agent Card se publie à `/.well-known/agent-card.json`. https://a2a-protocol.org/latest/specification/ , https://a2a-protocol.org/latest/topics/agent-discovery/
- [F] iroh 1.0 (15 juin 2026), 1.3.0 (28 septembre 2026), MIT ou Apache-2.0, liaisons Node.js, Swift, Kotlin, Python ; hole punching QUIC avec repli relais, environ 9 cas sur 10 en direct ; relais publics n0 prévus pour le test ; `iroh-relay` et `iroh-dns-server` auto-hébergeables ; mDNS disponible. https://iroh.computer/blog/v1 , https://docs.iroh.computer/concepts/relays , https://docs.iroh.computer/iroh-services/relays/self-hosted , https://docs.iroh.computer/concepts/discovery
- [F] libp2p : hole punching réussi dans 70 % ± 7,1 % des cas sur 4,4 M tentatives. https://arxiv.org/html/2510.27500v1
- [F] Headscale (BSD-3), un seul tailnet ; tsnet s'embarque seulement en Go. https://github.com/juanfont/headscale , https://pkg.go.dev/tailscale.com/tsnet
- [F] NetBird : serveur AGPLv3, auto-hébergement sur VM publique avec IdP. https://docs.netbird.io/selfhosted/selfhosted-quickstart
- [F] ZeroTier : contrôleur dans `nonfree/`. https://github.com/zerotier/ZeroTierOne
- [F] Cloudflare Tunnel : le trafic transite par Cloudflare. https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
- [F] mDNS : aucune infrastructure, limité au lien local. https://www.rfc-editor.org/rfc/rfc6762.html
- [F] Zero trust : NIST SP 800-207 ; identité de workload : SPIFFE/SPIRE. https://csrc.nist.gov/pubs/sp/800/207/final , https://spiffe.io/docs/latest/spiffe-about/overview/
- [I] Une DSI acceptera un relais en binaire, image Docker ou chart Helm, flux sortants TLS sur 443, CA interne, zéro télémétrie, licence permissive. UDP sortant est souvent bloqué : repli TCP/443 nécessaire.

## 3. Interactions et contexte partagé

- [F] A2A : une requête reçoit soit un Message direct, soit une Task avec cycle de vie (états INPUT_REQUIRED, AUTH_REQUIRED, COMPLETED, FAILED, CANCELED, REJECTED) et Artifacts ; AUTH_REQUIRED ne vaut pas autorisation ; l'autorisation reste à l'implémentation. https://a2a-protocol.org/latest/specification/
- [F] OWASP Top 10 for Agentic Applications (décembre 2025) : ASI01 détournement d'objectif, ASI06 empoisonnement de mémoire, ASI07 communication inter-agents non sécurisée, ASI08 défaillances en cascade, ASI09 exploitation de la confiance humaine. https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- [F] OWASP LLM07:2025 : l'autorisation ne doit pas être déléguée au LLM. https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/
- [F] ConVerse (novembre 2025) : jusqu'à 88 % d'attaques de confidentialité réussies en conversation entre agents. https://arxiv.org/abs/2511.05359
- [F] AgentLeak (2026) : 68,8 % de fuite dans les messages entre agents contre 27,2 % dans la sortie finale. https://arxiv.org/abs/2602.11510
- [F] Patrons de défense, dont la minimisation de contexte. https://arxiv.org/abs/2506.08837
- [F] Mem0 CVE-2026-59705 (CVSS 9.3) : lecture et écriture de toute mémoire sans authentification. https://osv.dev/vulnerability/CVE-2026-59705
- [F] MINJA et AgentPoison : empoisonnement de mémoire, plus de 80 % de succès avec moins de 0,1 % d'entrées piégées pour AgentPoison. https://arxiv.org/abs/2503.03704 , https://arxiv.org/abs/2407.12784
- [F] Keyhive (Ink & Switch) : la révocation concurrente reste un problème ouvert. https://www.inkandswitch.com/keyhive/notebook/
- [I] Répondre depuis la session vivante d'un agent expose toute sa fenêtre de contexte ; répondre depuis un contexte déclaré, dans un appel neuf, est la version défendable.

## 4. Clients MCP (configuration)

| Client | Emplacement ou commande | Source |
|---|---|---|
| Claude Code | `claude mcp add` ; `.mcp.json`, `~/.claude.json` | https://code.claude.com/docs/en/mcp |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | https://modelcontextprotocol.io/docs/develop/connect-local-servers |
| Cursor | `.cursor/mcp.json`, `~/.cursor/mcp.json` | https://cursor.com/docs/context/mcp |
| Codex | `codex mcp add` ; `~/.codex/config.toml` | https://learn.chatgpt.com/docs/extend/mcp?surface=cli |
| OpenCode | `opencode.json`, clé `mcp` | https://opencode.ai/docs/mcp-servers/ |
| Gemini CLI | `gemini mcp add` ; `~/.gemini/settings.json` | https://geminicli.com/docs/tools/mcp-server/ |
| Windsurf (Devin Desktop) | `~/.config/devin/mcp_config.json` | https://docs.devin.ai/desktop/cascade/mcp |
| Zed | réglages, clé `context_servers` | https://zed.dev/docs/ai/mcp |
| goose | `goose configure` ; `~/.config/goose/config.yaml` | https://goose-docs.ai/docs/getting-started/using-extensions |
| VS Code Copilot | `.vscode/mcp.json` ; `code --add-mcp` | https://code.visualstudio.com/docs/copilot/customization/mcp-servers |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` | https://docs.cline.bot/mcp/configuring-mcp-servers |
| Roo Code | `mcp_settings.json`, `.roo/mcp.json` | https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo |
| JetBrains AI | Settings > Tools > AI Assistant > MCP | https://www.jetbrains.com/help/ai-assistant/mcp.html |
| ChatGPT | serveurs distants HTTPS seulement | source secondaire : https://hjarni.com/blog/how-to-use-mcp-with-chatgpt |

Ces emplacements sont ceux documentés le 10 octobre 2026 ; T4.5 les revérifie dans la doc de chaque version avant d'écrire un adaptateur.

**Revérification T4.5 (10 octobre 2026, docs officielles et installation locale ; la table ci-dessus reste l'état initial).**

| Client | Global | Projet | Format, clé | Ajout officiel | Installé ici |
|---|---|---|---|---|---|
| Claude Code | `~/.claude.json` (`mcpServers`, et `projects[chemin].mcpServers` pour la portée locale) | `.mcp.json` | JSON, `mcpServers` | `claude mcp add` | oui, 2.1.288 |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | aucun | JSON, `mcpServers` (stdio seulement) | aucun | oui |
| Cursor | `~/.cursor/mcp.json` | `.cursor/mcp.json` | JSON, `mcpServers` | aucun (lien `cursor://` avec confirmation) | oui, sans CLI |
| Codex | `$CODEX_HOME/config.toml` (`~/.codex`) | `.codex/config.toml`, projets de confiance seulement | TOML, `[mcp_servers.<nom>]` | `codex mcp add` (global seulement) | oui, 0.156.1 |
| OpenCode | `~/.config/opencode/opencode.json` ou `.jsonc` | `opencode.json(c)`, `.opencode/opencode.json(c)` | JSONC ; en v2 `mcp.servers.<nom>`, `command` en tableau, `environment` | `opencode mcp add --global`, pas de `remove` | oui, 2.0.26, fichier JSONC commenté |
| Gemini CLI | `~/.gemini/settings.json` (`GEMINI_CLI_HOME`) | `.gemini/settings.json` | JSON, `mcpServers` | `gemini mcp add -s user` / `remove` (portée projet par défaut) | non (dossier présent pour Antigravity) |
| Devin Desktop (ex-Windsurf) | `~/.config/devin/mcp_config.json` ; la FAQ cite encore `~/.codeium/windsurf/` | `.devin/mcp_config.json` (CLI) | JSON, `mcpServers` | `devin mcp add` (CLI Devin) | non |
| Zed | `~/.config/zed/settings.json` | `.zed/settings.json`, après confiance du dossier | JSONC, `context_servers` | aucun | non (dossier présent) |
| goose | `~/.config/goose/config.yaml` | aucun | YAML, `extensions.<id>` avec `cmd`, `args`, `envs`, `uri` | `goose configure`, interactif | non |
| VS Code (Copilot) | `~/Library/Application Support/Code/User/mcp.json` (profil) | `.vscode/mcp.json`, `.mcp.json` | JSONC, `servers` | `code --add-mcp` (profil, pas de retrait) | oui, 1.141.0 |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` (`CLINE_MCP_SETTINGS_PATH`) | aucun | JSON, `mcpServers` | `cline mcp add` | non |
| Roo Code | `globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` | `.roo/mcp.json` | JSON, `mcpServers` | aucun ; **projet archivé le 15 mai 2026** | non |
| JetBrains AI | interface seulement (Settings, Tools, AI Assistant, Model Context Protocol), import depuis Claude Desktop ; Junie : `~/.junie/mcp/mcp.json` | Junie : `.junie/mcp/mcp.json` | JSON, `mcpServers` | aucun | non |

Sources : https://code.claude.com/docs/en/mcp, https://modelcontextprotocol.io/docs/develop/connect-local-servers, https://cursor.com/docs/context/mcp, https://learn.chatgpt.com/docs/extend/mcp?surface=cli, https://opencode.ai/v2/docs/mcp-servers/, https://geminicli.com/docs/tools/mcp-server/, https://docs.devin.ai/desktop/cascade/mcp, https://zed.dev/docs/ai/mcp, https://goose-docs.ai/docs/guides/config-files, https://code.visualstudio.com/docs/copilot/customization/mcp-servers, https://docs.cline.bot/mcp/mcp-overview.md, https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo, https://www.jetbrains.com/help/ai-assistant/mcp.html, https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html. Un dossier de configuration seul ne prouve pas qu'un client est installé : ceux de Zed, goose, Devin et Gemini existent ici sans l'application.

## 5. Capacité de simulation (mesures locales)

- [F] VPS lab : 8 cœurs, 16 Go, environ 70 conteneurs, 7,2 Gio disponibles et 5,6 Gio de swap occupés sur 8 lors de la mesure ; inadapté à la simulation. Mac : 10 cœurs, 16 Go, environ 7 Go libres.
- [F] Un Node v24 vide occupe 44 Mo de RSS, 67 Mo avec libsodium et zod chargés.
- [I] Un nœud drop complet avec faux agent : 130 à 180 Mo ; 50 nœuds en processus séparés tiennent sur le Mac, 500 exigent des nœuds virtuels regroupés dans un processus, à mesurer en T4.1.
- [F] Modèles gratuits : passerelle LiteLLM du lab (`lab-infra`, `stacks/litellm/config.yaml`), chaînes `lab-fast` (Groq Qwen3.8 27B, puis Gemini Flash-Lite, GLM 4.7 Flash, OVH) et `lab-agent` (Nemotron Ultra 550B gratuit, puis Kimi K3, GLM 5.3, DeepSeek V3.1, Devstral, gpt-oss-120b) ; le quota gratuit de Groq ne tient pas les rafales.
