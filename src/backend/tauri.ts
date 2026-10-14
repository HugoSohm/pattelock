import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppState, KeyIntercepted } from "../types.ts";
import type { Backend } from "./types.ts";

/** Backend réel : l'état vient du Rust via commandes et événements Tauri. */
export function createTauriBackend(): Backend {
  const on = <T>(event: string, cb: (payload: T) => void) => {
    void listen<T>(event, (e) => cb(e.payload));
  };
  return {
    startsVisible: false,
    init: () => invoke<AppState>("get_state"),
    onState: (cb) => on<AppState>("state-changed", cb),
    onTotal: (cb) => on<number>("total-changed", cb),
    onIntercept: (cb) => on<KeyIntercepted>("key-intercepted", cb),
    onWindowVisibility: (cb) => on<boolean>("window-visibility", cb),
    onGlobalCursor: (cb) => on<{ x: number; y: number }>("global-cursor", cb),
    catClicked: () => invoke("cat_clicked"),
    toggleLockAll: () => invoke("toggle_lock_all"),
    toggleKey: (key) => invoke("toggle_key", { key }),
    beginShortcutCapture: () => invoke("begin_shortcut_capture"),
    endShortcutCapture: () => invoke("end_shortcut_capture"),
    setShortcut: (shortcut) => invoke("set_shortcut", { shortcut }),
    updateSettings: (patch) => invoke("update_settings", { patch }),
    openAccessibilitySettings: () => invoke("open_accessibility_settings"),
    setCatAnchor: (a) => void invoke("set_cat_anchor", a),
    minimize: () => getCurrentWindow().minimize(),
    hide: () => invoke("hide_window"),
    uiReady: () => invoke("ui_ready"),
  };
}
