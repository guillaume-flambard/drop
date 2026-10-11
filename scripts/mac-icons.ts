// Draws the Mac app's icons as PNG, with no image library: a teardrop, the product's mark (T2.4).
//   apps/desktop/src-tauri/icons/app-icon.png   1024 px, white drop on a teal rounded square (input of `tauri icon`)
//   apps/desktop/src-tauri/icons/tray.png       44 px, black drop on transparent, used as a macOS template image
// Usage: node scripts/mac-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

type Rgba = [number, number, number, number];

function png(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const at = y * (width * 4 + 1) + 1 + x * 4;
      rows[at] = r;
      rows[at + 1] = g;
      rows[at + 2] = b;
      rows[at + 3] = a;
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** True inside a teardrop: a circle of radius r at (cx, cy) and the cone up to a tip at distance d above it. */
function inDrop(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  if (dx * dx + dy * dy <= r * r) return true;
  const d = 1.9 * r;
  const tx = x - cx;
  const ty = y - (cy - d);
  const length = Math.hypot(tx, ty);
  if (ty <= 0 || length > Math.sqrt(d * d - r * r)) return false;
  return Math.abs(Math.atan2(tx, ty)) <= Math.asin(r / d);
}

/** Coverage of a pixel by a shape, 4×4 supersampled, for smooth edges. */
function coverage(x: number, y: number, inside: (px: number, py: number) => boolean): number {
  let hits = 0;
  for (let i = 0; i < 4; i += 1)
    for (let j = 0; j < 4; j += 1) if (inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) hits += 1;
  return hits / 16;
}

function inRoundedSquare(x: number, y: number, size: number, margin: number, radius: number): boolean {
  const min = margin + radius;
  const max = size - margin - radius;
  const qx = Math.min(Math.max(x, min), max);
  const qy = Math.min(Math.max(y, min), max);
  return (
    (x - qx) ** 2 + (y - qy) ** 2 <= radius * radius &&
    x >= margin &&
    x <= size - margin &&
    y >= margin &&
    y <= size - margin
  );
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'desktop', 'src-tauri', 'icons');
mkdirSync(dir, { recursive: true });

const size = 1024;
writeFileSync(
  join(dir, 'app-icon.png'),
  png(size, size, (x, y) => {
    const square = coverage(x, y, (px, py) => inRoundedSquare(px, py, size, 100, 180));
    const drop = coverage(x, y, (px, py) => inDrop(px, py, 512, 600, 190));
    if (square === 0) return [0, 0, 0, 0];
    // Teal ground (#0E5F58), white drop blended by coverage.
    const mix = (from: number, to: number): number => Math.round(from + (to - from) * drop);
    return [mix(14, 255), mix(95, 255), mix(88, 255), Math.round(255 * square)];
  }),
);
const tray = 44;
writeFileSync(
  join(dir, 'tray.png'),
  png(tray, tray, (x, y) => [0, 0, 0, Math.round(255 * coverage(x, y, (px, py) => inDrop(px, py, 22, 27, 10)))]),
);
process.stdout.write(`icons written to ${dir}\n`);
