import { type Palette, pixelColor } from "./skins.ts";
import { type Frame, HALO, haloFrame, SPRITE_SIZE } from "./sprite.ts";

/** Taille d'1 rem en px CSS (html { font-size: calc(100vw / 47.5) }). */
export function remPx(): number {
  return window.innerWidth / 47.5;
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
  private last: { rows: Frame; palette: Palette; halo: boolean } | null = null;
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
    if (this.last) this.paint(this.last.rows, this.last.palette, this.last.halo);
    return true;
  }

  draw(rows: Frame, palette: Palette, halo: boolean): void {
    const l = this.last;
    if (l && l.rows === rows && l.palette === palette && l.halo === halo) return;
    this.paint(rows, palette, halo);
  }

  private paint(rows: Frame, palette: Palette, halo: boolean): void {
    this.last = { rows, palette, halo };
    const grid = halo ? haloFrame(rows) : rows;
    const cols = halo ? SPRITE_SIZE + 2 : SPRITE_SIZE;
    const d = this.devicePx;
    const size = cols * d;
    if (this.el.width !== size) {
      this.el.width = size;
      this.el.height = size;
    }
    const css = `${size / this.dpr}px`;
    this.el.style.width = css;
    this.el.style.height = css;
    // Le halo agrandit la grille d'1 pixel-sprite de chaque côté : marge négative pour
    // que le chat reste exactement à la même place.
    this.el.style.margin = halo ? `${-this.cssPx}px` : "0";

    const ctx = this.ctx;
    ctx.clearRect(0, 0, size, size);
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
