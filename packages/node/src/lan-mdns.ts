/**
 * mDNS discovery for the local network mode (T4.2, D61): announces `_drop._tcp` with this node's id in TXT, and
 * keeps the private addresses of the peers it hears. bonjour-service is plain JavaScript (MIT, no native addon).
 * An announcement is only a hint: the session handshake proves who answers (lan.ts).
 */
import Bonjour from 'bonjour-service';
import { LAN_SERVICE_TYPE, privateAddresses, type LanDiscovery, type LanPeer } from './lan.ts';

const NODE_ID = /^[A-Za-z0-9_-]{43}$/;
/** Announcements are free to send: bound what a noisy network can make this node remember. */
const MAX_PEERS = 256;

export function mdnsDiscovery(): LanDiscovery {
  let bonjour: Bonjour | undefined;
  const peers = new Map<string, LanPeer>();
  return {
    start: (self, onError) =>
      new Promise((resolve) => {
        // Multicast send errors (EHOSTUNREACH, EPERM) are how a refused macOS local network permission shows up.
        bonjour = new Bonjour({}, (error: unknown) => {
          onError?.(error instanceof Error ? error.message : String(error));
        });
        bonjour.publish({
          name: `drop-${self.nodeId.slice(0, 16)}`,
          type: LAN_SERVICE_TYPE,
          port: self.port,
          txt: { id: self.nodeId, v: '1' },
        });
        const browser = bonjour.find({ type: LAN_SERVICE_TYPE });
        browser.on('up', (service) => {
          const id: unknown = (service.txt as Record<string, unknown> | undefined)?.id;
          if (typeof id !== 'string' || !NODE_ID.test(id) || id === self.nodeId) return;
          if (!peers.has(id) && peers.size >= MAX_PEERS) return;
          peers.set(id, { nodeId: id, addresses: privateAddresses(service.addresses ?? []), port: service.port });
        });
        browser.on('down', (service) => {
          const id: unknown = (service.txt as Record<string, unknown> | undefined)?.id;
          if (typeof id === 'string') peers.delete(id);
        });
        resolve();
      }),
    lookup: (nodeId) => peers.get(nodeId),
    stop: () =>
      new Promise((resolve) => {
        const current = bonjour;
        bonjour = undefined;
        peers.clear();
        if (!current) {
          resolve();
          return;
        }
        current.unpublishAll(() => {
          current.destroy(() => {
            resolve();
          });
        });
      }),
  };
}
