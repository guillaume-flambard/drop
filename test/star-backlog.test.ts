import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBacklog, readyForSingleRelay, renderStarBacklog } from '../scripts/star-backlog.ts';

const source = readFileSync('docs/TASKS.md', 'utf8');
const registry = readFileSync('docs/relays/STAR_BACKLOG.md', 'utf8');
const tasks = parseBacklog(source);

const openTasks = tasks.filter(({ status }) => status === 'todo' || status === 'doing' || status === 'blocked');

describe('STAR backlog as a derived, non-normative relay index', () => {
  it('parses multiline rows and descriptions containing literal pipes without missing tasks', () => {
    expect(tasks.length).toBeGreaterThanOrEqual(100);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
    expect(tasks.find(({ id }) => id === 'T0.7')?.status).toBe('blocked');
    expect(tasks.find(({ id }) => id === 'T4.33')?.status).toBe('done');
    expect(tasks.find(({ id }) => id === 'T4.35')?.status).toBe('doing');
    expect(tasks.find(({ id }) => id === 'T3.1f')?.status).toBe('done');
  });

  it('requires one unique STAR entry for every canonical open task', () => {
    expect(registry).toBe(renderStarBacklog(tasks));
    const ids = [...registry.matchAll(/^### (T\d+(?:\.\d+[a-z]?)?) — /gm)].map((match) => match[1] ?? '');
    expect(ids).toEqual(openTasks.map(({ id }) => id));
    for (const id of ids) {
      const card = registry.split(`### ${id} — `)[1]?.split('\n### ')[0];
      expect(card).toContain('**S — Situation.**');
      expect(card).toContain('**T — Tâche.**');
      expect(card).toContain('**A — Action suivante.**');
      expect(card).toContain('**R — Résultat et preuve.**');
      expect(card).toContain('**Sortie de boucle.**');
      expect(card).toContain('aucun succès nouveau revendiqué');
    }
  });

  it('does not treat an in-progress parent dependency or blocked hardware acceptance as available', () => {
    const t = (id: string) => {
      const row = tasks.find((task) => task.id === id);
      if (!row) throw new Error('Missing test fixture task ' + id);
      return row;
    };
    expect(readyForSingleRelay(t('T4.35'), tasks)).toBe(true);
    expect(readyForSingleRelay(t('T3.1d'), tasks)).toBe(true);
    expect(readyForSingleRelay(t('T4.6c'), tasks)).toBe(false);
    expect(readyForSingleRelay(t('T3.4'), tasks)).toBe(false);
    expect(readyForSingleRelay(t('T4.47'), tasks)).toBe(false);
  });

  it('fails closed when a new task is open without any next action', () => {
    const first = tasks[0];
    if (!first) throw new Error('Missing canonical backlog fixture');
    const synthetic = [...tasks, { ...first, id: 'T99.99', status: 'todo' as const }];
    expect(() => renderStarBacklog(synthetic)).toThrow('STAR action mapping drift');
  });

  it('does not let closed or deferred tasks claim new execution', () => {
    for (const row of tasks.filter((task) => !openTasks.includes(task))) {
      expect(readyForSingleRelay(row, tasks)).toBe(false);
    }
    expect(registry).toContain('## Archives et éléments non exécutables');
    expect(registry).toContain('## Relais GitHub actifs');
  });
});
