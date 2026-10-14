/**
 * Sprite du chat assis : grille 20 x 20, un caractère par pixel.
 *
 * `.` transparent, `O` contour, `F` fourrure, `P` rose, `W` museau, `E` œil,
 * `H` reflet, `S` motif optionnel (rayures, taches ; retombe sur `F` si le pelage
 * n'en définit pas).
 */
export type Frame = readonly string[];

export const SPRITE_SIZE = 20;

/** Frames de référence, copiées telles quelles de la maquette. */
export const FRAMES = {
  sleep: [
    ".OO..........OO.....",
    ".OPO........OPO.....",
    ".OPPO......OPPO.....",
    ".OPPFOOOOOOFPPO.....",
    "OFFFFFFFFFFFFFFO....",
    "OFFFFFFFFFFFFFFO....",
    "OFFOOOFFFFOOOFFO....",
    "OFFFFFFFFFFFFFFO....",
    "OPPFFFWPPWFFFPPO....",
    "OFFFFWOWWOWFFFFO....",
    ".OFFFFWOOWFFFFO.....",
    "..OFFWWWWWWFFO......",
    ".OFFFWWWWWWFFFO..OO.",
    ".OFFFWWWWWWFFFO.OFO.",
    "OFFFFWWWWWWFFFFO.OFO",
    "OFFFFWWWWWWFFFFO.OFO",
    "OFFFOWWOOWWOFFFOOFO.",
    "OFFFOWWOOWWOFFFOFO..",
    "OFFOWWWOOWWWOFFOO...",
    ".OOOOOOOOOOOOOO.....",
  ],
  awake: [
    ".OO..........OO.....",
    ".OPO........OPO.....",
    ".OPPO......OPPO.....",
    ".OPPFOOOOOOFPPO.....",
    "OFFFFFFFFFFFFFFO....",
    "OFFHEFFFFFFHEFFO....",
    "OFFEEFFFFFFEEFFO....",
    "OFFFFFFFFFFFFFFO....",
    "OPPFFFWPPWFFFPPO....",
    "OFFFFWOWWOWFFFFO....",
    ".OFFFFWOOWFFFFO.....",
    "..OFFWWWWWWFFO......",
    ".OFFFWWWWWWFFFO..OO.",
    ".OFFFWWWWWWFFFO.OFO.",
    "OFFFFWWWWWWFFFFO.OFO",
    "OFFFFWWWWWWFFFFO.OFO",
    "OFFFOWWOOWWOFFFOOFO.",
    "OFFFOWWOOWWOFFFOFO..",
    "OFFOWWWOOWWWOFFOO...",
    ".OOOOOOOOOOOOOO.....",
  ],
} as const satisfies Record<string, Frame>;

export type Mood = keyof typeof FRAMES;

/** Couleur du halo ajouté autour de la silhouette en thème sombre. */
export const HALO = "#5c566a";

/**
 * Ajoute un halo d'1 pixel-sprite (code `R`) : chaque pixel transparent qui touche un
 * pixel plein (4 voisins) devient halo. La grille grandit de 2 dans chaque dimension.
 */
export function withHalo(rows: Frame): string[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const at = (x: number, y: number): string => {
    if (y < 1 || y > h || x < 1 || x > w) return ".";
    return rows[y - 1]?.[x - 1] ?? ".";
  };
  const out: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    let line = "";
    for (let x = 0; x < w + 2; x++) {
      const c = at(x, y);
      if (c !== ".") {
        line += c;
        continue;
      }
      const touches =
        at(x + 1, y) !== "." || at(x - 1, y) !== "." || at(x, y + 1) !== "." || at(x, y - 1) !== ".";
      line += touches ? "R" : ".";
    }
    out.push(line);
  }
  return out;
}

const haloCache = new WeakMap<Frame, string[]>();

/** Version avec halo d'une frame, calculée une seule fois par frame. */
export function haloFrame(rows: Frame): string[] {
  let cached = haloCache.get(rows);
  if (!cached) {
    cached = withHalo(rows);
    haloCache.set(rows, cached);
  }
  return cached;
}
