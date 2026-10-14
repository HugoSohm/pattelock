/**
 * Faux backend pour prévisualiser l'UI dans un simple navigateur (`npm run frontend:dev`),
 * sans Tauri. Uniquement chargé en développement : dans l'app, l'état vient du Rust.
 *
 * Paramètres d'URL : ?etat=pause|tout, ?theme=light|dark|system, ?pelage=roux,
 * ?plateforme=macos|linux, ?langue=fr|en, ?garde=accessibilite|input|indisponible|partiel,
 * ?maj=dispo|echec (mise à jour proposée).
 */

import { isSkinId } from "../cat/skins.ts";
import { defaultShortcut } from "../keys.ts";
import {
  type AppState,
  type GuardStatus,
  KEY_IDS,
  type KeyId,
  type Platform,
  type ThemePref,
} from "../types.ts";
import type { Backend } from "./types.ts";

export function createMockBackend(): Backend {
  const params = new URLSearchParams(location.search);
  const platform = (params.get("plateforme") as Platform | null) ?? "windows";
  const etat = params.get("etat");
  const pelage = params.get("pelage");
  const theme = (params.get("theme") as ThemePref | null) ?? "system";
  const garde = params.get("garde");
  const langue = params.get("langue");
  const maj = params.get("maj");
  const guard: GuardStatus =
    garde === "accessibilite"
      ? { kind: "needsAccessibility" }
      : garde === "input"
        ? {
            kind: "needsInputGroup",
            command: "sudo usermod -aG input $USER && sudo udevadm control --reload-rules",
          }
        : garde === "indisponible"
          ? { kind: "unavailable", reason: "noKeyboard" }
          : garde === "partiel"
            ? { kind: "partial", unavailable: ["PrintScreen"] }
            : { kind: "ok" };

  const all: KeyId[] = ["F1", "F2", "F3", "F4", "F6", "F7", "F8", "F9", "F10", "F12"];
  const state: AppState = {
    mode: etat === "pause" ? "off" : etat === "tout" ? "all" : "fkeys",
    blocked: [...all, "PrintScreen", "ScrollLock", "Pause"],
    shortcut: defaultShortcut(platform),
    settings: {
      skin: isSkinId(pelage) ? pelage : "noir",
      accent: "#ff9548",
      theme,
      autostart: true,
      mediaKeys: true,
      language: langue === "fr" || langue === "en" ? langue : "system",
      checkUpdates: true,
    },
    total: 1284,
    platform,
    guard,
    update: maj ? { version: "0.2.0", status: maj === "echec" ? "failed" : "available" } : null,
  };

  let onState: (s: AppState) => void = () => {};
  const emit = () => onState(structuredClone(state));

  return {
    startsVisible: true,
    init: async () => structuredClone(state),
    onState: (cb) => {
      onState = cb;
    },
    onTotal: () => {},
    onIntercept: () => {},
    onWindowVisibility: () => {},
    onGlobalCursor: () => {},
    catClicked: async () => {
      state.mode = state.mode === "off" ? "fkeys" : "off";
      emit();
    },
    toggleLockAll: async () => {
      state.mode = state.mode === "all" ? "fkeys" : "all";
      emit();
    },
    toggleKey: async (id) => {
      if (state.mode === "all") return;
      state.blocked = state.blocked.includes(id)
        ? state.blocked.filter((k) => k !== id)
        : [...state.blocked, id];
      emit();
    },
    setAllKeys: async (blocked) => {
      if (state.mode === "all") return;
      state.blocked = blocked ? [...KEY_IDS] : [];
      emit();
    },
    beginShortcutCapture: async () => {},
    endShortcutCapture: async () => {},
    setShortcut: async (s) => {
      state.shortcut = s;
      emit();
    },
    updateSettings: async (patch) => {
      state.settings = { ...state.settings, ...patch };
      emit();
    },
    openAccessibilitySettings: async () => {},
    installUpdate: async () => {
      if (!state.update) return;
      for (const progress of [0, 35, 70, 100]) {
        state.update = { ...state.update, status: "downloading", progress };
        emit();
        await new Promise((r) => setTimeout(r, 400));
      }
      state.update = { version: state.update.version, status: "installing" };
      emit();
    },
    reportLocalKey: () => {},
    setUiLanguage: () => {},
    setCatAnchor: () => {},
    minimize: async () => {},
    hide: async () => {},
    uiReady: async () => {},
  };
}
