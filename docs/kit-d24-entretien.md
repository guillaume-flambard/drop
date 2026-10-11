# Kit de mesure D24 : recrutement, entretien, export

Cette fiche complète [`packages/blocked-observer/README.md`](../packages/blocked-observer/README.md), qui est le
guide que suit le testeur, et [`docs/CLASSIFICATION.md`](CLASSIFICATION.md), qui est la grille de classement. Elle
est pour Guillaume : elle dit qui recruter, comment se tient l'entretien, et ce qui sort de la machine.

## 1. Avant de recruter : ce qu'on promet

On cherche 3 à 5 développeurs qui codent avec des agents, Guillaume compris, sur 10 jours actifs chacun. Le seuil
de verdict est fixé d'avance par [D24](DECISIONS.md) : on ne le négocie pas après coup.

Ce qu'on dit au testeur, en une phrase :

- **Il n'installe que blocked-observer.** Pas d'app, pas de relais, pas de compte, pas de serveur.
- **Rien ne quitte sa machine** sans qu'il le fasse lui-même, et seulement après sa relecture.
- **Ça ne le ralentit pas.** L'outil ne réseau aucun, ne daemon pas, et l'enregistrement d'un blocage est
  asynchrone : moins de 50 ms, sans attendre l'écriture sur disque.
- **Ce qu'on lui demande, c'est dix jours de travail normal**, pas de changer sa façon de coder.
- **À la fin, un entretien d'une demi-heure** sur ses propres événements.

Ce qu'on ne promet pas : que son blocage débouche sur un outil, qu'il soit identifié dans un rapport, ou que la
mesure décide seule du sort de drop. D24 donne un verdict, pas une priorité de développement.

## 2. Consentement

Le testeur doit savoir, avant d'installer, ce qui sera relevé :

- **Ce qui est collecté** : ce qui manque à l'agent (accès, donnée, outil, contexte, permission), la ressource
  visée, à qui elle appartient selon l'agent, ce qu'il essayait de faire, et comment il a contourné. Pour les
  blocages relevés automatiquement : l'heure, le nom de l'outil, l'identifiant de session, le nom du motif reconnu
  et une empreinte SHA-256 tronquée de la ressource.
- **Ce qui ne l'est jamais** : le contenu des résultats d'outils, ni la sortie, ni l'erreur, ni un extrait ; la
  ressource elle-même pour les événements automatiques, seule son empreinte.
- **Où ça vit** : `~/.blocked-observer/`, chez lui, en mode 0700.
- **Ce qui quitte la machine** : uniquement le fichier d'export, et seulement après sa relecture champ par champ.

Le testeur relit et retire ce qu'il veut avant d'exporter. C'est sa machine et son travail : s'il retire un événent,
on n'a pas à le lui redemander.

## 3. Installation

Le testeur suit [`packages/blocked-observer/README.md`](../packages/blocked-observer/README.md), section
« Installer en 5 minutes ». Deux points à lui rappeler avant qu'il commence :

- **Node 22.18 ou plus.** Vérifier `node --version` d'abord : la CI du dépôt ne valide que Node 24, donc un
  plancher plus ancien casse silencieusement.
- **On clone, on n'installe pas le paquet à distance.** Node refuse les fichiers TypeScript sous `node_modules`.

Vérifier avec lui que la configuration s'est bien posée : `claude mcp list` doit montrer `blocked-observer`, et le
premier `report` doit répondre sans erreur.

## 4. Pendant les dix jours

Rien à faire d'autre que de travailler normalement. Un point à relancer, parce que c'est là que la mesure se perd :

- **Codex n'a pas de hook.** Ses blocages ne sont visibles qu'après import de ses journaux de session. Le lui
  redire, et lui donner la commande :
  `node packages/blocked-observer/src/cli.ts import-codex --since 7d`.
  Sans ça, ses blocages Codex n'existent pas au moment de l'entretien, et ses jours actifs sont sous- comptés.
- Les jours actifs sont comptés dans `activity.json`. Dix jours actifs chacun est un prérequis du verdict, pas un
  détail : un testeur à trois jours ne compte pas dans l'échantillon.

## 5. L'entretien

Une demi-heure, avec ses événements sous les yeux. L'ordre ci-dessous est le même que la question posée par
`classify`, pour que la conversation et la commande donnent le même code.

```bash
node packages/blocked-observer/src/cli.ts list --since 30d
node packages/blocked-observer/src/cli.ts classify <id>
```

1. **Montrer la liste, pas une question.** Parcourir ses événements avec lui, un par un. Il reconnaît souvent les
   siens immédiatement ; les autres se classent vite.
2. **Laisser `classify` poser.** La commande pose les questions oui/non dans l'ordre et en déduit le code : on n'a
   pas à retenir les huit codes. La grille, avec un exemple par code, est dans
   [`docs/CLASSIFICATION.md`](CLASSIFICATION.md).
3. **Relever les minutes perdues**, attente et contournement compris, à 5 minutes près. Une estimation honnête vaut
   mieux qu'un chiffre précis inventé : ce nombre entre directement dans le seuil D24.
4. **Noter le contexte, pas le jugement.** Qui possédait la ressource, pourquoi elle n'était pas partagée, ce qui
   aurait débloqué. Ce sont ces réponses qui disent si drop sert à quelque chose.
5. **Ne pas défendre drop.** On mesure un besoin, on ne le prouve pas pendant l'entretien. Une réponse « je m'en
   suis sorti tout seul » est une donnée valable, pas un échec à corriger.

Un événement non classé ne compte jamais comme blocage, donc rien ne se perd à en laisser de côté : seul ce qui est
classé entre dans le verdict.

## 6. Export

Quand tous les événements qu'il veut garder sont relus, le testeur exporte :

```bash
node packages/blocked-observer/src/cli.ts export --out blocages.json
```

L'export se fait chez lui, et se fait une fois. La commande montre chaque événement un par un : il peut le retirer,
et pour chaque champ texte (ressource, propriétaire, action, note) le garder, le remplacer par son empreinte ou le
supprimer. **Seul ce que tu as gardé est écrit.** Le fichier contient aussi ses jours actifs, sous forme de dates
seulement, sans identifiant de session.

Avec `--classified-only`, seuls les événements classés sont relus et écrits. Un événement non classé ne compte
jamais comme blocage, donc le verdict ne change pas ; tous ses jours actifs restent dans le fichier.

Recevoir le fichier. Ne rien redemander après : si un champ manque, il a choisi de le retirer.

## 7. Après : agrégation et verdict

```bash
node packages/blocked-observer/src/cli.ts report --merge guillaume.json ana.json yan.json
```

Le rapport additionne les dev-jours actifs et les blocages, donne une ligne par testeur, vérifie l'échantillon, puis
applique le seuil D24 écrit d'avance. Les signaux bruts non classés ne comptent pas. Le verdict se lit dans
`yesPerActiveDay` et `medianPainMinutesYes`, tous regroupés : une seule personne ne peut pas le porter.
