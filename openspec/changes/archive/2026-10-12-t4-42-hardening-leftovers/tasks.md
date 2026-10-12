## 1. Relevé et documentation

- [x] 1.1 Lecture : vision, architecture, specs `node` et `simulation`, changes archivées T4.25 et T4.26, D99 et D101.
- [x] 1.2 Sources : Node 24.21.0 `doc/api/fs.md` (« File open constants »), constantes présentes sur la version
      installée (voir `design.md`).
- [x] 1.3 Mesure du démarrage du banc sur l'ancien code (worktree détaché d'`origin/main`), sous charge.

## 2. Tests d'abord

- [x] 2.1 `node/test/clients-auto.test.ts` : tube nommé à la place de la configuration de Zed. Rouge sur l'ancien code
      (3 020 ms d'attente pour un écrivain arrivé à 3 s).
- [x] 2.2 `capabilities/test/linear-parsing.test.ts` : lien refusé avec `followLinks: false`, suivi par défaut.
- [x] 2.3 `simulation/test/owner-files.test.ts` : lien symbolique, lien physique et dossier à la place d'un fichier ;
      dossiers fermés, lien de dossier refusé ; `mkdirSync` interdit dans `campaign.ts`. Sur l'ancien code, la cible
      d'un lien symbolique est réécrite et passe en 0600, celle d'un lien physique reçoit l'ajout.
- [x] 2.4 `simulation/test/campaign.test.ts` : campagne refusée sur un `node-0` planté en lien.
- [x] 2.5 `simulation/test/parallel.test.ts` : borne, ordre, arrêt après échec.

## 3. Réalisation

- [x] 3.1 `readConfigText` : option `followLinks` ; `onboarding.ts` délègue au lecteur partagé.
- [x] 3.2 `owner-files.ts` : ouverture sans suivre ni tronquer, contrôles, `ownerOnlyDir`.
- [x] 3.3 `parallel.ts` et `campaign.ts` : dossiers fermés avant tout processus, `init` et `publish` en parallèle,
      processus courts suivis pour l'arrêt.

## 4. Vérification

- [x] 4.1 `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `openspec validate --strict`, openspec-guard.
- [x] 4.2 Mesure après correction, entrelacée avec l'ancien code, à charge ambiante et sous charge ajoutée.
- [x] 4.3 Revue du diff (`review`) et revue de sécurité (`cso`).
- [x] 4.4 Retours de la revue adverse : `O_NONBLOCK` aux écritures du banc (tube nommé), lien pendant refusé avec
      `E_SIM_WORK_DIR`, `HOME` du relais fermé, borne non numérique de `inParallel`, commentaire en double retiré ;
      tests ajoutés.
