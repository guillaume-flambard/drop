## Why

D84 (choix de Guillaume du 11 octobre 2026, non négociable) : rejoindre une équipe se fait par un seul lien et deux clics. Aujourd'hui, l'app donne un lien `drop://pair?code=…` qui ne fait rien chez quelqu'un qui n'a pas encore drop, le code n'est pas signé, l'invitation est oubliée si le Mac de l'inviteur redémarre, et un nouveau poste reste sur le relais de bouclage de son premier lancement : il ne joint jamais le relais de l'équipe (`wss://drop.memolabs.dev/v1`, D84), que le profil privé refusait d'ailleurs parce qu'il n'accepte qu'une adresse IP privée littérale.

Version honnête convenue avec Guillaume : une app signée ne peut pas porter une invitation personnelle dans son installeur. Le lien mène donc à une page qui reconnaît le système, propose le bon téléchargement, puis rouvre drop sur l'invitation.

## What Changes

- **Un lien à envoyer** : « Inviter quelqu'un » (API `POST /ui/invite`, champ `link`, et `drop invite --link`) donne `https://drop.memolabs.dev/join#<invitation>`. L'invitation est dans le fragment, qu'aucun navigateur n'envoie au serveur.
- **Invitation signée** : le Node de l'inviteur signe tous les champs (relais, nom, équipe, jeton, date, ticket d'admission, adresses iroh) avec sa clé d'identité, par la signature Ed25519 existante. Refus à codes stables : `E_INVITE` (illisible, nom piégé, sa propre invitation, ticket d'un autre parrain), `E_INVITE_EXPIRED`, `E_INVITE_SIG`, `E_INVITE_USED`, `E_INVITE_RELAY`.
- **Usage unique et redémarrage** : l'inviteur garde ses invitations vivantes dans `invites.json` (`0600`) et les honore après un redémarrage, une seule fois ; l'invité garde l'empreinte SHA-256 des jetons acceptés et refuse une seconde utilisation.
- **Page `/join`** du site : statique, sans ressource externe, un seul script épinglé par son empreinte dans la CSP, `connect-src 'none'`. Elle lit le fragment, affiche « Guillaume t'invite dans l'équipe Atelier », propose le téléchargement du système détecté (page des versions GitHub), un bouton « J'ai installé drop : rejoindre l'équipe » qui ouvre `drop://join?invite=…`, et le code à copier en secours.
- **App** : `drop://join?invite=…` ouvre la carte de confirmation existante (T4.14), y compris au premier lancement (lien mis en file jusqu'à ce que le Node réponde). Mon espace accepte le code ou le lien collé (« J'ai reçu une invitation »).
- **Relais adopté au premier « Rejoindre »** : un Node qui n'a encore ni pair ni équipe passe au relais de l'invitation, après vérification (`ws:` seulement vers une adresse privée littérale, `wss:` vers une telle adresse ou un nom DNS, puis la liste de la politique d'organisation). `config.json` est réécrit sous verrou et la connexion change sans redémarrage. Un Node déjà relié garde son relais.
- **Profil privé** : il accepte un relais nommé par DNS en `wss:` seulement ; ce relais n'entre jamais dans les destinations permises au modèle ou aux serveurs MCP (D89).
- **CLI** : `drop join <code-ou-lien>`, `drop pair` reste un synonyme.

## Capabilities

### Modified Capabilities

- `protocol` : code d'invitation signé, refus à codes stables, lecture d'un lien.
- `node` : lien à envoyer, `drop join`, invitations gardées au redémarrage, relais adopté au premier « Rejoindre », relais DNS du profil privé.
- `owner-app` : `drop://join`, carte de confirmation au premier lancement, bootstrap sans relais public choisi de lui-même, invitation collée dans Mon espace.
- `site` : page `/join`, seule page à script.

`relay` ne change pas de contrat : l'admission par ticket signé de T2.1 sert telle quelle. Le client du relais (côté Node) gagne `switchUrl`.

## Non-goals

- Noms des fichiers de release : aucune release GitHub n'existe encore et les builds Windows et Linux sont un autre chantier ; la page renvoie vers `releases/latest`.
- Panneau de la barre de menus : migré vers React par un autre chantier. Son bouton « Inviter » donne encore `drop://pair` et il ne propose pas « Connecter mes agents » après « Rejoindre » ; l'API expose `link` et `next: 'connect_agents'` pour lui (nouvelle ligne T4.25).
- Déploiement du site et du relais sur le VPS (T4.6a).

## Impact

`packages/protocol` (invite, politique de relais, codes), `packages/node` (moteur, API, CLI, daemon, configuration), `packages/relay` (client), `packages/desktop-ui` (Mon espace, équipe), `apps/desktop/src-tauri/src/main.rs` (liens profonds seulement), `site/join.html`, `scripts/site.ts`, docs (`ONBOARDING`, `GUIDE`, `DECISIONS` D89, `TASKS`).
