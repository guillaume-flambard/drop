## Contexte

Le code sait détecter Claude Code, Codex, Cursor et Claude Desktop. L'installation actuelle appelle les CLI ou réécrit le JSON directement ; le panneau appelle l'installation sans aperçu. La configuration d'un agent appartient à l'utilisateur et peut changer entre deux clics.

Le contrat historique `requester-mcp` prescrit une seule sauvegarde `.bak-drop`. L'implémentation T3.3 remplace cette sauvegarde adjacente, non bornée dans le temps, par trois versions privées au maximum dans `DROP_HOME/backups/onboarding` ; la spec correspondante doit être modifiée avec le code.

## Décisions

1. Le Node produit un plan local par agent : état (`ready`, `already_connected`, `conflict`, `error`, `absent`), action et empreinte de la configuration lue. L'API ne renvoie ni valeurs d'environnement, ni en-têtes, ni arguments des serveurs existants.
2. La seconde confirmation renvoie l'agent et l'empreinte. Le Node relit la source juste avant l'action ; si elle a changé, il refuse cet agent et demande une nouvelle analyse. La sélection d'autres agents reste indépendante.
3. Pour Cursor et Claude Desktop, l'écriture remplace seulement `mcpServers.drop`, dans un fichier temporaire privé renommé atomiquement. Une sauvegarde privée du contenu précédent est conservée en nombre borné. Le retrait supprime seulement l'entrée que drop a posée.
4. Pour Claude Code et Codex, les CLI officielles restent le chemin d'écriture. Une entrée `drop` existante différente est un conflit. Aucune séquence `remove` puis `add` sans nécessité. La CLI absente ou en échec donne un résultat explicite par agent ; aucune autre configuration n'est restaurée aveuglément.
5. Le panneau sépare analyse et confirmation. Un succès de configuration annonce la relance éventuelle de l'agent ; l'état de l'équipe provient séparément du Node.

## Risques et limites

- Les CLI ne garantissent pas de transaction. On teste les erreurs avant/après leur appel et on n'annonce pas un succès si la configuration finale ne correspond pas.
- L'empreinte protège contre les changements entre aperçu et application ; un autre processus pourrait modifier un fichier au même instant. L'écriture JSON doit vérifier à nouveau la source avant le renommage, et signaler toute collision observable.
- Une configuration malformée n'est jamais remplacée par `{}`. Les valeurs sensibles restent dans la source locale et les sauvegardes privées.

## Vérification

Fixtures isolées pour quatre adaptateurs, conflits, répétition, fichier malformé, CLI absente, mutation entre aperçu/application, déconnexion après ajout tiers, absence d'agent et réponse API expurgée. Lint, typecheck, tests et relecture du diff.
