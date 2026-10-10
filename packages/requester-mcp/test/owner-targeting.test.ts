import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { CapabilityView, LocalNode } from '../src/client.ts';
import { createTools } from '../src/tools.ts';

const shared = (owner: string, ownerNodeId: string): CapabilityView => ({
  capability_id: 'mcp.answer.figma',
  title: 'Répondre depuis Figma',
  owner,
  owner_node_id: ownerNodeId,
  online: true,
  input_schema: z.toJSONSchema(z.object({ question: z.string() })),
  receives: ['la question'],
});

describe('owner targeting (T4.17)', () => {
  it('lets the agent name the owner and refuses an ambiguous id before sending anything', async () => {
    const requestDrop = vi.fn((body: { ownerNodeId?: string | undefined }) =>
      Promise.resolve({ dropId: 'd1', owner: body.ownerNodeId === 'node-marc' ? 'Marc' : 'Julie' }),
    );
    const node: LocalNode = {
      capabilities: () => Promise.resolve([shared('Julie', 'node-julie'), shared('Marc', 'node-marc')]),
      requestDrop,
      ask: () => Promise.resolve({ asked: [], helpers: [] }),
      drop: () => Promise.reject(new Error('unused')),
    };
    const tools = createTools(node, 'claude_code');
    const listed = await tools.listCapabilities();
    expect(listed.content[0]?.text).toContain('node-marc');

    const ambiguous = await tools.requestDrop({
      capability_id: 'mcp.answer.figma',
      input: { question: 'Où en est la maquette ?' },
      purpose: 'Préparer la revue de design',
    });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.content[0]?.text).toContain('node-julie');
    expect(ambiguous.content[0]?.text).toContain('node-marc');
    expect(requestDrop).not.toHaveBeenCalled();

    const named = await tools.requestDrop({
      capability_id: 'mcp.answer.figma',
      owner_node_id: 'node-marc',
      input: { question: 'Où en est la maquette ?' },
      purpose: 'Préparer la revue de design',
    });
    expect(named.isError).toBeUndefined();
    expect(requestDrop).toHaveBeenCalledWith(expect.objectContaining({ ownerNodeId: 'node-marc' }));

    // An owner that does not publish this id is unknown; a fan-out checks every request before sending any.
    const unknown = await tools.requestDrop({
      capability_id: 'mcp.answer.figma',
      owner_node_id: 'node-nobody',
      input: { question: 'Où en est la maquette ?' },
      purpose: 'Préparer la revue de design',
    });
    expect(unknown.isError).toBe(true);
    requestDrop.mockClear();
    const fanOut = await tools.requestDrops({
      purpose: 'Préparer la revue de design',
      requests: [
        { capability_id: 'mcp.answer.figma', owner_node_id: 'node-julie', input: { question: 'Et la maquette ?' } },
        { capability_id: 'mcp.answer.figma', input: { question: 'Et la maquette ?' } },
      ],
    });
    expect(fanOut.isError).toBe(true);
    expect(requestDrop).not.toHaveBeenCalled();
  });
});
