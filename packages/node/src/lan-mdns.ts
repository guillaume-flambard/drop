/**
 * mDNS discovery for the local network mode (T4.2, D61; T4.2c, D67): announces `_drop._tcp` under a random name with
 * rotating tags only (never the node id), republished when they change, and keeps the private addresses of what it
 * hears. bonjour-service is plain JavaScript (MIT, no native addon). An announcement is only a hint: the session
 * handshake proves who answers (lan.ts).
 */
import { randomBytes } from 'node:crypto';
import Bonjour, { type Service } from 'bonjour-service';
import { LAN_SERVICE_TYPE, privateAddresses, type LanDiscovery, type LanPeer } from './lan.ts';
import { LAN_EPOCH_MS, MAX_INVITE_TAGS, type LanAnnouncement } from './lan-tags.ts';

const TAG = /^[A-Za-z0-9_-]{22}$/;
/** Announcements are free to send: bound what a noisy network can make this node remember. */
const MAX_SEEN = 256;
/** A new invite must be findable within seconds; comparing two short strings this often costs nothing. */
const REPUBLISH_CHECK_MS = 5_000;

/** An announcement older than two periods and two minutes is stale: its tag can no longer be recognized. */
const SEEN_TTL_MS = 2 * LAN_EPOCH_MS + 2 * 60_000;

/**
 * What this node heard on the network (T4.2c review): bounded, newest first, stale entries dropped. Names rotate
 * every period and goodbyes get lost, so nothing may rely on `down` to keep it small.
 */
export class SeenAnnouncements {
  private readonly entries = new Map<string, { announcement: LanAnnouncement; peer: LanPeer; at: number }>();

  private readonly max: number;

  constructor(max: number = MAX_SEEN) {
    this.max = max;
  }

  add(name: string, announcement: LanAnnouncement, peer: LanPeer, now: number): void {
    this.prune(now);
    this.entries.delete(name);
    if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(name, { announcement, peer, at: now });
  }

  remove(name: string): void {
    this.entries.delete(name);
  }

  /** Every matching peer, newest first: a stale or copied announcement must not hide the live one. */
  find(matches: (seen: LanAnnouncement) => boolean, now: number): LanPeer[] {
    this.prune(now);
    return [...this.entries.values()]
      .filter((entry) => matches(entry.announcement))
      .reverse()
      .map((entry) => entry.peer);
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    for (const [name, entry] of this.entries) if (now - entry.at > SEEN_TTL_MS) this.entries.delete(name);
  }
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  return Buffer.isBuffer(value) ? value.toString('utf8') : '';
}

/** Reads the v2 TXT record; anything else (the former fixed-id format included) is ignored. */
function announcementOf(service: Service): LanAnnouncement | undefined {
  const txt = (service.txt ?? {}) as Record<string, unknown>;
  if (text(txt.v) !== '2') return undefined;
  const tag = text(txt.t);
  if (!TAG.test(tag)) return undefined;
  const invites = text(txt.i)
    .split(',')
    .filter((item) => TAG.test(item))
    .slice(0, MAX_INVITE_TAGS);
  return { tag, invites };
}

export function mdnsDiscovery(): LanDiscovery {
  let bonjour: Bonjour | undefined;
  let checker: ReturnType<typeof setInterval> | undefined;
  const seen = new SeenAnnouncements();
  const own = { name: '', key: '' };
  return {
    start: (self, onError) =>
      new Promise((resolve) => {
        // Multicast send errors (EHOSTUNREACH, EPERM) are how a refused macOS local network permission shows up.
        const current = new Bonjour({}, (error: unknown) => {
          onError?.(error instanceof Error ? error.message : String(error));
        });
        bonjour = current;
        const publish = () => {
          const announcement = self.announcement();
          const key = `${announcement.tag}|${announcement.invites.join(',')}`;
          if (key === own.key) return;
          current.unpublishAll();
          // A fresh random name and host with each new tag. The port and the addresses stay those of this process:
          // on one network, an observer can still link periods by them (D67).
          own.name = `drop-${randomBytes(8).toString('hex')}`;
          own.key = key;
          current.publish({
            name: own.name,
            type: LAN_SERVICE_TYPE,
            port: self.port,
            // The default host is this computer's name (« MacBook-de-… »): stable and personal, so never announced.
            host: `${own.name}.local`,
            // A global IPv6 address is routable and long-lived; sessions only use private IPv4 and ULA.
            disableIPv6: true,
            txt: { v: '2', t: announcement.tag, i: announcement.invites.join(',') },
          });
        };
        publish();
        checker = setInterval(publish, REPUBLISH_CHECK_MS);
        const browser = current.find({ type: LAN_SERVICE_TYPE });
        browser.on('up', (service: Service) => {
          if (service.name === own.name) return;
          const announcement = announcementOf(service);
          if (!announcement) return;
          seen.add(
            service.name,
            announcement,
            { addresses: privateAddresses(service.addresses ?? []), port: service.port },
            Date.now(),
          );
        });
        browser.on('down', (service: Service) => {
          seen.remove(service.name);
        });
        resolve();
      }),
    find: (matches) => seen.find(matches, Date.now()),
    stop: () =>
      new Promise((resolve) => {
        clearInterval(checker);
        const current = bonjour;
        bonjour = undefined;
        seen.clear();
        own.key = '';
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
