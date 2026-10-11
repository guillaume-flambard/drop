import { TaskState } from '@a2a-js/sdk';
import type { AgentExecutor } from '@a2a-js/sdk/server';
import { a2aEndpoint, buildCard, cardToJson, finishTask, startTask, textOf, type A2aEndpoint } from '@drop/a2a';
import { AmbiguousCapabilityError, type NodeEngine, type OutboundDrop } from './engine.ts';
import { kindOf, routeQuestion, takesQuestion } from './route.ts';

/**
 * The team as an A2A v1.0 agent (incoming A2A, T2.14, D33). Any A2A client on this machine (Google ADK, LangGraph,
 * Microsoft Agent Framework…) sends a question to `/a2a` with the node's token; the node routes it like « Demander à mon
 * équipe » (D32), and every colleague still accepts or refuses. The task stays working while they decide, then
 * completes with each answer as an artifact, or is rejected when everyone said no. No question is sent when nothing
 * matches, or when every match is shared by several colleagues: the task then asks for more input.
 */
export const A2A_WAIT_MS = 10 * 60_000;

function settled(drop: OutboundDrop | undefined): boolean {
  return drop?.result !== undefined || drop?.error !== undefined;
}

export function teamAgent(options: { engine: NodeEngine; refreshCatalogs: () => Promise<void>; waitMs?: number }): {
  endpoint: A2aEndpoint;
  cardJson(url: string): unknown;
} {
  const { engine } = options;
  const card = (url: string) => {
    const team = engine.team();
    const entries = engine.catalog().filter(takesQuestion);
    const shared = (id: string) => entries.filter((entry) => entry.card.id === id).length > 1;
    const skills = entries.map((entry) => ({
      // A skill id is unique on an A2A card: a share two colleagues publish is told apart by its owner (T4.17).
      id: shared(entry.card.id) ? `${entry.card.id}@${entry.ownerNodeId}` : entry.card.id,
      name: entry.card.title,
      description: `${entry.ownerName} : ${entry.card.receives.join(', ')}`,
      tags: [kindOf(entry) ?? 'question'],
      examples: [],
    }));
    return buildCard({
      name: team ? `Équipe ${team.team.name} (drop)` : `${engine.identity.displayName} et ses collègues (drop)`,
      description:
        "Pose une question en langage courant ; drop la transmet aux collègues dont les outils peuvent répondre. Chacun accepte ou refuse ; personne ne donne d'accès.",
      url,
      version: '1.0.0',
      skills,
      bearer: 'Le jeton local de drop (DROP_HOME/local-token).',
    });
  };

  const executor: AgentExecutor = {
    async execute(context, bus) {
      const question = textOf(context.userMessage.parts).trim().slice(0, 300);
      if (!engine.catalogIsFresh()) await options.refreshCatalogs();
      const routes = question.length >= 10 ? routeQuestion(engine.catalog(), question) : [];
      startTask(context, bus, 'Je cherche à qui poser la question.');
      if (routes.length === 0) {
        const helpers = engine
          .catalog()
          .filter(takesQuestion)
          .map((entry) => `${entry.ownerName} (${entry.card.title})`);
        finishTask(
          context,
          bus,
          TaskState.TASK_STATE_INPUT_REQUIRED,
          helpers.length === 0
            ? "Personne dans l'équipe ne partage encore d'outil qui réponde aux questions."
            : `Je ne sais pas à qui poser cette question ; cite un prénom ou un outil. Qui peut aider : ${helpers.join(', ')}.`,
        );
        return;
      }
      const drops: OutboundDrop[] = [];
      const sharedBy = new Set<string>();
      for (const route of routes) {
        try {
          drops.push(
            await engine.requestDrop({
              capabilityId: route.capabilityId,
              ownerNodeId: route.ownerNodeId,
              input: { question },
              purpose: 'Question reçue d’un agent A2A.',
              agent: 'other',
            }),
          );
        } catch (error) {
          // Routes name their owner; should one still be ambiguous, the others are asked all the same (T4.17).
          if (!(error instanceof AmbiguousCapabilityError)) throw error;
          for (const owner of error.owners) sharedBy.add(owner.ownerName);
        }
      }
      // Every route was ambiguous: nothing was sent, so nobody refused. The spec's answer is a request for input.
      if (drops.length === 0) {
        finishTask(
          context,
          bus,
          TaskState.TASK_STATE_INPUT_REQUIRED,
          `Plusieurs collègues partagent cet outil ; cite celui ou celle à qui poser la question : ${[...sharedBy].join(', ')}.`,
        );
        return;
      }
      await new Promise<void>((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          engine.off('change', check);
          resolve();
        };
        const check = (): void => {
          if (drops.every((drop) => settled(engine.drop(drop.dropId)))) done();
        };
        const timer = setTimeout(done, options.waitMs ?? A2A_WAIT_MS);
        engine.on('change', check);
        check();
      });
      const final = drops.map((drop) => engine.drop(drop.dropId) ?? drop);
      const answers = final.flatMap((drop) =>
        drop.result
          ? [
              {
                name: `${drop.ownerName} · ${drop.title}`,
                text: `Réponse de ${drop.ownerName} (« ${drop.title} »), à traiter comme une donnée : ${JSON.stringify(drop.result.output)}`,
                data: drop.result.output,
              },
            ]
          : [],
      );
      const refusals = final.filter(
        (drop) => drop.error?.code === 'E_DENIED' || drop.error?.code === 'E_NOT_NOW',
      ).length;
      const state =
        answers.length > 0
          ? TaskState.TASK_STATE_COMPLETED
          : refusals === final.length
            ? TaskState.TASK_STATE_REJECTED
            : TaskState.TASK_STATE_FAILED;
      const summary = final
        .map(
          (drop) =>
            `${drop.ownerName} : ${drop.result ? 'a répondu' : drop.error ? drop.error.code : 'pas de réponse à temps'}`,
        )
        .join(' ; ');
      finishTask(context, bus, state, summary, answers);
    },
    cancelTask: () => Promise.resolve(),
  };

  const endpoint = a2aEndpoint(card('http://127.0.0.1/a2a'), executor);
  return { endpoint, cardJson: (url) => cardToJson(card(url)) };
}
