import { randomUUID } from 'node:crypto';
import { Role, TaskState, type Message, type Part, type Task } from '@a2a-js/sdk';

/**
 * Small helpers over the A2A v1.0 types of the official SDK (`@a2a-js/sdk` 1.3.0, D33). Parts are proto oneofs
 * (`content.$case`); drop only sends and reads text and JSON data.
 */
export function textPart(text: string): Part {
  return { content: { $case: 'text', value: text }, metadata: undefined, filename: '', mediaType: 'text/plain' };
}

export function dataPart(data: unknown): Part {
  return { content: { $case: 'data', value: data }, metadata: undefined, filename: '', mediaType: 'application/json' };
}

export function agentMessage(text: string, ids: { taskId?: string; contextId?: string } = {}): Message {
  return {
    messageId: randomUUID(),
    contextId: ids.contextId ?? '',
    taskId: ids.taskId ?? '',
    role: Role.ROLE_AGENT,
    parts: [textPart(text)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

export function userMessage(text: string): Message {
  return { ...agentMessage(text), role: Role.ROLE_USER };
}

/** The text of a list of parts: text parts as is, data parts as JSON; files and raw bytes are left out. */
export function textOf(parts: Part[]): string {
  return parts
    .map((part) => {
      if (part.content?.$case === 'text') return part.content.value;
      if (part.content?.$case === 'data') return JSON.stringify(part.content.value);
      return '';
    })
    .filter((text) => text !== '')
    .join('\n');
}

export type Outcome = 'completed' | 'pending' | 'rejected' | 'failed' | 'canceled' | 'input_required' | 'auth_required';

export function isTask(result: Message | Task): result is Task {
  return 'status' in result && 'id' in result;
}

/** What an A2A answer amounts to: a terminal state or not, and its text (artifacts first, then the status message). */
export function outcomeOf(result: Message | Task): { outcome: Outcome; text: string } {
  if (!isTask(result)) return { outcome: 'completed', text: textOf(result.parts) };
  const status = result.status?.message ? textOf(result.status.message.parts) : '';
  const artifacts = result.artifacts
    .map((artifact) => textOf(artifact.parts))
    .filter(Boolean)
    .join('\n');
  const text = [artifacts, status].filter(Boolean).join('\n');
  switch (result.status?.state) {
    case TaskState.TASK_STATE_COMPLETED:
      return { outcome: 'completed', text };
    case TaskState.TASK_STATE_REJECTED:
      return { outcome: 'rejected', text };
    case TaskState.TASK_STATE_CANCELED:
      return { outcome: 'canceled', text };
    case TaskState.TASK_STATE_INPUT_REQUIRED:
      return { outcome: 'input_required', text };
    case TaskState.TASK_STATE_AUTH_REQUIRED:
      return { outcome: 'auth_required', text };
    case TaskState.TASK_STATE_FAILED:
      return { outcome: 'failed', text };
    default:
      return { outcome: 'pending', text };
  }
}
