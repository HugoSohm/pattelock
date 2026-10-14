import { type Palette, pixelColor } from "./skins.ts";
import { type Frame, HALO, haloFrame, SPRITE_SIZE } from "./sprite.ts";

/** Position du pixel (0, 0) du sprite 20 x 20 dans une grille plus grande. */
export interface Origin {
  x: number;
  y: number;
}
const NO_ORIGIN: Origin = { x: 0, y: 0 };

/** Taille d'1 rem en px CSS (dans l'app : html { font-size: calc(100vw / 47.5) }). */
export function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Dessine le sprite dans un canvas avec une taille de pixel-sprite entière en pixels
 * écran : `basePx` est la taille à 760 px de large (5 pour le chat principal, 4 pour
 * les vignettes), mise à l'échelle de la fenêtre puis arrondie.
 */
export class SpriteCanvas {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private devicePx = 1;
  private dpr = 1;
  private last: { rows: Frame; palette: Palette; halo: boolean; origin: Origin } | null = null;
  /** Taille d'un pixel-sprite en px CSS. */
  cssPx = 5;

  constructor(
    private readonly basePx: number,
    cls = "sprite",
  ) {
    this.el = document.createElement("canvas");
    this.el.className = cls;
    this.el.setAttribute("aria-hidden", "true");
    const ctx = this.el.getContext("2d");
    if (!ctx) throw new Error("canvas 2D indisponible");
    this.ctx = ctx;
    this.updateScale();
  }

  /** Recalcule la taille de pixel ; renvoie `true` si elle a changé. */
  updateScale(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const devicePx = Math.max(1, Math.round(((this.basePx * remPx()) / 16) * dpr));
    if (devicePx === this.devicePx && dpr === this.dpr) return false;
    this.devicePx = devicePx;
    this.dpr = dpr;
    this.cssPx = devicePx / dpr;
    if (this.last) this.paint(this.last.rows, this.last.palette, this.last.halo, this.last.origin);
    return true;
  }

  /**
   * Dessine une grille. `origin` indique où se trouve le sprite 20 x 20 dans `rows`
   * (les frames animées ont une marge) : des marges négatives gardent le chat
   * exactement à la même place, quelle que soit la taille de la grille.
   */
  draw(rows: Frame, palette: Palette, halo: boolean, origin: Origin = NO_ORIGIN): void {
    const l = this.last;
    if (l && l.rows === rows && l.palette === palette && l.halo === halo && l.origin === origin) return;
    this.paint(rows, palette, halo, origin);
  }

  private paint(rows: Frame, palette: Palette, halo: boolean, origin: Origin): void {
    this.last = { rows, palette, halo, origin };
    const grid = halo ? haloFrame(rows) : rows;
    const cols = grid[0]?.length ?? SPRITE_SIZE;
    const lines = grid.length;
    // Le halo agrandit la grille d'1 pixel-sprite de chaque côté.
    const ox = origin.x + (halo ? 1 : 0);
    const oy = origin.y + (halo ? 1 : 0);
    const d = this.devicePx;
    const w = cols * d;
    const hgt = lines * d;
    if (this.el.width !== w) this.el.width = w;
    if (this.el.height !== hgt) this.el.height = hgt;
    const p = this.cssPx;
    this.el.style.width = `${w / this.dpr}px`;
    this.el.style.height = `${hgt / this.dpr}px`;
    this.el.style.margin = `${-oy * p}px ${-(cols - SPRITE_SIZE - ox) * p}px ${-(lines - SPRITE_SIZE - oy) * p}px ${-ox * p}px`;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, hgt);
    grid.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) {
        const color = pixelColor(line[x] ?? ".", palette, HALO);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x * d, y * d, d, d);
      }
    });
  }
}
