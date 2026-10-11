import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { httpLocalNode } from '../src/client.ts';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      resolve();
    });
  });
  server = undefined;
});

async function serve(status: number, contentType: string, body: string): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': contentType }).end(body);
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;
}

describe('local node client', () => {
  it('reports an error page that is not JSON with a stable code and a French message', async () => {
    const node = httpLocalNode(await serve(502, 'text/html', '<html><body>Bad gateway</body></html>'), 't');
    await expect(node.capabilities()).rejects.toMatchObject({
      code: 'E_LOCAL_NODE',
      status: 502,
      message: 'E_LOCAL_NODE le nœud local a répondu 502 sans JSON lisible.',
    });
  });

  it('reports a JSON refusal from the local node with its status and body', async () => {
    const node = httpLocalNode(await serve(401, 'application/json', '{"error":"unauthorized"}'), 't');
    await expect(node.capabilities()).rejects.toMatchObject({
      code: 'E_LOCAL_NODE',
      status: 401,
      message: 'E_LOCAL_NODE le nœud local a refusé l’appel (401) : {"error":"unauthorized"}',
    });
  });

  it('reports a success that is not JSON with a stable code', async () => {
    const node = httpLocalNode(await serve(200, 'text/plain', 'ok'), 't');
    await expect(node.capabilities()).rejects.toMatchObject({
      code: 'E_LOCAL_NODE',
      message: 'E_LOCAL_NODE le nœud local a répondu 200 sans JSON lisible.',
    });
  });
});
