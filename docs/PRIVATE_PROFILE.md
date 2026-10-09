# Installer un profil privé

T3.1 fournit le runtime privé. Le raccordement groupé, les vrais modèles qualifiés et la distribution Mac signée restent dans T3.2 à T3.5.

## Frontière prise en charge

Le profil privé accepte une liste d’origines exactes (`schéma://IP:port`). Adresses acceptées : IPv4 loopback, 10/8, 172.16/12, 192.168/16, IPv6 `::1` et ULA. Pas de DNS, pas de `localhost`, de redirection, de proxy implicite ni de destination secondaire A2A différente de l’origine configurée. Les adresses de métadonnées cloud et les adresses publiques sont refusées. Utiliser les formes canoniques sans chemin ni port par défaut explicite dans la liste.

Le modèle et les serveurs MCP HTTP utilisent cette politique, y compris ceux référencés dans les fichiers des agents. Une requête A2A utilise la même origine pour la carte et les appels. Le relais est lui aussi validé. Une panne ne change pas de fournisseur. Le modèle doit être nommé explicitement ; l’URL Ollama locale proposée ne télécharge aucun poids.

Les serveurs MCP stdio, y compris ceux détectés chez un agent, sont refusés dans ce profil : leurs propres connexions ne sont pas contrôlées par le transport de drop. Les lecteurs de logs docker/journald sont également refusés ; une source fichier locale reste possible. Le connecteur **demandeur MCP stdio** reste pris en charge : il parle seulement à l’API locale. La limitation porte sur les processus source lancés par le propriétaire.

Le client doit aussi isoler les services internes (MCP, modèle, agent A2A) par son pare-feu ou son réseau de conteneurs. Un service autorisé peut lui-même accéder à d’autres systèmes : drop ne contrôle pas ses outils internes. Pour le test sur un laptop, `--network none` laisse fonctionner le loopback et interdit Internet. Pour plusieurs postes, utiliser un réseau interne/VPN administré, TLS en `wss` et HTTPS avec certificats valides pour les IP choisies. Aucun contournement de validation TLS.

## Démarrage local

Depuis un clone dont les dépendances sont installées, Node 22.18+ et pnpm (OpenSSL est également nécessaire pour le test TLS de la suite de développement) :

```bash
node packages/node/src/cli.ts init --name Alice --relay ws://127.0.0.1:7780/v1
```

Le Node affiche son identifiant public. Créer un fichier `relay.config.json` privé avec cet identifiant (remplacer la valeur ci-dessous) :

```json
{
  "port": 7780,
  "host": "127.0.0.1",
  "allowedNodeIds": ["IDENTIFIANT_PUBLIC_AFFICHE_PAR_INIT"],
  "revokedNodeIds": [],
  "admittedPath": "admitted.json"
}
```

```bash
chmod 600 relay.config.json
node packages/relay/src/cli.ts serve --config=relay.config.json
```

Dans un autre terminal :

```bash
node packages/node/src/cli.ts serve
```

Le daemon occupe ce terminal. Dans un troisième terminal, créer une invitation :

```bash
node packages/node/src/cli.ts invite
```

Le second propriétaire initialise son propre `DROP_HOME` sur le même relais, lance `serve`, puis exécute `pair <code>` dans un autre terminal. Sur le même laptop, choisir un autre `--port`. Un code valide permet l’admission sans ajouter manuellement chaque membre. Le fichier d’admission se trouve à côté de la config du relais lorsque le chemin est relatif. Il doit vivre sur un volume persistant.

Pour un endpoint interne supplémentaire, fournir `--network politique.json` à `init` :

```json
{
  "origins": ["ws://127.0.0.1:7780", "http://127.0.0.1:11434", "http://10.20.0.4:8080"]
}
```

Une publication MCP HTTP précise son serveur et son modèle déjà installé :

```json
{
  "label": "la documentation interne",
  "server": { "transport": "http", "url": "http://10.20.0.4:8080/mcp" },
  "tools": ["read_summary"],
  "provider": { "baseUrl": "http://127.0.0.1:11434/v1", "model": "NOM_DU_MODELE_INSTALLE", "apiKeyEnv": null }
}
```

Les outils restent choisis par le propriétaire ; aucune capacité n’est publiée par `init`. Pour un modèle authentifié, `apiKeyEnv` nomme une variable d’environnement, jamais la clé. Le mode privé initialise `payer: owner` et refuse le financement reçu dans ce mode. Si le propriétaire choisit `payer: requester`, une clé reçue doit correspondre à son URL et à son modèle, sans jamais les remplacer. La création automatique de clés OpenRouter et la passerelle grand public sont exclues du profil privé.

Pour un déploiement interne sans les sources TypeScript, `node scripts/bundle.ts` produit `dist/drop.mjs`, `dist/drop-mcp.mjs` et `dist/drop-relay.mjs`. Les commandes ci-dessus utilisent alors `node dist/drop.mjs` et `node dist/drop-relay.mjs`. Node reste requis ; un installateur public autonome est hors T3.1.

## Migrer une installation historique

Arrêter le daemon et l’app avant de modifier leur configuration. Ne pas exécuter la migration en parallèle d’un éditeur de configuration.

```bash
node packages/node/src/cli.ts migrate-private --relay ws://127.0.0.1:7780/v1 --network politique.json
node packages/node/src/cli.ts serve
```

`private-migration.json` conserve la configuration avant/après en mode 0600. Identité, jeton, pairs et publications restent identiques. Les publications qui désignent un service cloud sont conservées mais refusées par la politique privée ; les reconfigurer explicitement. Le défaut OpenRouter implicite est supprimé : renseigner le modèle et, si nécessaire, le fournisseur dans les publications existantes. Rien n’est téléchargé.

Pour revenir à la configuration précédente, arrêter le daemon puis lancer `rollback-private`. La restauration refuse une configuration modifiée depuis la migration. Une sauvegarde déjà présente n’est jamais écrasée. En cas d’arrêt brutal, consulter le PID dans `.private-migration.lock`, vérifier que ce processus et le daemon sont arrêtés, puis retirer uniquement ce verrou avant `rollback-private`. Si l’arrêt a précédé le remplacement, le retour arrière conserve simplement la configuration originale.

`--profile legacy` à l’initialisation reste une option explicite pour reproduire le prototype ; elle n’apporte aucune garantie du profil privé. La restauration d’une config historique peut réactiver ses connexions externes.

## Exploiter le relais

```bash
node packages/relay/src/cli.ts revoke IDENTIFIANT_DU_MEMBRE --config=relay.config.json
```

Redémarrer le relais pour appliquer la révocation. Elle prime sur l’allowlist, l’admission sauvegardée et les nouvelles invitations ; le membre ne peut plus parrainer. Les membres déjà admis qu’il avait invités ne sont pas révoqués automatiquement. Sauvegarder **ensemble**, relais arrêté, `relay.config.json` et `admitted.json` avec droits privés. Restaurer les deux sur le volume interne, conserver les révocations, puis démarrer. Ne pas restaurer une sauvegarde antérieure à une révocation sans la réappliquer.

Sauvegarder les répertoires des Nodes séparément, daemon arrêté, sur un support privé chiffré géré par le client. Ne jamais joindre identité, jeton, publications ou sauvegarde de migration à un ticket de support. Les fichiers `received-drops/` sont des identifiants sans contenu qui empêchent une demande déjà reçue de retrouver un consentement après redémarrage : les conserver avec le Node. Une demande interrompue se recrée avec un nouvel identifiant ; elle n’est pas relancée automatiquement.

Diagnostic partageable : état connecté/déconnecté, code d’erreur, version et noms des tests passés. Aucun export automatique de configuration, de question, de réponse ou de jeton. La preuve ci-dessous ne garde que des métadonnées de paquets et des scénarios de fixture.

## Rejouer la preuve sans Internet

Préparer les dépendances, l’image et les outils de capture avant l’usage isolé, ou les transférer par le canal interne du client. Depuis la racine :

```bash
node scripts/private-proof-build.ts
cp scripts/private-proof/Dockerfile scripts/private-proof/run.sh dist/private-proof/
docker build -t drop-private-proof:local dist/private-proof
mkdir -p dist/private-proof-evidence
docker run --rm --network none --mount type=bind,source="$PWD/dist/private-proof-evidence",target=/evidence drop-private-proof:local
```

Le conteneur crée des identités neuves, un relais, deux Nodes et des fixtures MCP/modèle sur loopback. Il joue accord/relecture/résultat, refus, panne du modèle, reprise du relais et des daemons, puis révocation/sauvegarde/restauration. Il observe toutes les interfaces du conteneur via `tcpdump -i any`, en métadonnées uniquement, et vérifie l’absence de route externe. Aucune télémétrie, activation, mise à jour ou téléchargement n’est nécessaire pendant ce parcours.

Les preuves ne qualifient ni un vrai modèle ni les connexions internes d’un agent tiers réel. Cette qualification et la recette complète sur Mac restent en T3.2/T3.5. Aucun service du lab n’est utilisé.
