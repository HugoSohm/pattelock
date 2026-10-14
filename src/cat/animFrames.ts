/**
 * Construction des frames animées du chat, à partir de la grille 20 x 20 du chat assis.
 * Tout se fait en changeant des pixels : pas de rotation, pas de demi-pixel.
 *
 * Une frame est décrite par un `Pose` ; `buildFrame` la convertit en grille (avec une
 * colonne de marge à gauche et à droite pour que la tête puisse se pencher sans être
 * rognée) et la met en cache.
 */
import { FRAMES, SPRITE_SIZE } from "./sprite.ts";

export type Eyes =
  /** Pupille 2 x 2 : px = -1 | 0 | 1 (gauche, centre, droite), py = 0 | 1 (haut, bas). */
  | { kind: "open"; px: -1 | 0 | 1; py: 0 | 1 }
  | { kind: "closed" }
  | { kind: "half" }
  /** Œil gauche fermé, œil droit ouvert (réveil). */
  | { kind: "wink" };

export type Ear = "base" | "twitch" | "perk" | "turn";
export type Mouth = "none" | "yawn1" | "yawn2" | "mlem1" | "mlem2";
export type Tail = "base" | "tip" | "straight" | "hookHigh" | "right";
export type Paw = "none" | "mid" | "mouth" | "lick";

export interface Pose {
  eyes: Eyes;
  earL: Ear;
  earR: Ear;
  mouth: Mouth;
  tail: Tail;
  paw: Paw;
  /** Respiration : poitrail élargi et tête descendue d'1 pixel. */
  breath: boolean;
  /** Tête penchée (lignes 0 à 10 décalées d'1 pixel). */
  headShift: -1 | 0 | 1;
}

export interface AnimFrame {
  rows: string[];
  /** Position du pixel (0, 0) du sprite dans `rows`. */
  origin: { x: number; y: number };
}

export const BASE_POSE: Pose = {
  eyes: { kind: "open", px: 0, py: 0 },
  earL: "base",
  earR: "base",
  mouth: "none",
  tail: "base",
  paw: "none",
  breath: false,
  headShift: 0,
};

export const SLEEP_POSE: Pose = { ...BASE_POSE, eyes: { kind: "closed" } };

type Grid = string[][];

function put(g: Grid, x: number, y: number, c: string): void {
  const row = g[y];
  if (row && x >= 0 && x < row.length) row[x] = c;
}

/** Écrit un motif ; `.` dans le motif = transparent, `_` = ne pas toucher. */
function stamp(g: Grid, x0: number, y0: number, pattern: readonly string[]): void {
  pattern.forEach((line, dy) => {
    [...line].forEach((c, dx) => {
      if (c !== "_") put(g, x0 + dx, y0 + dy, c);
    });
  });
}

// ---------- Yeux (lignes 5 à 7, colonnes 2-5 et 10-13) ----------
const EYE_COLS = [3, 11] as const;

function drawEyes(g: Grid, eyes: Eyes): void {
  for (let y = 5; y <= 7; y++) {
    for (const x0 of [2, 10]) for (let x = x0; x < x0 + 4; x++) put(g, x, y, "F");
  }
  const open = (x: number, px: number, py: number) => {
    const cx = x + px;
    const cy = 5 + py;
    put(g, cx, cy, "H");
    put(g, cx + 1, cy, "E");
    put(g, cx, cy + 1, "E");
    put(g, cx + 1, cy + 1, "E");
  };
  const closed = (x: number) => {
    // Comme le sprite qui dort : un trait de 3 pixels sur la ligne 6.
    const start = x === 3 ? 3 : 10;
    for (let i = 0; i < 3; i++) put(g, start + i, 6, "O");
  };
  switch (eyes.kind) {
    case "open":
      for (const x of EYE_COLS) open(x, eyes.px, eyes.py);
      break;
    case "closed":
      for (const x of EYE_COLS) closed(x);
      break;
    case "half":
      for (const x of EYE_COLS) {
        put(g, x, 5, "O");
        put(g, x + 1, 5, "O");
        put(g, x, 6, "E");
        put(g, x + 1, 6, "E");
      }
      break;
    case "wink":
      closed(3);
      open(11, 0, 0);
      break;
  }
}

// ---------- Oreilles (lignes 0 à 3) ----------
const EARS_L: Record<Ear, readonly string[]> = {
  base: [".OO...", ".OPO..", ".OPPO.", ".OPPF_"],
  twitch: ["OO....", ".OPO..", ".OPPO.", ".OPPF_"],
  perk: ["..OO..", ".OPO..", ".OPPO.", ".OPPF_"],
  turn: ["......", "OOO...", ".OPPO.", ".OPPF_"],
};
// Oreille droite = miroir de la gauche (colonnes 10 à 15).
const mirror = (p: readonly string[]): string[] => p.map((l) => [...l].reverse().join(""));
const EARS_R: Record<Ear, readonly string[]> = {
  base: mirror(EARS_L.base),
  twitch: mirror(EARS_L.twitch),
  perk: mirror(EARS_L.perk),
  turn: mirror(EARS_L.turn),
};

// ---------- Bouche (lignes 9 à 12, colonnes 6 à 9) ----------
const MOUTHS: Record<Exclude<Mouth, "none">, readonly string[]> = {
  yawn1: ["_OO_", "OPPO", "_OO_"],
  yawn2: ["_OO_", "OPPO", "OPPO", "_OO_"],
  mlem1: ["____", "_PP_"],
  mlem2: ["____", "_OO_", "__P_", "____"],
};

// ---------- Queue (colonnes 16 à 19, la colonne 15 appartient au corps) ----------
const TAILS: Record<Tail, { top: number; rows: readonly string[] }> = {
  base: { top: 12, rows: [".OO.", "OFO.", ".OFO", ".OFO", "OFO.", "FO..", "O..."] },
  tip: { top: 12, rows: ["..OO", ".OFO", ".OFO", ".OFO", "OFO.", "FO..", "O..."] },
  straight: { top: 11, rows: [".O..", "OFO.", "OFO.", "OFO.", "OFO.", "FO..", "FO..", "O..."] },
  hookHigh: { top: 10, rows: [".OO.", "OFO.", ".OFO", ".OFO", "OFO.", "OFO.", "FO..", "FO..", "O..."] },
  right: { top: 14, rows: ["..OO", ".OFO", "OFO.", "FO..", "O..."] },
};

function drawTail(g: Grid, tail: Tail, ox: number): void {
  for (let y = 9; y <= 18; y++) for (let x = 16; x <= 19; x++) put(g, x + ox, y, ".");
  const t = TAILS[tail];
  t.rows.forEach((line, dy) => {
    [...line].forEach((c, dx) => {
      put(g, 16 + dx + ox, t.top + dy, c);
    });
  });
}

// ---------- Patte avant droite levée (toilette) ----------
function drawPaw(g: Grid, paw: Paw): void {
  if (paw === "none") return;
  // La patte droite quitte le sol : on comble l'espace entre les deux pattes.
  put(g, 8, 16, "W");
  put(g, 8, 17, "W");
  put(g, 8, 18, "W");
  const top = paw === "mid" ? 12 : 10;
  stamp(g, 8, top, ["_OO_", "OWWO", "OWWO", "_OO_"]);
  if (paw === "lick") {
    put(g, 8, top + 1, "P");
  }
}

/** Dernière colonne (marge comprise) occupée par la tête. */
const HEAD_MAX_X = 16;

/** Déplace la tête (lignes 0 à 10) d'un nombre entier de pixels ; queue et pattes restent. */
function shiftHead(out: Grid, dx: number, dy: number): void {
  const src = out.map((r) => [...r]);
  for (let y = 0; y <= 10 + dy; y++) for (let x = 0; x <= HEAD_MAX_X; x++) put(out, x, y, ".");
  for (let sy = 0; sy <= 10; sy++) {
    for (let sx = 0; sx <= HEAD_MAX_X; sx++) {
      const c = src[sy]?.[sx] ?? ".";
      if (c !== ".") put(out, sx + dx, sy + dy, c);
    }
  }
}

function toGrid(rows: readonly string[]): Grid {
  return rows.map((r) => [...r]);
}

/** Construit la grille d'une pose (sans cache). */
export function composeFrame(p: Pose): AnimFrame {
  const g = toGrid(FRAMES.awake);
  drawEyes(g, p.eyes);
  stamp(g, 0, 0, EARS_L[p.earL]);
  stamp(g, 10, 0, EARS_R[p.earR]);
  if (p.mouth !== "none") stamp(g, 6, 9, MOUTHS[p.mouth]);
  drawPaw(g, p.paw);

  // Marge d'1 colonne à gauche et à droite.
  const PAD = 1;
  const W = SPRITE_SIZE + 2 * PAD;
  let out: Grid = g.map((row) => [".", ...row, "."]);
  drawTail(out, p.tail, PAD);

  if (p.breath) {
    // Poitrail plus large d'1 pixel de chaque côté (lignes 12 à 15).
    for (let y = 12; y <= 15; y++) {
      if (out[y]?.[4 + PAD] === "F") put(out, 4 + PAD, y, "W");
      if (out[y]?.[11 + PAD] === "F") put(out, 11 + PAD, y, "W");
    }
  }

  if (p.headShift !== 0) shiftHead(out, p.headShift, 0);
  if (p.breath) shiftHead(out, 0, 1);

  out = out.map((r) => r.slice(0, W));
  return { rows: out.map((r) => r.join("")), origin: { x: PAD, y: 0 } };
}

const cache = new Map<string, AnimFrame>();

/** Frame d'une pose, construite une seule fois. */
export function buildFrame(p: Pose): AnimFrame {
  const key = JSON.stringify(p);
  let f = cache.get(key);
  if (!f) {
    f = composeFrame(p);
    cache.set(key, f);
  }
  return f;
}
