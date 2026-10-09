import { createHash, randomBytes } from 'node:crypto';
import { canonical } from './canonical.ts';

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64url'));
}

export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/** UUID v7: 48-bit ms timestamp, version and variant bits, random tail (RFC 9562). */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Returns the embedded millisecond timestamp only for a canonical UUIDv7. */
export function uuidv7Timestamp(id: string): number | undefined {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return undefined;
  }
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
