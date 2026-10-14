// Génère les icônes de Pattelock à partir du sprite du chat assis (pelage noir).
//
//   node scripts/make-icons.mjs
//
// Produit src-tauri/icons/app-icon.png (1024 x 1024, source de `tauri icon`) et les
// icônes du tray dans src-tauri/icons/tray/. Aucune dépendance : encodeur PNG maison.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { SKINS } from "../src/cat/skins.ts";
import { FRAMES } from "../src/cat/sprite.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = join(ROOT, "src-tauri", "icons");

// ---------- PNG ----------
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
function encodePng(pixels, scale) {
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
function rgba(hex, a = 255) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, a];
}

// ---------- Grille ----------
function grid(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}
function stamp(g, rows, ox, oy, colorOf) {
  rows.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      const c = colorOf(ch);
      if (c && g[oy + y] && ox + x < g[0].length) g[oy + y][ox + x] = c;
    });
  });
}

const BG = rgba("#fbfaf7");
const INK = rgba("#1f1b24");
const ACCENT = rgba("#ff9548");
const noir = SKINS[0].palette;

const Z_SMALL = ["XXX", "..X", ".X.", "XXX"];
const Z_BIG = ["XXXX", "...X", "..X.", ".X..", "XXXX"];

// ---------- Icône de l'app : tuile crème crantée, chat qui dort sur la bande ----------
function appIcon() {
  const N = 32;
  const g = grid(N, N);
  // Tuile x/y 1..30 : contour encre 1 cellule, coins crantés (cellule d'angle vide).
  for (let y = 1; y <= 30; y++) {
    for (let x = 1; x <= 30; x++) {
      const edgeX = x === 1 || x === 30;
      const edgeY = y === 1 || y === 30;
      if (edgeX && edgeY) continue;
      g[y][x] = edgeX || edgeY ? INK : BG;
    }
  }
  // Bande clavier sous le chat.
  for (let y = 25; y <= 27; y++) for (let x = 3; x <= 28; x++) g[y][x] = INK;
  for (const x of [6, 10, 14, 18, 22, 26]) g[26][x] = ACCENT;
  // Chat qui dort, ligne du bas posée sur la bande.
  stamp(g, FRAMES.sleep, 6, 5, (ch) => (ch in noir ? rgba(noir[ch]) : null));
  // « z Z »
  stamp(g, Z_SMALL, 23, 9, (ch) => (ch === "X" ? ACCENT : null));
  stamp(g, Z_BIG, 25, 2, (ch) => (ch === "X" ? ACCENT : null));
  return g;
}

// ---------- Tray : silhouette monochrome, yeux en creux ----------
// `mood` : "sleep" (protection active) ou "awake" (pause).
function trayIcon(mood, color) {
  const rows = FRAMES[mood];
  const g = grid(22, 22);
  // Silhouette pleine sauf les yeux (E, H et paupières fermées) laissés transparents.
  rows.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      if (ch === ".") return;
      const eyeRow = y === 5 || y === 6;
      const hole = (eyeRow && (ch === "E" || ch === "H")) || (y === 6 && mood === "sleep" && ch === "O" && x > 1 && x < 14);
      if (!hole) g[y + 1][x + 1] = color;
    });
  });
  return g;
}

mkdirSync(join(ICONS, "tray"), { recursive: true });
writeFileSync(join(ICONS, "app-icon.png"), encodePng(appIcon(), 32));

const TRAY_VARIANTS = {
  // Barre des tâches / barre de menus claire : chat sombre.
  light: rgba("#1f1b24"),
  // Barre sombre : chat clair.
  dark: rgba("#f4f1ec"),
  // macOS : image « template », seule l'opacité compte.
  template: rgba("#000000"),
};
for (const [variant, color] of Object.entries(TRAY_VARIANTS)) {
  for (const mood of ["sleep", "awake"]) {
    const g = trayIcon(mood, color);
    writeFileSync(join(ICONS, "tray", `${mood}-${variant}.png`), encodePng(g, 2));
  }
}
console.log("icônes générées dans", ICONS);
