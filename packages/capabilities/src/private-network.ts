import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { assertPrivateDestination, DropError, type PrivateNetwork } from '@drop/protocol';

/** The largest request body sent to a private destination. */
const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

/** Direct sockets only: no environment proxy, redirects, DNS or global fetch dispatcher. */
export function privateFetch(policy: PrivateNetwork, source: string): typeof fetch {
  return async (input, init) => {
    // Validate before Request normalizes aliases and before reading a request body.
    const raw = input instanceof Request ? input.url : String(input);
    const url = assertPrivateDestination(raw, policy, source);
    if (!['http:', 'https:'].includes(url.protocol)) throw new DropError('E_DENIED', 'E_DENIED HTTP required');
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
    if (body && body.length > MAX_REQUEST_BODY_BYTES) throw new DropError('E_TOO_LARGE');
    const headers = Object.fromEntries(request.headers);
    delete headers.host;
    headers['accept-encoding'] = 'identity';
    return new Promise<Response>((resolve, reject) => {
      const call = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          method: request.method,
          headers,
          signal: request.signal,
          agent: false,
        },
        (response) => {
          const status = response.statusCode ?? 500;
          if (status >= 300 && status < 400) {
            response.destroy();
            reject(new DropError('E_DENIED', 'E_DENIED redirect'));
            return;
          }
          if (status < 200 || status > 599) {
            response.destroy();
            reject(new DropError('E_RUNNER', 'E_RUNNER invalid endpoint status'));
            return;
          }
          const responseHeaders = new Headers();
          for (let i = 0; i < response.rawHeaders.length; i += 2) {
            const name = response.rawHeaders[i];
            const value = response.rawHeaders[i + 1];
            if (name !== undefined && value !== undefined) responseHeaders.append(name, value);
          }
          const empty = request.method === 'HEAD' || [204, 205, 304].includes(status);
          if (empty) response.resume();
          resolve(
            new Response(empty ? null : (Readable.toWeb(response) as ReadableStream<Uint8Array>), {
              status,
              headers: responseHeaders,
            }),
          );
        },
      );
      call.on('error', () => {
        reject(new DropError('E_RUNNER', 'E_RUNNER private endpoint unavailable'));
      });
      call.end(body);
    });
  };
}
