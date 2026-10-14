import type { KeyId, Platform, Shortcut } from "./types.ts";

export interface KeyDef {
  id: KeyId;
  /** Libellé sur la touche. */
  label: string;
  /** Nom complet pour les lecteurs d'écran. */
  name: string;
  wide: boolean;
}

/** Les 4 groupes de la bande clavier. Sur Mac, les 3 touches spéciales sont F13 à F15. */
export function keyGroups(platform: Platform): KeyDef[][] {
  const f = (n: number): KeyDef => {
    const id = `F${n}` as KeyId;
    return { id, label: id, name: id, wide: false };
  };
  const mac = platform === "macos";
  return [
    [f(1), f(2), f(3), f(4)],
    [f(5), f(6), f(7), f(8)],
    [f(9), f(10), f(11), f(12)],
    [
      {
        id: "PrintScreen",
        label: mac ? "F13" : "Impr.",
        name: mac ? "F13" : "Impression écran",
        wide: true,
      },
      {
        id: "ScrollLock",
        label: mac ? "F14" : "Défil.",
        name: mac ? "F14" : "Arrêt défilement",
        wide: true,
      },
      { id: "Pause", label: mac ? "F15" : "Pause", name: mac ? "F15" : "Pause", wide: true },
    ],
  ];
}

/** Touches que le raccourci n'a pas le droit d'utiliser (elles peuvent être bloquées). */
export const BLOCKABLE_CODES: ReadonlySet<string> = new Set([
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "F13",
  "F14",
  "F15",
  "PrintScreen",
  "ScrollLock",
  "Pause",
]);

export const MODIFIER_CODES: ReadonlySet<string> = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

const CODE_LABELS: Record<string, string> = {
  Space: "Espace",
  Enter: "Entrée",
  Tab: "Tab",
  Backspace: "Retour",
  Escape: "Échap",
  Insert: "Inser",
  Delete: "Suppr",
  Home: "Début",
  End: "Fin",
  PageUp: "Page haut",
  PageDown: "Page bas",
  ArrowUp: "Haut",
  ArrowDown: "Bas",
  ArrowLeft: "Gauche",
  ArrowRight: "Droite",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

export function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Pavé ${code.slice(6)}`;
  return CODE_LABELS[code] ?? code;
}

/** Morceaux du raccourci, dans l'ordre d'affichage (un `<kbd>` par morceau). */
export function shortcutParts(s: Shortcut, platform: Platform): string[] {
  const mac = platform === "macos";
  const parts: string[] = [];
  if (mac) {
    if (s.ctrl) parts.push("Ctrl");
    if (s.alt) parts.push("Option");
    if (s.shift) parts.push("Maj");
    if (s.meta) parts.push("Cmd");
  } else {
    if (s.ctrl) parts.push("Ctrl");
    if (s.alt) parts.push("Alt");
    if (s.shift) parts.push("Maj");
    if (s.meta) parts.push(platform === "windows" ? "Win" : "Super");
  }
  parts.push(s.label ?? codeLabel(s.key));
  return parts;
}

export function shortcutText(s: Shortcut, platform: Platform): string {
  return shortcutParts(s, platform).join(" + ");
}

export function defaultShortcut(platform: Platform): Shortcut {
  return platform === "macos"
    ? { ctrl: false, alt: true, shift: false, meta: true, key: "KeyK" }
    : { ctrl: true, alt: true, shift: false, meta: false, key: "KeyK" };
}
