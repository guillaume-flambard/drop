import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export type BacklogStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'deferred' | 'superseded';
export interface BacklogRow {
  id: string;
  description: string;
  capabilities: string;
  change: string;
  dependencies: string;
  status: BacklogStatus;
}

const taskStart = /^\|\s*(T\d+(?:\.\d+[a-z]?)?)\s*\|/gm;
const taskStatus = /\|\s*(todo|doing|done|blocked|deferred|superseded)\s*\|/;

export function parseBacklog(markdown: string): BacklogRow[] {
  const starts = [...markdown.matchAll(taskStart)];
  const rows: BacklogRow[] = [];
  for (const [index, match] of starts.entries()) {
    const until = starts[index + 1]?.index ?? markdown.length;
    const chunk = markdown.slice(match.index, until);
    const id = match[1];
    if (!id) throw new Error('Missing canonical task ID');
    const status = taskStatus.exec(chunk);
    if (!status) throw new Error('Missing canonical task status for ' + id);
    const parts = chunk.slice(0, status.index + status[0].length).split('|');
    const fields = parts.slice(-5);
    const [capabilities, changeName, dependencies, parsedStatus] = fields;
    if (!capabilities || !changeName || !dependencies || parsedStatus?.trim() !== status[1]) {
      throw new Error('Malformed canonical backlog row ' + id);
    }
    rows.push({
      id,
      description: parts.slice(2, -5).join('|').trim().replace(/\s+/g, ' '),
      capabilities: capabilities.trim(),
      change: changeName.trim().replaceAll('`', ''),
      dependencies: dependencies.trim(),
      status: status[1] as BacklogStatus,
    });
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('Duplicate canonical task IDs');
  }
  return rows;
}

interface StarSlice {
  action: string;
  evidence: string;
  mode?: 'owner' | 'hardware' | 'code';
}

/** Instructions per open canonical task; never used to claim completion. */
export const starSlices: Record<string, StarSlice> = {
  'T0.7': {
    action:
      'Préparer les exports et analyses, puis faire recruter et interviewer 3 à 5 développeurs et classer les événements D24.',
    evidence:
      'Journal de consentement, 10 jours actifs par testeur et rapport report --merge ; uniquement après entretiens réels.',
    mode: 'owner',
  },
  'T3.4': {
    action:
      'Préparer la checklist et les traces ; réserver au propriétaire l’installation macOS propre, VoiceOver et veille.',
    evidence:
      'Recette réelle sur Mac propre, capture VoiceOver et justification de l’entitlement ; CI seule insuffisante.',
    mode: 'hardware',
  },
  'T4.35': {
    action:
      'Finir les états de la carte de consentement, annonces aria-live, focus et refus de clics périmés ; comparer la carte du panneau et celle de l’espace.',
    evidence:
      'Tests des six états et parcours clavier, non-divulgation du texte du pair et consentement explicite avant envoi.',
  },
  'T4.36': {
    action:
      'Réconcilier cycle de vie de la coque, autostart choisi, Dock, états de la menubar et fermeture de tous les processus.',
    evidence:
      'Tests de processus orphelins et reprise, fenêtre bornée, états visibles et validation réelle des autorisations système.',
    mode: 'hardware',
  },
  'T4.37': {
    action:
      'Fiabiliser la rotation et l’expurgation des journaux, les diagnostics copiables, leur accès authentifié et les erreurs lisibles.',
    evidence:
      'Tests de suppression des secrets, rotation, affichage diagnostic et refus des endpoints non authentifiés.',
  },
  'T4.38': {
    action:
      'Reproduire sous charge la fenêtre de débit du relais ; distinguer horloge réelle, timers et quotas avant tout changement.',
    evidence: 'Test de reprise après la fenêtre de cadence et répétitions CI sans allonger arbitrairement les limites.',
  },
  'T4.39': {
    action:
      'Séparer résultat inconnu et véritable refus après acquittement manquant ; borner l’attente et la reprise des messages.',
    evidence:
      'Tests ACK perdu, reconnect, fermeture, duplications et succès non confirmé correctement marqué incertain.',
  },
  'T4.40': {
    action:
      'Corriger invitations et panneau dans l’ordre après la refonte et l’audit du premier parcours ; préserver consentement et état.',
    evidence: 'Tests des liens, expiration, carte, erreurs et revue UX sur plusieurs tailles de fenêtre.',
  },
  'T4.41': {
    action:
      'Préparer une première release de testeurs reproductible, vérifier manifeste et signatures sans publier stable.',
    evidence: 'Artefacts horodatés, vérifications de signatures et installation réelle sur plateformes requises.',
    mode: 'hardware',
  },
  'T4.44': {
    action: 'Rendre la progression d’une demande visible et attribuable sans inventer des événements de livraison.',
    evidence: 'Tests d’état pending/sent/unknown/received, reconnexion et non-divulgation du contenu brut.',
  },
  'T4.45': {
    action:
      'Traduire les erreurs codes en phrases claires, détails repliables et consignes non dangereuses ; pas de faux « réessayer ».',
    evidence: 'Tests des erreurs E_RATE, E_RUNNER, E_SCHEMA et réseau, accessibilité clavier et messages localisés.',
  },
  'T4.46': {
    action:
      'Auditer le premier parcours sur deux espaces isolés d’une machine, noter chaque écran et créer une tâche par blocage vérifiable.',
    evidence:
      'Parcours équipe→invitation→demande→autorisation→réponse avec captures expurgées et corrections liées à une AC.',
  },
  'T4.47': {
    action:
      'Concevoir un historique de demandes utilisateur lisible, borné et expurgé, après stabilisation de la carte de consentement.',
    evidence: 'Tests d’expiration, de redaction, de navigation, de performance et de suppression contrôlée.',
  },
  'T4.42': {
    action:
      'Fermer les reliquats de durcissement de configuration identifiés en revue, sans accès secret ni relaxation du profil privé.',
    evidence: 'Tests d’origine réseau, permissions, lectures de fichiers, erreurs négatives et rapport CSO.',
  },
  'T4.43': {
    action:
      'Rendre visible le chemin LAN/iroh/relais effectivement utilisé et ses transitions sans tracer données privées.',
    evidence:
      'Tests de chemins préférés, bascule réseau, stabilité des métadonnées et aucune affirmation de liaison non vérifiée.',
  },
  'T4.31': {
    action:
      'Rapprocher le code single-instance, les liens deep-link et la page /join des AC ; isoler les derniers cas Windows/Linux.',
    evidence: 'Tests de doublons de query, parcours URL→app déjà ouverte et recette réelle sur chaque système.',
    mode: 'hardware',
  },
  'T3.7': {
    action:
      'Valider l’emballage et le démarrage Windows sans prétendre à une installation physique ; préparer l’issue de signature.',
    evidence: 'CI Windows verte, installateur signé Authenticode puis installation Windows 10 et 11 observée.',
    mode: 'hardware',
  },
  'T4.6c': {
    action: 'Préparer les scénarios à quatre machines sans les jouer tant que les deux PC ne sont pas disponibles.',
    evidence: 'Quatre nœuds réels et preuve cross-network, consentement, refus, fait publié et reprise.',
    mode: 'hardware',
  },
  'T3.8': {
    action: 'Tester packaging Linux en CI et recenser les besoins GNOME/KDE, X11/Wayland et deep-links.',
    evidence: 'Builds reproductibles puis recette physique des quatre environnements de bureau retenus.',
    mode: 'hardware',
  },
  'T4.24': {
    action:
      'Auditer les états de la UI, accessibilité clavier/lecteur d’écran, tailles et thèmes avant recette visuelle.',
    evidence: 'Tests de composants et acceptation visuelle sur Mac/Windows/Linux par le propriétaire.',
    mode: 'hardware',
  },
  'T4.30': {
    action:
      'Implémenter « Voir »/« Refuser » en conservant le chemin de décision Node ; jamais d’autorisation dans la notification.',
    evidence: 'Tests de notification expirée, déjà tranchée, mode Concentration et protection partage d’écran.',
  },
  'T4.28': {
    action:
      'Réconcilier le statut avec la PR #99 fusionnée ; vérifier qu’aucun filtre ne fait disparaître les checks protégés.',
    evidence: 'PR #99, checks test/test-windows/test-macos et merge_group verts ; tests du classificateur.',
  },
  'T3.2': {
    action: 'Isoler un endpoint local, comparer modèles 4B/9B et évaluer mémoire, qualité et erreur sans repli cloud.',
    evidence: 'Bench reproductible, données/latence/mémoire et décision de modèle local, avec consentement explicite.',
  },
  'T4.16': {
    action:
      'Refuser tout partage de modèle inexécutable ; proposer le choix du fournisseur, outil et approbateur dans le panneau.',
    evidence: 'AC de consentement et test de publication avec et sans modèle local disponible.',
  },
  'T4.6': {
    action: 'Attendre le verdict D24 et les recettes plateformes, préparer l’observation des binômes et les métriques.',
    evidence: 'Deux binômes réels, mesures première réponse, refus, connexions et compte rendu consenti.',
    mode: 'owner',
  },
  'T3.1d': {
    action:
      'Suivre #104 (alerte propriétaire) puis #105 (inspection au démarrage), ensuite traiter révocations et quotas par sous-tranches.',
    evidence:
      'PR #104 et #105 fusionnées avec CodeQL, test-macos, test-windows et merge_group ; tests replay/security verts.',
  },
  'T3.1e': {
    action:
      'Auditer les quotas de marqueurs/pair, compactage et opérations de stockage anti-rejeu sans rouvrir une admission passée.',
    evidence: 'Tests de saturation, redémarrage/crash, quotas et intégrité durable en CI.',
  },
  'T3.5': {
    action:
      'Assembler les preuves privées MCP/A2A après clôture des dépendances et interdire tout repli Internet inattendu.',
    evidence: 'Démonstration de bout en bout, refus, absence de fuite, tests des deux confirmations et compte rendu.',
  },
  'T4.20': {
    action:
      'Relier chaque scénario OpenSpec existant à un test réel avec sélecteur exact, sans effacer les critères non couverts.',
    evidence: 'openspec-guard vérifié, couverture accrue, baseline uniquement réduite et pas de fausse liaison.',
  },
  'T4.21': {
    action:
      'Découper NodeEngine par responsabilité en petites tranches, API inchangée et tests de non-régression à chaque extraction.',
    evidence: 'Tests protocole/Node complets, perf stable, interface publique inchangée et revue sécurité.',
  },
  'T4.27': {
    action:
      'Rassembler les destinations sortantes réseau réelles puis publier une allowlist transparente et vérifiable.',
    evidence: 'Inventaire du code, tests DNS/HTTP et documentation exacte des exceptions sans secret.',
  },
  'T4.29': {
    action:
      'Construire un canari indépendant de la CI PR pour les fournisseurs de modèle, sans appeler un service non autorisé.',
    evidence: 'Alertes sur dérives et erreurs, budget borné et historique ne contenant aucun prompt privé.',
  },
  'T3.6': {
    action:
      'Auditer licences, historique, signatures, distribution et voie privée de signalement avant toute publication.',
    evidence: 'Checklist de publication, SBOM/licences, checks de signature et accord explicite du propriétaire.',
    mode: 'owner',
  },
  'T4.13': {
    action: 'Reporter le lancement ; consolider positionnement, nom et pricing après vraie validation des binômes.',
    evidence: 'Verdict utilisateur, décision explicite de commercialisation et validation des messages publics.',
    mode: 'owner',
  },
  'T3.1a': {
    action: 'Évaluer Hermes comme client MCP isolé après l’essai, sans partager davantage que la réponse autorisée.',
    evidence: 'Scénarios consentement, permissions, secrets et débit ; GO/NO-GO documenté.',
  },
  'T3.2a': {
    action: 'Comparer AI SDK et LiteLLM en adaptateurs facultatifs une fois les modèles et cas d’usage validés.',
    evidence: 'Banc de qualité/latence/coût et compatibilité avec le profil privé et le protocole.',
  },
  'T4.7': {
    action: 'Étendre la simulation aux 500 nœuds seulement après les retours du pilote, avec limites CPU/mémoire.',
    evidence: 'Scénarios déterministes, stabilité du relais, mémoire bornée et rapport horodaté.',
  },
  'T4.8': {
    action:
      'Créer un agent intégré uniquement avec outils définis avant modèle et approbation explicite du propriétaire.',
    evidence: 'Tests d’autorisation, refus, schémas de sortie et scanner de secrets.',
  },
  'T4.9': {
    action: 'Borner la question sur contexte déclaré à une seule session sans accès à des outils non autorisés.',
    evidence: 'AC de contexte, expiration, validation de réponse et consentement.',
  },
  'T4.10b': {
    action: 'Évaluer un binaire de relais autoportant avec isolation secrets et exploitation hors Docker.',
    evidence: 'Build reproducible, démarrage/restauration, réseau et logs sans données privées.',
  },
  'T4.10c': {
    action: 'Fiabiliser l’exploitation entreprise : rechargement TLS/politique, suivi d’état et arrêt sans perte.',
    evidence: 'Tests rotation, rollback, reprise après crash et respect des politiques signées.',
  },
  'T4.11': {
    action: 'Découper la délégation A2A en jalons exigeant un accord, sans donner accès au contexte brut.',
    evidence: 'Tests d’autorisations par étape, annulation, expiration et traçabilité.',
  },
  'T4.12': {
    action: 'Définir un catalogue de sujets décentralisé avec droits, invalidation et suggestions non exécutables.',
    evidence: 'Tests de confidentialité, invalidation, révocation et stabilité des métadonnées.',
  },
};

export function readyForSingleRelay(row: BacklogRow, all: readonly BacklogRow[]): boolean {
  if (row.status !== 'todo' && row.status !== 'doing') return false;
  const statuses = new Map(all.map((task) => [task.id, task.status]));
  const dependencies = row.dependencies.match(/T\d+(?:\.\d+[a-z]?)*\b/g) ?? [];
  return dependencies.every((id) => statuses.get(id) === 'done');
}

function safeSnippet(value: string, max = 260): string {
  const plain = value.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  return plain.length <= max ? plain : plain.slice(0, max - 1).trimEnd() + '…';
}

function getChangePath(cwd: string, changeName: string): string | null {
  const candidate = join(cwd, 'openspec/changes', changeName);
  if (existsSync(candidate)) return 'openspec/changes/' + changeName + '/';
  const archive = join(cwd, 'openspec/changes/archive');
  for (const dir of existsSync(archive) ? readdirSync(archive) : []) {
    if (dir === changeName || dir.endsWith('-' + changeName)) {
      return 'openspec/changes/archive/' + dir + '/';
    }
  }
  return null;
}

export function renderStarBacklog(rows: readonly BacklogRow[], cwd = process.cwd()): string {
  const open = rows.filter((row) => ['todo', 'doing', 'blocked'].includes(row.status));
  const other = rows.filter((row) => !open.includes(row));
  const states = new Map<BacklogStatus, number>();
  for (const row of rows) states.set(row.status, (states.get(row.status) ?? 0) + 1);
  const missing = open.filter((row) => !starSlices[row.id]);
  const excess = Object.keys(starSlices).filter((id) => !open.some((row) => row.id === id));
  if (missing.length || excess.length) {
    throw new Error(
      'STAR action mapping drift. Missing: ' +
        missing.map((row) => row.id).join(', ') +
        '; extra: ' +
        excess.join(', '),
    );
  }

  const out: string[] = [
    '# Drop — backlog vivant en boucles STAR',
    '',
    '> Document dérivé de [docs/TASKS.md](../TASKS.md). Les **statuts, priorités et dépendances** y restent canoniques ; ce registre ne les remplace pas. Génération reproductible par `node scripts/star-backlog.ts` ; synchronisation vérifiée par `node scripts/star-backlog.ts --check`.',
    '',
    '## Contrat d’exécution',
    '',
    'Chaque relais prend **une seule sous-tâche non revendiquée** : 1) lire le contexte et la spec normative, 2) écrire S/T/A avant tout changement, 3) implémenter + tests, 4) noter R avec preuves, 5) publier une PR et attendre les contrôles requis, 6) refaire le choix dans l’index mis à jour. Ne jamais déduire DONE d’un document ou d’une PR non fusionnée.',
    '',
    'Les travaux qui réclament du matériel, des testeurs ou une décision humaine ne deviennent pas « faits » après une simple compilation. Aucun merge forcé, suppression de données, réparation automatique ou release stable par cette boucle.',
    '',
    '## Situation du backlog (source : index, pas les PR en transit)',
    '',
    '| Statut | Nombre |',
    '| --- | ---: |',
    ...(['done', 'todo', 'doing', 'blocked', 'deferred', 'superseded'] as const).map(
      (status) => '| ' + status + ' | ' + String(states.get(status) ?? 0) + ' |',
    ),
    '| **Total** | **' + String(rows.length) + '** |',
    '',
    '**Ouvert : ' +
      String(open.length) +
      ' chantiers.** Candidats sans dépendance non terminée : ' +
      String(open.filter((row) => readyForSingleRelay(row, rows)).length) +
      '. « Prêt » signifie seulement qu’un agent peut instruire une sous-tâche, pas que toutes ses AC sont validées.',
    '',
    '## Boucles STAR — tâches ouvertes',
    '',
  ];
  for (const row of open) {
    const slice = starSlices[row.id];
    if (!slice) throw new Error('No STAR action for ' + row.id);
    const ready = readyForSingleRelay(row, rows);
    const changeName = row.change.split(/[\s(]/)[0] || 'non définie';
    const path = getChangePath(cwd, changeName);
    const change = path
      ? '[`' + changeName + '`](../../' + path + ')'
      : '`' + changeName + '` (change à localiser/créer)';
    const deps = row.dependencies === '—' || row.dependencies === '-' ? 'aucune' : row.dependencies;
    const gate =
      row.status === 'blocked'
        ? 'bloqué / preuve humaine'
        : ready
          ? 'préqualification autorisée'
          : 'attend dépendances';
    out.push(
      '### ' + row.id + ' — ' + row.status + ' · ' + gate,
      '',
      '**S — Situation.** ' + safeSnippet(row.description, 430),
      '',
      '**T — Tâche.** Contrat : ' + row.capabilities + '. Change : ' + change + '. Dépend de : ' + deps + '.',
      '',
      '**A — Action suivante.** ' + slice.action,
      '',
      '**R — Résultat et preuve.** ' +
        slice.evidence +
        ' **État : ' +
        row.status.toUpperCase() +
        ' dans l’index ; aucun succès nouveau revendiqué dans ce registre.**',
      '',
      '**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. ' +
        (slice.mode === 'hardware'
          ? 'Recette matérielle indispensable.'
          : slice.mode === 'owner'
            ? 'Décision ou témoignage humain indispensable.'
            : 'Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.'),
      '',
    );
  }
  out.push('## Archives et éléments non exécutables', '');
  for (const status of ['done', 'deferred', 'superseded'] as const) {
    const ids = other.filter((row) => row.status === status).map((row) => row.id);
    out.push('**' + status + ' (' + String(ids.length) + ') :** ' + (ids.join(', ') || 'aucun') + '.', '');
  }
  out.push(
    '## Relais GitHub actifs (état à vérifier au moment du cycle)',
    '',
    '- [PR #104](https://github.com/memolabs-dev/drop/pull/104) : signal propriétaire, merge queue et CI doivent être vérifiés avant la conclusion.',
    '- [PR #105](https://github.com/memolabs-dev/drop/pull/105) : détection anti-rejeu au démarrage, actuellement dépendante de #104 ; ne pas fusionner en sautant la base.',
    '- [PR #99](https://github.com/memolabs-dev/drop/pull/99) : optimisation CI fusionnée ; l’index `T4.28` doit être réconcilié avec les AC, sans supposer que toutes les demandes sont terminées.',
    '',
    'Chaque nouvelle boucle consigne les liens réels des PR, SHA, checks et tests dans son handoff, **pas** dans le statut canonique tant que les critères ne sont pas satisfaits.',
    '',
  );
  return out.join('\n');
}

export function generateStarBacklog(cwd = process.cwd()): string {
  return renderStarBacklog(parseBacklog(readFileSync(join(cwd, 'docs/TASKS.md'), 'utf8')), cwd);
}

if (basename(process.argv[1] ?? '') === 'star-backlog.ts') {
  const outputPath = join(process.cwd(), 'docs/relays/STAR_BACKLOG.md');
  const generated = generateStarBacklog();
  if (process.argv.includes('--check')) {
    if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== generated) {
      process.stderr.write('STAR_BACKLOG.md is stale; run node scripts/star-backlog.ts\n');
      process.exitCode = 1;
    } else process.stdout.write('STAR registry matches canonical TASKS.md\n');
  } else {
    writeFileSync(outputPath, generated);
    process.stdout.write('Generated STAR registry for canonical backlog\n');
  }
}
