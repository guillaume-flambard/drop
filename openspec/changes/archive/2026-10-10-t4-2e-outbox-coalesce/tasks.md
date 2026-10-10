## 1. Tests d'abord

- [x] 1.1 Des centaines d'annonces d'adresse pour un pair absent n'évincent pas une vraie demande ; après retour, le pair reçoit la demande et la dernière adresse.
- [x] 1.2 Un ancien message remis en file après un envoi raté ne remplace pas un plus récent.

## 2. Réalisation

- [x] 2.1 `queueOutbox` : fusion par destinataire et type d'état.

## 3. Vérification

- [x] 3.1 lint, typecheck, test, `openspec validate --strict`, openspec-guard, revue adverse, `/cso`.
