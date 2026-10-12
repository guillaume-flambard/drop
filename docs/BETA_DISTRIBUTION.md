# Distribution privée des installateurs Drop (bêta 0.1.0)

## Objectif

Un membre envoie une **seule invitation** : une URL HTTPS du type
\`https://drop.memolabs.dev/beta/<expiration>/<signature>#<invitation>\`.
Le site ne transmet pas l'invitation (fragment URL) au serveur. La personne peut
installer Drop, puis appuyer sur **Rejoindre l'équipe**. L'app valide la signature
et exige une confirmation explicite.

Le site public \`/join#<invitation>\` continue de fonctionner pour rejoindre,
mais n'expose aucun installateur tant que la version GitHub reste en brouillon.

## Contrat de distribution côté serveur

Le reverse proxy **doit vérifier la signature et l'expiration côté serveur** avant
de servir la page ou les installateurs. La vérification JavaScript du chemin n'est
qu'une mesure d'interface et **n'est pas un contrôle d'accès**.

- Chemin de page : \`/beta/<epoch-seconds>/<signature-base64url>\`.
- \`signature\` : MD5 des octets UTF-8
  \`<epoch-seconds>|drop-beta-0.1.0|<secret-serveur-aleatoire>\`, encodé
  en base64url sans \`=\`; à utiliser avec le module nginx \`secure_link\`.
- Le secret est généré **sur le VPS**, gardé hors dépôt, rotation à la fin de la
  campagne. Il ne doit pas être stocké dans l'application ni dans la page HTML.
- Les cinq fichiers sont accessibles sous le même préfixe, **uniquement** après
  validation côté serveur : \`drop_0.1.0_aarch64.dmg\`,
  \`drop_0.1.0_x64.dmg\`, \`drop_0.1.0_x64-setup.exe\`,
  \`drop_0.1.0_amd64.AppImage\`, \`drop_0.1.0_aarch64.AppImage\`.
- Les fichiers sont copiés depuis la release brouillon
  \`v0.1.0-ci.36\`, après contrôle de leur SHA256 par rapport à
  \`SHA256SUMS.txt\` ; aucune reconstruction serveur.
- Refuser les signatures erronées et les URL expirées (**403/410**), empêcher
  le listing et les accès directs aux fichiers hors de \`/beta/\`.
- Copier les en-têtes de sécurité de la page \`/join\` pour la page \`/beta\` :
  \`connect-src 'none'\`, script épinglé SHA-256, \`Referrer-Policy: no-referrer\`
  et \`Cache-Control: no-store\` pour les pages d'invitation.
- Le statut *bêta privée* ne signifie pas accès nominatif : **toute personne
  ayant reçu le lien avant son expiration peut télécharger les binaires**.
  Le lien peut être transféré. Les véritables secrets utilisateurs ne doivent
  jamais être inclus dans les installateurs.

## Configuration de l'invitant

Le Node accepte déjà une propriété \`joinPage\` (HTTPS sans query ni fragment).
Pour cette campagne, l'administrateur peut configurer \`joinPage\` avec la page
\`https://drop.memolabs.dev/beta/<expiration>/<signature>\` dans son
\`config.json\` privé. \`POST /ui/invite\` et \`drop invite --link\` émettront
alors le lien complet avec **l'invitation signée dans le fragment**.

Les URLs de téléchargement expirent indépendamment des invitations :
l'invitation d'équipe reste valable 24 heures et une seule fois.

## Critères de réception

1. \`/join\` : pas de téléchargement public en mode bêta.
2. Lien \`/beta\` valide : 200, choix Mac Intel/ARM, Windows et Linux x64/ARM,
   contenu provenant des artefacts GitHub vérifiés.
3. Lien inconnu ou falsifié : 403. Lien expiré : 410.
4. Vérifier la CSP et la politique de référencement ; aucun jeton d'invitation
   n'apparaît dans les logs serveur.
5. Installateurs macOS : Developer ID/notarisation confirmés ; Windows : préciser
   l'absence de signature Authenticode, sans contourner les avertissements.
6. Sur un deuxième appareil, invitation ouverte puis **confirmation manuelle**
   dans Drop ; conserver la même équipe et la même identité après redémarrage.

**Ne pas publier la release stable automatiquement** pendant les essais.
