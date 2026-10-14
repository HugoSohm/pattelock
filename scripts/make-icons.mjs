// Génère les icônes de Pattelock à partir de la patte de la maquette.
//
//   node scripts/make-icons.mjs
//
// Produit src-tauri/icons/app-icon.png (1024 x 1024, source de `tauri icon`) et les
// icônes du tray dans src-tauri/icons/tray/. Aucune dépendance : encodeur PNG maison.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, grid, rgba } from "./lib/png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = join(ROOT, "src-tauri", "icons");

const BG = rgba("#fbfaf7");
const INK = rgba("#1f1b24");
const ACCENT = rgba("#ff9548");

/** La patte de la maquette (5 x 5), marque de Pattelock. */
const PAW = ["#.#.#", ".....", ".###.", "#####", ".###."];

/** Patte agrandie : chaque pixel devient un carré de `k` x `k`. */
function pawMask(k) {
  return PAW.flatMap((line) => {
    const row = [...line].flatMap((c) => Array(k).fill(c === "#"));
    return Array.from({ length: k }, () => row);
  });
}

// ---------- Icône de l'app : tuile crème crantée, grande patte orange cernée d'encre ----------
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
  // Patte 20 x 20 (4 cellules par pixel), centrée, avec un liseré encre d'une cellule.
  const mask = pawMask(4);
  const ox = 6;
  const oy = 6;
  const filled = (x, y) => mask[y - oy]?.[x - ox] === true;
  for (let y = oy - 1; y <= oy + 20; y++) {
    for (let x = ox - 1; x <= ox + 20; x++) {
      if (filled(x, y)) g[y][x] = ACCENT;
      else if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) g[y][x] = INK;
    }
  }
  return g;
}

// ---------- Tray : patte monochrome, pleine (blocage actif) ou en contour (pause) ----------
// 32 x 32 px, 6 px par pixel de patte : à 16 px (Windows 100 %), 3 px par pixel, net.
function trayIcon(active, color) {
  const mask = pawMask(6);
  const g = grid(32, 32);
  const filled = (x, y) => mask[y]?.[x] === true;
  const T = 2; // épaisseur du contour en pause (1 px une fois réduit à 16 px)
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 30; x++) {
      if (!filled(x, y)) continue;
      let inner = true;
      for (let dy = -T; dy <= T && inner; dy++) {
        for (let dx = -T; dx <= T; dx++) {
          if (!filled(x + dx, y + dy)) {
            inner = false;
            break;
          }
        }
      }
      if (active || !inner) g[y + 1][x + 1] = color;
    }
  }
  return g;
}

mkdirSync(join(ICONS, "tray"), { recursive: true });
writeFileSync(join(ICONS, "app-icon.png"), encodePng(appIcon(), 32));

const TRAY_VARIANTS = {
  // Barre des tâches / barre de menus claire : patte sombre.
  light: rgba("#1f1b24"),
  // Barre sombre : patte claire.
  dark: rgba("#f4f1ec"),
  // macOS : image « template », seule l'opacité compte.
  template: rgba("#000000"),
};
// Noms de fichiers : « sleep » = blocage actif, « awake » = pause (le chat de l'UI).
for (const [variant, color] of Object.entries(TRAY_VARIANTS)) {
  writeFileSync(join(ICONS, "tray", `sleep-${variant}.png`), encodePng(trayIcon(true, color), 1));
  writeFileSync(join(ICONS, "tray", `awake-${variant}.png`), encodePng(trayIcon(false, color), 1));
}
console.log("icônes générées dans", ICONS);
