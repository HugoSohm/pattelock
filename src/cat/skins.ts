/**
 * Pelages du chat : une simple table de palettes. Pour ajouter un pelage (tigré,
 * calico, tuxedo...), ajoute une entrée. `S` colore les pixels de motif optionnels de
 * la grille ; sans `S`, ces pixels prennent la couleur de la fourrure.
 */
export interface Palette {
  /** Contour */
  O: string;
  /** Fourrure */
  F: string;
  /** Museau et poitrail */
  W: string;
  /** Rose (oreilles, joues, nez) */
  P: string;
  /** Œil */
  E: string;
  /** Reflet */
  H: string;
  /** Motif optionnel (rayures, taches) */
  S?: string;
}

export interface Skin {
  id: string;
  name: string;
  palette: Palette;
}

export const SKINS = [
  {
    id: "noir",
    name: "Noir",
    palette: { O: "#121016", F: "#3f3a48", W: "#5d5668", P: "#ea8c9c", E: "#121016", H: "#ffffff" },
  },
  {
    id: "roux",
    name: "Roux",
    palette: { O: "#2b2230", F: "#f2a65a", W: "#fff4e4", P: "#f59aa8", E: "#2b2230", H: "#ffffff" },
  },
  {
    id: "gris",
    name: "Gris",
    palette: { O: "#2b2230", F: "#a7a5b4", W: "#eeeaf2", P: "#f59aa8", E: "#2b2230", H: "#ffffff" },
  },
  {
    id: "blanc",
    name: "Blanc",
    palette: { O: "#2b2230", F: "#f7f3ec", W: "#ffffff", P: "#f59aa8", E: "#2b2230", H: "#ffffff" },
  },
  {
    id: "siamois",
    name: "Siamois",
    palette: { O: "#2b2230", F: "#ecd8ba", W: "#f9efe0", P: "#c9877a", E: "#3d6fb8", H: "#ffffff" },
  },
] as const satisfies readonly Skin[];

export type SkinId = (typeof SKINS)[number]["id"];

export const DEFAULT_SKIN: SkinId = "noir";

export function isSkinId(value: unknown): value is SkinId {
  return SKINS.some((s) => s.id === value);
}

export function skinById(id: SkinId): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/** Couleur d'un code pixel, ou `null` si transparent. */
export function pixelColor(code: string, palette: Palette, halo: string): string | null {
  switch (code) {
    case "O":
    case "F":
    case "W":
    case "P":
    case "E":
    case "H":
      return palette[code];
    case "S":
      return palette.S ?? palette.F;
    case "R":
      return halo;
    default:
      return null;
  }
}
