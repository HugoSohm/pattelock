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

// ---------- Icône de l'app : disque crème en pixels, patte orange cernée d'encre ----------
// Grille de 64 cases (16 px chacune) : la patte occupe la moitié du diamètre, sans toucher
// le bord. Contour du disque et liseré de la patte font 2 cases.
function appIcon() {
  const N = 64;
  const g = grid(N, N);
  const c = (N - 1) / 2;
  const inDisc = (x, y, r) => (x - c) ** 2 + (y - c) ** 2 <= r ** 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!inDisc(x, y, N / 2)) continue;
      g[y][x] = inDisc(x, y, N / 2 - 2) ? BG : INK;
    }
  }
  const K = 6;
  const mask = pawMask(K);
  const o = (N - 5 * K) / 2;
  const filled = (x, y) => mask[y - o]?.[x - o] === true;
  const near = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (filled(x + dx, y + dy)) return true;
    return false;
  };
  for (let y = o - 2; y < o + 5 * K + 2; y++) {
    for (let x = o - 2; x < o + 5 * K + 2; x++) {
      if (filled(x, y)) g[y][x] = ACCENT;
      else if (near(x, y)) g[y][x] = INK;
    }
  }
  return g;
}

// ---------- Tray : patte pleine, orange (actif) ou grise (pause) ----------
// 32 x 32 px, 6 px par pixel de patte : à 16 px (Windows 100 %), chaque doigt reste un
// carré plein de 3 px. Pas de liseré : à cette taille il mangerait les doigts.
const LED_OFF = rgba("#b9b3bf");

function trayIcon(fill) {
  const mask = pawMask(6);
  const g = grid(32, 32);
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 30; x++) {
      if (mask[y][x]) g[y + 1][x + 1] = fill;
    }
  }
  return g;
}

mkdirSync(join(ICONS, "tray"), { recursive: true });
writeFileSync(join(ICONS, "app-icon.png"), encodePng(appIcon(), 16));
// Comme le badge de l'app : orange quand le blocage est actif, gris en pause.
writeFileSync(join(ICONS, "tray", "active.png"), encodePng(trayIcon(ACCENT), 1));
writeFileSync(join(ICONS, "tray", "paused.png"), encodePng(trayIcon(LED_OFF), 1));
console.log("icônes générées dans", ICONS);
