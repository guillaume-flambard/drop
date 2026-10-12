## ADDED Requirements

### Requirement: Filtre de bruit en temps linéaire
Le filtre de bruit SHALL retirer les corps de heredoc et trouver les commandes shell des arguments JSON en un temps linéaire dans la longueur de la commande, avec les mêmes résultats qu'avant T4.26, sauf qu'un heredoc ne se ferme que sur son mot entier.

#### Scenario: AC: heredocs non fermés
<!-- openspec-guard:test="noise filter in linear time (T4.26) > drops heredoc bodies as before, and stays linear on unterminated heredocs" -->
- **WHEN** une commande porte un heredoc fermé, un heredoc non fermé, un heredoc fermé par un mot plus long, ou 100 000 heredocs non fermés
- **THEN** seul le corps du heredoc fermé par son mot est retiré, et la commande piégée est classée en moins de 1,5 s

#### Scenario: AC: commandes répétées dans les arguments
<!-- openspec-guard:test="noise filter in linear time (T4.26) > finds shell commands in JSON arguments as before, and stays linear on repeated command arrays" -->
- **WHEN** les arguments portent `"command": [..., "-lc", "<script>"]`, un drapeau hors des crochets, un script non fermé, ou 100 000 `"command":[` sans fermeture
- **THEN** seuls les scripts dont le drapeau est entre les crochets sont trouvés, et les arguments piégés sont lus en moins de 1,5 s

### Requirement: Import Codex par un seul descripteur
L'import des logs Codex SHALL ouvrir chaque log une fois, puis lire sa date et son contenu par ce même descripteur ; un log disparu entre le parcours et la lecture, ou devenu autre chose qu'un fichier, MUST être ignoré.

#### Scenario: AC: date lue sur le log importé
<!-- openspec-guard:test="Codex sessions read through one descriptor (T4.26) > reads a log modified since the cut-off and skips an older one, as before" -->
- **WHEN** deux logs identiques sont datés l'un avant, l'autre après la date de coupure
- **THEN** seul le plus récent est importé
