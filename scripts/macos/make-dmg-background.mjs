// Génère scripts/macos/dmg-background.png (800 x 625) dans le style pixel de l'app :
// flèche de l'app vers Applications, et la patte de Pattelock.
//
//   node scripts/macos/make-dmg-background.mjs
//
// Repères (fenêtre Finder de build.sh) : app à {200, 250}, Applications à {600, 250},
// instructions.txt à {400, 110}. Un pixel-sprite = 5 px.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, grid, rgba } from "../lib/png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PX = 5;
const W = 800 / PX;
const H = 625 / PX;

const BG = rgba("#fbfaf7");
const INK = rgba("#1f1b24");
const LINE = rgba("#ebe6dd");
const ACCENT = rgba("#ff9548");

const g = grid(W, H);
for (const row of g) row.fill(BG);

// Flèche en pointillés de l'app (x = 40) vers Applications (x = 120), à y = 50.
for (let x = 56; x <= 97; x++) {
  if (Math.floor((x - 56) / 3) % 2 === 0) {
    g[49][x] = INK;
    g[50][x] = INK;
  }
}
// Pointe : triangle de 7 colonnes, de 2 pixels de haut à la pointe à 14 à la base.
for (let d = 0; d <= 6; d++) {
  for (let y = 49 - d; y <= 50 + d; y++) g[y][105 - d] = INK;
}

// Trait léger sous la zone des icônes.
for (let x = 20; x < W - 20; x++) g[78][x] = LINE;

// La patte de Pattelock (4 pixels-sprite par pixel de patte), cernée d'encre, en bas au centre.
const PAW = ["#.#.#", ".....", ".###.", "#####", ".###."];
const K = 4;
const ox = (W - 5 * K) / 2;
const oy = 94;
const filled = (x, y) => {
  const px = Math.floor((x - ox) / K);
  const py = Math.floor((y - oy) / K);
  return x >= ox && y >= oy && PAW[py]?.[px] === "#";
};
for (let y = oy - 1; y <= oy + 5 * K; y++) {
  for (let x = ox - 1; x <= ox + 5 * K; x++) {
    if (filled(x, y)) g[y][x] = ACCENT;
    else if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) g[y][x] = INK;
  }
}

writeFileSync(join(HERE, "dmg-background.png"), encodePng(g, PX));
console.log("dmg-background.png généré (800 x 625)");
