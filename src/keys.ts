import { hasText, t } from "./i18n.ts";
import type { CustomKey, KeyId, Platform, Shortcut } from "./types.ts";

export interface KeyDef {
  id: KeyId;
  /** Libellé sur la touche. */
  label: string;
  /** Nom complet pour les lecteurs d'écran. */
  name: string;
  wide: boolean;
}

/**
 * La bande clavier : deux rangées de groupes. En haut Échap et les touches F, en bas
 * les 3 touches spéciales, le bloc de navigation et le pavé numérique (une seule touche
 * pour tout le pavé). Sur Mac, les touches spéciales sont F13 à F15 et Inser est la
 * touche Aide.
 */
export function keyGroups(platform: Platform): KeyDef[][][] {
  const f = (n: number): KeyDef => {
    const id = `F${n}` as KeyId;
    return { id, label: id, name: id, wide: false };
  };
  type NavKey = "escape" | "insert" | "help" | "home" | "pageUp" | "delete" | "end" | "pageDown";
  const nav = (id: KeyId, key: NavKey): KeyDef => ({
    id,
    label: t(`key.${key}`),
    name: t(`key.${key}.name`),
    wide: true,
  });
  const mac = platform === "macos";
  const top: KeyDef[][] = [
    [nav("Escape", "escape")],
    [f(1), f(2), f(3), f(4)],
    [f(5), f(6), f(7), f(8)],
    [f(9), f(10), f(11), f(12)],
  ];
  const bottom: KeyDef[][] = [
    [
      {
        id: "PrintScreen",
        label: mac ? "F13" : t("key.printScreen"),
        name: mac ? "F13" : t("key.printScreen.name"),
        wide: true,
      },
      {
        id: "ScrollLock",
        label: mac ? "F14" : t("key.scrollLock"),
        name: mac ? "F14" : t("key.scrollLock.name"),
        wide: true,
      },
      { id: "Pause", label: mac ? "F15" : t("key.pause"), name: mac ? "F15" : t("key.pause"), wide: true },
    ],
    [nav("Insert", mac ? "help" : "insert"), nav("Home", "home"), nav("PageUp", "pageUp")],
    [nav("Delete", "delete"), nav("End", "end"), nav("PageDown", "pageDown")],
    [{ id: "Numpad", label: t("key.numpad"), name: t("key.numpad.name"), wide: true }],
  ];
  return [top, bottom];
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
  "Escape",
  "Insert",
  "Home",
  "PageUp",
  "Delete",
  "End",
  "PageDown",
]);

/** Touche du pavé numérique (`Numpad7`, `NumpadEnter`, Verr. num. ou Clear sur Mac). */
export function isNumpadCode(code: string): boolean {
  return code.startsWith("Numpad") || code === "NumLock";
}

/** Touche présente sur la bande (touche F, navigation, pavé numérique...). */
export function isStripCode(code: string): boolean {
  return BLOCKABLE_CODES.has(code) || isNumpadCode(code);
}

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

const SYMBOLS: Record<string, string> = {
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
  // Touche < > des claviers ISO, à gauche de la rangée du bas.
  IntlBackslash: "<",
};

/**
 * Touches dont le caractère dépend de la disposition (A sur la position Q d'un AZERTY,
 * * sur la position \ ...). Les chiffres restent nommés par leur code : ils sont imprimés
 * sur la touche quelle que soit la disposition.
 */
export function isLayoutCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code) || code in SYMBOLS;
}

/**
 * Libellé d'un caractère tapé, en majuscule quand la conversion garde le même caractère
 * (« µ » deviendrait le mu grec « Μ », « ß » deviendrait « SS »).
 */
export function charLabel(c: string): string | undefined {
  if (c.length !== 1 || !c.trim()) return undefined;
  const up = c.toUpperCase();
  return up.length === 1 && up.toLowerCase() === c ? up : c;
}

/** Libellé d'une touche à partir de son `KeyboardEvent.code`, dans la langue courante. */
export function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const key = `code.${code}`;
  if (hasText(key)) return t(key);
  return SYMBOLS[code] ?? code;
}

export type ModGroup = "ctrl" | "alt" | "shift" | "meta";

/** Groupe d'une touche de modification (`ControlRight` : ctrl), ou null. */
export function modifierGroup(code: string): ModGroup | null {
  const m = /^(Shift|Control|Alt|Meta|OS)(Left|Right)$/.exec(code);
  if (!m) return null;
  const groups: Record<string, ModGroup> = {
    Shift: "shift",
    Control: "ctrl",
    Alt: "alt",
    Meta: "meta",
    OS: "meta",
  };
  return groups[m[1] ?? ""] ?? null;
}

/** Nom d'un modificateur selon l'OS (Option et Cmd sur Mac, Win ou Super ailleurs). */
function modName(group: ModGroup, platform: Platform): string {
  const mac = platform === "macos";
  switch (group) {
    case "ctrl":
      return "Ctrl";
    case "alt":
      return mac ? "Option" : "Alt";
    case "shift":
      return t("mod.shift");
    case "meta":
      return mac ? "Cmd" : platform === "windows" ? "Win" : "Super";
  }
}

/** Libellé d'une touche supplémentaire (`Maj g`, `Alt Gr`, `A`...). */
export function customKeyLabel(k: CustomKey, platform: Platform): string {
  if (k.label) return k.label;
  const group = modifierGroup(k.code);
  if (!group) return codeLabel(k.code);
  const right = k.code.endsWith("Right");
  // Alt droit est AltGr hors Mac.
  if (group === "alt" && right && platform !== "macos") return t("mod.altGr");
  return t(right ? "mod.right" : "mod.left", { k: modName(group, platform) });
}

/** La touche fait-elle partie du raccourci (touche principale ou modificateur du même groupe) ? */
export function usedByShortcut(code: string, s: Shortcut): boolean {
  const group = modifierGroup(code);
  return code === s.key || (group !== null && s[group]);
}

export interface ShortcutPiece {
  /** Modificateur, ou `key` pour la touche principale. */
  id: ModGroup | "key";
  text: string;
}

/** Morceaux du raccourci, dans l'ordre d'affichage. */
export function shortcutPieces(s: Shortcut, platform: Platform): ShortcutPiece[] {
  const groups: ModGroup[] = ["ctrl", "alt", "shift", "meta"];
  const pieces: ShortcutPiece[] = groups
    .filter((g) => s[g])
    .map((g) => ({ id: g, text: modName(g, platform) }));
  pieces.push({ id: "key", text: s.label ?? codeLabel(s.key) });
  return pieces;
}

/** Morceaux du raccourci, dans l'ordre d'affichage (un `<kbd>` par morceau). */
export function shortcutParts(s: Shortcut, platform: Platform): string[] {
  return shortcutPieces(s, platform).map((p) => p.text);
}

export function shortcutText(s: Shortcut, platform: Platform): string {
  return shortcutParts(s, platform).join(" + ");
}

export function defaultShortcut(platform: Platform): Shortcut {
  return platform === "macos"
    ? { ctrl: false, alt: true, shift: false, meta: true, key: "KeyK" }
    : { ctrl: true, alt: true, shift: false, meta: false, key: "KeyK" };
}
