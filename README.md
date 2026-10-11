# drop

**La réponse, pas l'accès.** Votre agent pose une question précise à l'environnement d'un collègue. Le collègue autorise une fois. Seule la réponse validée revient.

Promesse (D52) : vos données restent sur votre machine ; seule une réponse que vous avez approuvée en sort, chiffrée, vers la personne qui l'a demandée. Limite : drop contrôle ce qui passe par drop, pas les flux propres d'un connecteur ou d'un modèle que vous choisissez.

`drop` est un nom de code. Le dépôt est privé, sous [Apache-2.0](LICENSE). Rien n'a encore été validé avec de vrais utilisateurs.

## Ce qui existe

- Le profil privé, créé par `drop init` et par l'app : relais interne, destinations réseau explicites, aucun repli cloud. Le propriétaire paie son propre modèle et refuse les clés reçues (T3.1).
- Trois chemins de connexion : réseau local (mDNS), Internet par iroh, relais interne (T4.2, T4.2b). Aucun relais n'est imposé ; entre deux réseaux, iroh demande un relais choisi par l'équipe.
- Treize clients MCP détectés ; sept raccordés automatiquement (Claude Code, Claude Desktop, Cursor, Codex, Gemini CLI, VS Code, Cline), six par une configuration à copier (T3.3, T4.5).
- Une carte de consentement conforme, la relecture champ par champ et l'invitation confirmée (T4.14).
- La réponse à la main du propriétaire (T4.3) et les faits publiés, servis sans modèle (T4.4).
- Le pack entreprise : politique signée appliquée au poste et au relais, image Docker et chart Helm du relais (T4.10).
- L'app Mac de barre de menus, signée et notarisée pour Apple Silicon (T3.4).

## Ce qui reste

- Revues de sécurité des corrections anti-rejeu (T3.1b, T3.1c).
- Recette de l'app sur un Mac neuf, et VoiceOver (T3.4).
- Hygiène de configuration (T4.15).
- Une vraie app sur Windows (T3.7) et Linux (T3.8), tous les agents raccordés automatiquement (T4.22), un seul lien
  pour rejoindre l'équipe en deux clics (T4.23) et un design impeccable (T4.24) (D84).
- Le relais de l'essai sur le VPS, un banc maison à quatre postes, puis le protocole de l'essai (T4.6a, T4.6c, T4.6b).
- La mesure du besoin, sans l'app (T0.7, D24), puis l'essai en binômes de collègues (T4.6, D83).
- Si l'essai inclut le partage par modèle : qualifier un modèle (T3.2) et choisir outils, modèle et approbateur depuis le panneau (T4.16).
- Avant le lancement : preuve privée avec Internet bloqué (T3.5), préparation de la publication (T3.6, T4.13).

L'ordre et les statuts sont dans [docs/TASKS.md](docs/TASKS.md) ; le bilan daté dans [docs/AVANCEMENT.md](docs/AVANCEMENT.md).

## Essayer

Avec Node 22.18 ou plus récent et pnpm 11.27.0 :

```bash
pnpm install --frozen-lockfile
pnpm -r test
pnpm site:preview
```

Les tests n'utilisent aucune clé LLM. La démonstration, le panneau et la ligne de commande sont expliqués dans le guide.

## Lire ensuite

- [Le guide](docs/GUIDE.md) : le parcours, la démonstration, la confidentialité.
- [Le profil privé](docs/PRIVATE_PROFILE.md) : démarrer, et ses limites.
- [Contribuer](CONTRIBUTING.md), avec [SECURITY.md](SECURITY.md) et [AGENTS.md](AGENTS.md).
