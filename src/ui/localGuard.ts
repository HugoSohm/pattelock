import type { AppState, KeyId } from "../types.ts";

const NAV_CODES: ReadonlySet<string> = new Set([
  "Escape",
  "Insert",
  "Home",
  "PageUp",
  "Delete",
  "End",
  "PageDown",
]);

/** `KeyboardEvent.code` vers touche de la bande (sur Mac, F13 à F15 remplacent Impr., Défil., Pause). */
export function keyIdOf(code: string, mac: boolean): KeyId | null {
  if (/^F([1-9]|1[0-2])$/.test(code)) return code as KeyId;
  // `code` distingue déjà le pavé numérique (`Numpad7`...) du bloc de navigation.
  if (NAV_CODES.has(code)) return code as KeyId;
  if (mac) {
    if (code === "F13") return "PrintScreen";
    if (code === "F14") return "ScrollLock";
    if (code === "F15") return "Pause";
    return null;
  }
  if (code === "PrintScreen" || code === "ScrollLock" || code === "Pause") return code;
  return null;
}

/**
 * Bloque aussi les touches quand la fenêtre de Pattelock a elle-même le focus. Le hook
 * de l'OS couvre les autres applications ; ici on empêche la webview de réagir (F5
 * recharge la page, F7 active la navigation au curseur...) et on signale la touche au
 * Rust pour le compteur. Si le hook l'a déjà avalée, la page ne la voit jamais : pas de
 * double comptage.
 */
export function installLocalGuard(
  state: () => AppState,
  recording: () => boolean,
  report: (key: KeyId | "other") => void,
): void {
  const handle = (e: KeyboardEvent) => {
    if (recording()) return;
    const s = state();
    if (s.mode === "off") return;
    const id = keyIdOf(e.code, s.platform === "macos");
    const block = s.mode === "all" || (id !== null && s.blocked.includes(id));
    if (!block) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "keydown" && !e.repeat) report(id ?? "other");
  };
  window.addEventListener("keydown", handle, { capture: true });
  window.addEventListener("keyup", handle, { capture: true });
}
