/** Petits utilitaires DOM. Aucun `innerHTML` ni attribut `style` (CSP stricte). */

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Icône pixel : `rects` = liste de [x, y, largeur, hauteur] dans la grille `w` x `h`. */
export function pixelIcon(
  w: number,
  hgt: number,
  rects: ReadonlyArray<readonly [number, number, number, number]>,
  cls: string,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", cls);
  for (const [x, y, rw, rh] of rects) {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", String(rw));
    r.setAttribute("height", String(rh));
    svg.append(r);
  }
  return svg;
}

/** Remplace le contenu texte uniquement s'il change (évite des mutations inutiles). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * Navigation au clavier d'un groupe de boutons `role="radio"` : flèches pour se déplacer
 * et sélectionner, un seul élément tabulable (celui qui est coché).
 */
export function rovingRadios(group: HTMLElement): void {
  group.addEventListener("keydown", (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const i = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    let next = i;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + radios.length) % radios.length;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % radios.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = radios.length - 1;
    radios[next]?.focus();
    radios[next]?.click();
  });
}

export function syncRadios(group: HTMLElement): void {
  for (const r of group.querySelectorAll<HTMLElement>('[role="radio"]')) {
    r.tabIndex = r.getAttribute("aria-checked") === "true" ? 0 : -1;
  }
}
