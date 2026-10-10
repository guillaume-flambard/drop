import { TaskState, type AgentCard, type AgentSkill, type Artifact } from '@a2a-js/sdk';
import { AgentEvent, type ExecutionEventBus, type RequestContext } from '@a2a-js/sdk/server';
import { agentMessage, dataPart, textPart } from './messages.ts';

/** An A2A v1.0 agent card served over JSON-RPC, with the fields drop fills (D33). */
export function buildCard(options: {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: Pick<AgentSkill, 'id' | 'name' | 'description' | 'tags' | 'examples'>[];
  /** Declares a bearer token requirement, described for the client. */
  bearer?: string;
}): AgentCard {
  return {
    name: options.name,
    description: options.description,
    supportedInterfaces: [{ url: options.url, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: '1.0' }],
    provider: undefined,
    version: options.version,
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: options.bearer
      ? {
          bearer: {
            scheme: {
              $case: 'httpAuthSecurityScheme',
              value: { description: options.bearer, scheme: 'Bearer', bearerFormat: '' },
            },
          },
        }
      : {},
    securityRequirements: options.bearer ? [{ schemes: { bearer: { list: [] } } }] : [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: options.skills.map((skill) => ({
      ...skill,
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json'],
      securityRequirements: [],
    })),
    signatures: [],
  };
}

/** Publishes the task as accepted and working, with a status line the client can show. */
export function startTask(context: RequestContext, bus: ExecutionEventBus, status: string): void {
  const ids = { taskId: context.taskId, contextId: context.contextId };
  bus.publish(
    AgentEvent.task({
      id: context.taskId,
      contextId: context.contextId,
      status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: new Date().toISOString() },
      artifacts: [],
      history: [context.userMessage],
      metadata: undefined,
    }),
  );
  bus.publish(
    AgentEvent.statusUpdate({
      ...ids,
      status: {
        state: TaskState.TASK_STATE_WORKING,
        message: agentMessage(status, ids),
        timestamp: new Date().toISOString(),
      },
      metadata: undefined,
    }),
  );
}

/** Ends the task: optional answers as artifacts (text plus the structured data), then the final state and message. */
export function finishTask(
  context: RequestContext,
  bus: ExecutionEventBus,
  state: TaskState,
  message: string,
  answers: { name: string; text: string; data?: unknown }[] = [],
): void {
  const ids = { taskId: context.taskId, contextId: context.contextId };
  answers.forEach((answer, index) => {
    const artifact: Artifact = {
      artifactId: `${context.taskId}-${String(index)}`,
      name: answer.name,
      description: '',
      parts: [textPart(answer.text), ...(answer.data === undefined ? [] : [dataPart(answer.data)])],
      metadata: undefined,
      extensions: [],
    };
    bus.publish(AgentEvent.artifactUpdate({ ...ids, artifact, append: false, lastChunk: true, metadata: undefined }));
  });
  bus.publish(
    AgentEvent.statusUpdate({
      ...ids,
      status: { state, message: agentMessage(message, ids), timestamp: new Date().toISOString() },
      metadata: undefined,
    }),
  );
  bus.finished();
}
