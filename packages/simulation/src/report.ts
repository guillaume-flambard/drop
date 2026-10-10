/** Campaign report: latency, outcomes, memory and leaks (T4.1). Pure functions, tested on known data. */
export interface OutcomeRecord {
  outcome: 'delivered' | 'denied' | 'not_now' | 'expired' | 'failed' | 'error';
  ms: number;
  code?: string;
}

export interface MemorySeries {
  role: 'relay' | 'owner' | 'requester';
  node: number;
  rssKb: number[];
}

export interface ReportInput {
  campaign: string;
  seed: number;
  nodes: number;
  owners: number;
  durationMs: number;
  outcomes: OutcomeRecord[];
  memory: MemorySeries[];
  leaks: number;
}

/** Nearest-rank percentile; 0 for an empty list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number;
}

export function summarize(input: ReportInput) {
  const totals: Record<string, number> = {};
  const errors: Record<string, number> = {};
  for (const record of input.outcomes) {
    totals[record.outcome] = (totals[record.outcome] ?? 0) + 1;
    if (record.code) errors[record.code] = (errors[record.code] ?? 0) + 1;
  }
  const delivered = input.outcomes.filter((r) => r.outcome === 'delivered').map((r) => r.ms);
  const peak = (series: MemorySeries) => Math.max(0, ...series.rssKb);
  const nodePeaks = input.memory.filter((s) => s.role !== 'relay').map(peak);
  const relayPeaks = input.memory.filter((s) => s.role === 'relay').map(peak);
  return {
    campaign: input.campaign,
    seed: input.seed,
    nodes: input.nodes,
    owners: input.owners,
    durationMs: input.durationMs,
    totals,
    errors,
    latencyMs: {
      count: delivered.length,
      median: percentile(delivered, 50),
      p95: percentile(delivered, 95),
      max: Math.max(0, ...delivered),
    },
    memoryKb: {
      relayMax: Math.max(0, ...relayPeaks),
      nodeMaxMedian: percentile(nodePeaks, 50),
      nodeMaxMax: Math.max(0, ...nodePeaks),
      sumOfPeaks: input.memory.map(peak).reduce((a, b) => a + b, 0),
    },
    leaks: input.leaks,
  };
}

export type Report = ReturnType<typeof summarize>;

export function renderMarkdown(report: Report): string {
  const mb = (kb: number) => `${(kb / 1024).toFixed(1)} Mo`;
  const lines = [
    `# Campagne ${report.campaign}`,
    '',
    `Graine ${String(report.seed)}, ${String(report.nodes)} nœuds dont ${String(report.owners)} propriétaires, ${String(Math.round(report.durationMs / 1000))} s de charge.`,
    '',
    '| Issue | Nombre |',
    '|---|---|',
    ...Object.entries(report.totals).map(([k, v]) => `| ${k} | ${String(v)} |`),
    '',
    `Latence des demandes autorisées (${String(report.latencyMs.count)}) : médiane ${String(report.latencyMs.median)} ms, 95e centile ${String(report.latencyMs.p95)} ms, maximum ${String(report.latencyMs.max)} ms.`,
    '',
    `Mémoire résidente : relais au plus ${mb(report.memoryKb.relayMax)} ; nœud médian au plus ${mb(report.memoryKb.nodeMaxMedian)}, nœud le plus lourd ${mb(report.memoryKb.nodeMaxMax)} ; somme des pics par processus (pas une mesure simultanée, banc exclu) ${mb(report.memoryKb.sumOfPeaks)}.`,
    '',
    `Erreurs : ${
      Object.keys(report.errors).length === 0
        ? 'aucune'
        : Object.entries(report.errors)
            .map(([k, v]) => `${k} ${String(v)}`)
            .join(', ')
    }.`,
    '',
    `Fuites détectées chez les demandeurs : ${String(report.leaks)}.`,
    '',
  ];
  return lines.join('\n');
}
