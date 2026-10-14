// Génère scripts/macos/dmg-background.png (800 x 625) dans le style pixel de l'app :
// flèche de l'app vers Applications, petit chat qui dort sur la bande clavier.
//
//   node scripts/macos/make-dmg-background.mjs
//
// Repères (fenêtre Finder de build.sh) : app à {200, 250}, Applications à {600, 250},
// instructions.txt à {400, 110}. Un pixel-sprite = 5 px.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SKINS } from "../../src/cat/skins.ts";
import { FRAMES } from "../../src/cat/sprite.ts";
import { encodePng, grid, rgba, stamp } from "../lib/png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PX = 5;
const W = 800 / PX;
const H = 625 / PX;

const BG = rgba("#fbfaf7");
const INK = rgba("#1f1b24");
const LINE = rgba("#ebe6dd");
const STRIP = rgba("#f1ede6");
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

// Bande clavier crantée (coins vides) sous le chat.
const sx0 = 50;
const sx1 = 110;
const sy0 = 114;
const sy1 = 120;
for (let y = sy0; y <= sy1; y++) {
  for (let x = sx0; x <= sx1; x++) {
    const edgeX = x === sx0 || x === sx1;
    const edgeY = y === sy0 || y === sy1;
    if (edgeX && edgeY) continue;
    g[y][x] = edgeX || edgeY ? INK : STRIP;
  }
}
// Touches de la bande (bloquées : encre + LED accent).
for (let k = 0; k < 9; k++) {
  const kx = sx0 + 3 + k * 6;
  for (let y = sy0 + 2; y <= sy0 + 4; y++) for (let x = kx; x < kx + 4; x++) g[y][x] = INK;
  g[sy0 + 2][kx + 3] = ACCENT;
}
// Trait léger sous la zone des icônes.
for (let x = 20; x < W - 20; x++) g[78][x] = LINE;

// Chat qui dort, posé sur la bande, et ses « z ».
const noir = SKINS[0].palette;
stamp(g, FRAMES.sleep, 72, sy0 - 20, (ch) => (ch in noir ? rgba(noir[ch]) : null));
stamp(g, ["XXX", "..X", ".X.", "XXX"], 89, 88, (c) => (c === "X" ? ACCENT : null));
stamp(g, ["XXXX", "...X", "..X.", ".X..", "XXXX"], 93, 83, (c) => (c === "X" ? ACCENT : null));

writeFileSync(join(HERE, "dmg-background.png"), encodePng(g, PX));
console.log("dmg-background.png généré (800 x 625)");
