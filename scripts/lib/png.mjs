// Encodeur PNG minimal (RGBA, sans dépendance) et petits outils de grille pixel art.
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** `pixels` : tableau de lignes, chaque cellule `[r,g,b,a]` ou `null`. */
export function encodePng(pixels, scale) {
  const h = pixels.length * scale;
  const w = (pixels[0]?.length ?? 0) * scale;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = pixels[Math.floor(y / scale)];
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const px = row[Math.floor(x / scale)] ?? [0, 0, 0, 0];
      raw.set(px, y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export function rgba(hex, a = 255) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, a];
}


export function grid(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

/** Écrit un motif de caractères dans la grille ; `colorOf` donne la couleur de chaque caractère. */
export function stamp(g, rows, ox, oy, colorOf) {
  rows.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      const c = colorOf(ch);
      if (c && g[oy + y] && ox + x >= 0 && ox + x < g[0].length) g[oy + y][ox + x] = c;
    });
  });
}
