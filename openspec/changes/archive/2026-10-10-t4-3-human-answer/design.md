## Context

La carte d'approbation vit chez l'approbateur ; la capacité chez l'exécuteur, souvent le même Node. `approval_decision` va de l'approbateur à l'exécuteur, qui lance `runCapability` (validation de sortie et `scanSecrets`), puis `deliver` envoie `drop_result` et écrit un reçu signé. Une enveloppe fait au plus 256 Kio (`MAX_ENVELOPE_BYTES`) ; le message est chiffré puis encodé en base64, soit environ 4/3 de sa taille.

## Decisions

- **Forme** : `HumanAnswer = { kind: 'human', text, file? }`, `text` de 0 à 8 000 caractères, `file = { name, mediaType, content }` avec `mediaType` parmi `text/plain`, `text/markdown`, `text/csv`, `application/json`, `content` en UTF-8 de 128 Kio au plus, sans caractère de contrôle autre que tabulation et fins de ligne. Il faut un texte non vide ou un fichier. Le JSON complet de la réponse ne dépasse pas 160 Kio, pour tenir dans une enveloppe même avec l'échappement.
- **Empreinte** : `drop_result.outputSchemaHash` vaut l'empreinte de `HUMAN_ANSWER_OUTPUT_SCHEMA`, schéma JSON fixe exporté par `protocol`, et non celle du schéma de la capacité : le demandeur sait qu'il lit une réponse écrite à la main.
- **Message** : `human_answer { dropId, answer, decidedAt }`, de l'approbateur vers l'exécuteur. L'exécuteur ne l'accepte que d'un approbateur de la carte, pour un Drop en `awaiting_approval`. Il remplace `approval_decision` : répondre vaut consentement pour cette seule demande.
- **Contrôles** : `checkHumanAnswer` (schéma, taille, `scanSecrets` de `@drop/runner`) tourne chez l'approbateur avant tout envoi, puis chez l'exécuteur avant livraison. Un secret donne `E_SECRET_DETECTED` avec les types trouvés ; la réponse n'est jamais modifiée.
- **Cycle de vie** : `awaiting_approval → approved → (failed | delivered) → receipted`, sans `running` ni `in_review` : la relecture a lieu dans le panneau, avant l'envoi.
- **Reçu** : `answeredBy: 'human'`, `reviewed: true`, `toolCalls: []`, `decision: 'allow_once'`, `outputHash` de la réponse livrée.
- **Panneau** : brouillon par `dropId` gardé en mémoire de la page, pour qu'un rafraîchissement ne perde rien ; fichier lu par `FileReader` en texte et envoyé en JSON à `POST /ui/answer` (corps limité à 200 Kio sur cette route seulement).

- **Après revue adverse** : la relecture montre le contenu du fichier (texte seulement) et refuse un fichier non UTF-8 ; elle nomme l'exécuteur qui reçoit la réponse d'abord, d'après les pairs locaux (`executorName` dans `/ui/pending`) ; l'exécuteur refuse sans révéler le contenu au demandeur ; l'agent demandeur annonce une réponse écrite à la main d'après l'empreinte du schéma fixe ; noms de fichier sans caractère de contrôle ni de direction, contenu sans contrôle C1 ; corps trop gros en 413 `E_TOO_LARGE` ; détection de JWT du scanner en temps linéaire (l'ancienne expression mettait environ 5 s sur 128 Kio).

## Risks / Trade-offs

- Le scanner de secrets ne voit que des motifs connus : un secret inédit peut passer, comme pour une capacité.
- Un pair appairé peut toujours présenter une carte d'approbation mensongère (demandeur, motif) : seul le premier destinataire réel est garanti par l'affichage.
- Le texte reste celui du propriétaire : drop ne vérifie pas qu'il est exact, seulement qu'il a été relu et qu'il ne contient pas de secret reconnu.
