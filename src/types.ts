/** Types partagés avec le Rust (sérialisés en camelCase). */
import type { SkinId } from "./cat/skins.ts";

/** Off : rien n'est bloqué. FKeys : les touches choisies. All : tout le clavier. */
export type Mode = "off" | "fkeys" | "all";

export const KEY_IDS = [
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
  "PrintScreen",
  "ScrollLock",
  "Pause",
] as const;
export type KeyId = (typeof KEY_IDS)[number];

/** Raccourci global. `key` est un `KeyboardEvent.code` (ex. `KeyK`). */
export interface Shortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

export type ThemePref = "system" | "light" | "dark";
export type Platform = "windows" | "macos" | "linux";

/** État du blocage côté OS. */
export type GuardStatus =
  | { kind: "ok" }
  | { kind: "starting" }
  | { kind: "needsAccessibility" }
  | { kind: "needsInputGroup"; command: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "partial"; unavailable: KeyId[]; reason: string };

export interface Settings {
  skin: SkinId;
  accent: string;
  theme: ThemePref;
  autostart: boolean;
  mediaKeys: boolean;
}

export interface AppState {
  mode: Mode;
  blocked: KeyId[];
  shortcut: Shortcut;
  settings: Settings;
  total: number;
  platform: Platform;
  guard: GuardStatus;
}

export interface KeyIntercepted {
  key: string;
  timestamp: number;
}
