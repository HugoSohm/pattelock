import { pixelIcon } from "./dom.ts";

type R = readonly [number, number, number, number];

const PAW: R[] = [
  [0, 0, 1, 1],
  [2, 0, 1, 1],
  [4, 0, 1, 1],
  [1, 2, 3, 1],
  [0, 3, 5, 1],
  [1, 4, 3, 1],
];

export const paw = (cls = ""): SVGSVGElement => pixelIcon(5, 5, PAW, `paw ${cls}`.trim());

/** Engrenage des Réglages (9 x 9). */
export const gear = (): SVGSVGElement =>
  pixelIcon(
    9,
    9,
    [
      [4, 0, 1, 1],
      [1, 1, 1, 1],
      [3, 1, 3, 1],
      [7, 1, 1, 1],
      [2, 2, 5, 1],
      [1, 3, 2, 1],
      [6, 3, 2, 1],
      [0, 4, 3, 1],
      [6, 4, 3, 1],
      [1, 5, 2, 1],
      [6, 5, 2, 1],
      [2, 6, 5, 1],
      [1, 7, 1, 1],
      [3, 7, 3, 1],
      [7, 7, 1, 1],
      [4, 8, 1, 1],
    ],
    "ico-gear",
  );

export const minimize = (): SVGSVGElement => pixelIcon(5, 5, [[0, 2, 5, 1]], "ico-min");

export const close = (): SVGSVGElement =>
  pixelIcon(
    5,
    5,
    [
      [0, 0, 1, 1],
      [1, 1, 1, 1],
      [2, 2, 1, 1],
      [3, 3, 1, 1],
      [4, 4, 1, 1],
      [4, 0, 1, 1],
      [3, 1, 1, 1],
      [1, 3, 1, 1],
      [0, 4, 1, 1],
    ],
    "ico-close",
  );

export const back = (): SVGSVGElement =>
  pixelIcon(
    4,
    6,
    [
      [2, 0, 1, 1],
      [1, 1, 1, 1],
      [0, 2, 1, 2],
      [1, 4, 1, 1],
      [2, 5, 1, 1],
    ],
    "ico-back",
  );

/** Cadenas : ouvert (anse décollée à droite) ou fermé. */
export function padlock(closed: boolean): SVGSVGElement {
  return pixelIcon(
    5,
    7,
    [
      [1, 0, 3, 1],
      [0, 1, 1, 2],
      [4, 1, 1, closed ? 2 : 1],
      [0, 3, 5, 2],
      [0, 5, 2, 1],
      [3, 5, 2, 1],
      [0, 6, 5, 1],
    ],
    "ico-lock",
  );
}
