# Fiche d'accord : essai de drop en binôme

À lire avant d'installer quoi que ce soit, puis à signer. Une fiche par personne. Le protocole complet, pour
Guillaume, est dans [`README.md`](README.md). Les points entre crochets sont à remplir par Guillaume avant de donner la
fiche.

## Ce qu'on te demande

- Installer drop sur ton Mac, rejoindre une équipe avec la personne avec qui tu travailles, raccorder un ou plusieurs
  de tes agents et partager au moins un outil en lecture.
- Travailler normalement pendant [durée], et poser par drop les questions que tu aurais posées à ton binôme.
- Une séance d'installation d'environ 45 minutes avec Guillaume, un point de 15 minutes au milieu, un entretien de
  30 minutes à la fin.

Ce qu'on ne te demande pas : changer ta façon de travailler, répondre à toutes les questions, ou garder drop après
l'essai.

## Ton employeur

Installer une app et répondre depuis tes outils de travail peut demander une permission. drop ne change rien à ce
que tu as le droit de partager : vérifie avant de commencer, et ne partage que ce que tu partagerais déjà à ton binôme
par message.

## Ce qui s'installe

- **L'app drop**, dans `/Applications`, avec une icône dans la barre de menus. Elle démarre avec ta session.
- **Un dossier `~/.drop`**, chez toi : ton identité et sa clé privée, ton équipe, l'historique de tes décisions
  (reçus), les sauvegardes des fichiers de configuration de tes agents avant modification.
- **Une entrée « drop » dans chaque agent que tu choisis de raccorder.** Le reste de leur configuration ne bouge pas.

drop ne crée aucun compte et ne te demande aucun mot de passe ni jeton. Les accès à tes outils (GitHub, Linear…)
restent ceux que tu as déjà configurés dans tes agents.

## Ce qui circule, et qui le voit

- **Ton binôme** voit les questions qu'il te pose, la réponse que tu choisis d'envoyer, et les noms des outils que tu
  partages. Il ne voit jamais tes outils eux-mêmes. Aucune question ne reçoit de réponse sans ta décision, sauf un
  fait que tu as toi-même publié pour qu'il soit servi sans te redemander.
- **Le relais de l'essai** (`drop.memolabs.dev`, un serveur de Guillaume) fait passer les messages entre vos deux
  Mac quand ils ne sont pas sur le même réseau. Les messages sont chiffrés de bout en bout : le relais ne lit ni
  question ni réponse. Il voit et journalise l'identifiant de chaque Mac, l'identifiant, la taille et l'heure de
  chaque message.
- **Sur ton réseau local**, drop s'annonce sous un nom aléatoire pour trouver ton binôme s'il est sur le même réseau.
  On peut le couper (`"lan": false` dans `~/.drop/config.json`, puis relancer drop) : l'app n'a pas encore de bouton
  pour cela, Guillaume le fait avec toi. Tout passe alors par le relais.
- **Guillaume** [voit les noms des outils que partage le premier membre de chaque binôme, parce que son Mac l'a
  invité : à garder ou à retirer selon le choix d'admission fait dans le protocole, section 4]. Il ne voit jamais
  tes questions ni tes réponses.

**Limite.** drop contrôle ce qui passe par drop. Un serveur MCP ou un modèle que tu as branché a ses propres flux, que
drop ne voit pas. Une réponse envoyée ne se reprend pas.

## Ce qu'on relève pour l'essai

- Pendant la séance d'installation : l'heure de chaque étape, ce qui t'a bloqué et l'aide donnée.
- **Tes reçus**, si tu l'acceptes ci-dessous : un fichier par jour dans `~/.drop/receipts/`. Chaque ligne contient les
  identifiants des deux Mac, celui de l'outil, des empreintes (des hash), ta décision et ses heures. Jamais le texte
  d'une question ni d'une réponse. Tu les relis et tu choisis lesquels remettre.
- Dans le journal du relais : les heures des messages entre toi et ton binôme, pour savoir s'ils sont passés par le
  relais ou par le réseau local.
- Tes réponses aux entretiens, prises en notes par Guillaume.

## Ce qu'on ne relève jamais

Le contenu de tes questions, de tes réponses, de tes fichiers et de tes outils ; tes jetons et mots de passe ; ce que
font tes agents en dehors de drop.

## Captures et vidéo

Seulement si tu l'acceptes ci-dessous, au cas par cas : tu vois chaque capture avant qu'elle serve, floutée, sans
aucune donnée de ton entreprise. Tu peux retirer ton accord à tout moment avant une publication.

## Arrêter, et tout retirer

Tu peux arrêter à tout moment, sans avoir à te justifier. Pour tout retirer (protocole, section 8) : retirer drop de
chaque agent dans Mon espace, « Assistants » ; quitter drop ; supprimer l'app et le dossier `~/.drop` ; Guillaume
retire ton Mac du relais. Guillaume peut le faire avec toi.

Les données remises à Guillaume (reçus, notes, extraits du journal du relais) sont supprimées [délai] après la fin de
l'essai. Les mesures agrégées, sans nom ni identifiant, peuvent rester dans les documents du projet.

## Pendant l'essai

Un problème, une question : préviens Guillaume par [canal]. Ne mets aucune donnée de ton travail dans une issue
GitHub : le dépôt est public. Une faille de sécurité se signale en privé (voir `SECURITY.md` du dépôt).

## Accord

- [ ] J'ai lu cette fiche et j'accepte de participer.
- [ ] J'ai vérifié que mon employeur me permet d'installer drop et de l'utiliser avec mes outils de travail, ou cela
      ne s'applique pas.
- [ ] J'accepte de remettre mes reçus relus à la fin de l'essai.
- [ ] J'accepte des captures d'écran floutées, que je verrai avant usage.
- [ ] J'accepte un extrait vidéo, que je verrai avant usage.

Nom : ................................ Date : ................ Signature : ................................
