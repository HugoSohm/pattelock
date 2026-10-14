import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/app.css";

import { createTauriBackend } from "./backend/tauri.ts";
import type { Backend } from "./backend/types.ts";
import { CatAnimator } from "./cat/catAnimator.ts";
import { SpriteCanvas } from "./cat/render.ts";
import { skinById } from "./cat/skins.ts";
import { type Lang, resolveLang, setLang } from "./i18n.ts";
import { applyAccent, ThemeController } from "./theme.ts";
import type { AppState, KeyId } from "./types.ts";
import { h } from "./ui/dom.ts";
import { installLocalGuard } from "./ui/localGuard.ts";
import { createMainView, type UiState } from "./ui/mainView.ts";
import { createNoticeView } from "./ui/noticeView.ts";
import { createSettingsView } from "./ui/settingsView.ts";
import { ShortcutRecorder } from "./ui/shortcutRecorder.ts";
import { createTitlebar } from "./ui/titlebar.ts";

async function pickBackend(): Promise<Backend> {
  if ("__TAURI_INTERNALS__" in window) return createTauriBackend();
  if (import.meta.env.DEV) {
    // Aperçu dans un navigateur, sans Tauri (développement uniquement).
    const { createMockBackend } = await import("./backend/devMock.ts");
    return createMockBackend();
  }
  throw new Error("Pattelock doit être lancé dans l’app.");
}

async function start(backend: Backend): Promise<void> {
  let state: AppState = await backend.init();
  const ui: UiState = { recording: false, shortcutError: null };
  let view: "main" | "settings" =
    new URLSearchParams(location.search).get("vue") === "reglages" ? "settings" : "main";
  let started = false;

  const catCanvas = new SpriteCanvas(5);
  const theme = new ThemeController(() => render());

  const recorder = new ShortcutRecorder({
    save: (s) => backend.setShortcut(s),
    begin: () => backend.beginShortcutCapture(),
    end: () => backend.endShortcutCapture(),
    changed: (recording, error) => {
      ui.recording = recording;
      ui.shortcutError = error;
      render();
    },
  });

  installLocalGuard(
    () => state,
    () => recorder.active,
    (key) => backend.reportLocalKey(key),
  );

  const titlebar = createTitlebar({
    onSettings: () => setView("settings"),
    onBack: () => setView("main"),
    onMinimize: () => void backend.minimize(),
    onClose: () => void backend.hide(),
  });
  const main = createMainView({
    onCat: () => void backend.catClicked(),
    onLockAll: () => void backend.toggleLockAll(),
    onKey: (id) => void backend.toggleKey(id),
    onChangeShortcut: () => recorder.toggle(),
  });
  main.cat.append(catCanvas.el);
  const animator = new CatAnimator({ canvas: catCanvas, host: main.cat, zz: main.zz });
  const settings = createSettingsView((patch) => void backend.updateSettings(patch));
  const notice = createNoticeView(
    () => void backend.openAccessibilitySettings(),
    () => void backend.openAccessibilitySettings(),
  );

  const win = h("div", { class: "win" }, titlebar.el, notice.el, main.el, settings.el);
  document.getElementById("app")?.replaceWith(win);

  function setView(v: "main" | "settings"): void {
    view = v;
    render();
  }

  /** Indique au Rust où sont les yeux du chat, pour le suivi du curseur global. */
  function sendAnchor(): void {
    const c = animator.eyeCenter();
    backend.setCatAnchor({ x: c.x, y: c.y, tracking: state.mode === "off" && view === "main" });
  }

  function rescale(): void {
    catCanvas.updateScale();
    document.documentElement.style.setProperty("--px", `${catCanvas.cssPx}px`);
    settings.rescale();
    sendAnchor();
  }

  /** Langue de l'UI : réglage, ou langue de l'OS en mode « Système ». */
  let uiLang: Lang | null = null;
  function applyLanguage(): void {
    const next = resolveLang(state.settings.language);
    if (next === uiLang) return;
    uiLang = next;
    setLang(next);
    titlebar.update();
    // Le menu du tray suit la même langue.
    backend.setUiLanguage(next);
  }

  function render(): void {
    applyLanguage();
    theme.setPref(state.settings.theme);
    applyAccent(state.settings.accent);
    const dark = theme.dark;
    const blocked = notice.update(state.guard, state.platform);
    titlebar.setView(view);
    notice.el.hidden = !blocked || view !== "main";
    main.el.hidden = blocked || view !== "main";
    settings.el.hidden = view !== "settings";
    main.update(state, ui);
    settings.update(state, dark);
    animator.setLook(skinById(state.settings.skin).palette, dark);
    animator.setMood(state.mode === "off" ? "awake" : "sleep", started);
    if (started) sendAnchor();
  }

  backend.onState((s) => {
    state = s;
    render();
  });
  backend.onTotal((total) => {
    state = { ...state, total };
    main.setTotal(total);
  });
  backend.onIntercept((e) => {
    // L'oreille la plus proche de la touche frémit ; hors de la bande, au hasard.
    const key = main.keyEl(e.key as KeyId);
    let side: "left" | "right" = e.timestamp % 2 === 0 ? "left" : "right";
    if (key) {
      const r = key.getBoundingClientRect();
      side = r.left + r.width / 2 < animator.eyeCenter().x ? "left" : "right";
    }
    animator.react(side);
  });

  // Visibilité : tout s'arrête quand la fenêtre est cachée ou réduite.
  let windowVisible = backend.startsVisible;
  const syncVisibility = () => animator.setVisible(windowVisible && document.visibilityState === "visible");
  document.addEventListener("visibilitychange", syncVisibility);
  backend.onWindowVisibility((v) => {
    windowVisible = v;
    syncVisibility();
  });

  // Les yeux suivent le curseur dans la fenêtre, et au-delà si le Rust le fournit.
  document.addEventListener("mousemove", (e) => {
    const c = animator.eyeCenter();
    animator.setPointer(e.clientX - c.x, e.clientY - c.y);
  });
  backend.onGlobalCursor((pos) => {
    if (pos) animator.setPointer(pos.x, pos.y);
  });

  window.addEventListener("resize", rescale);
  // Langue de l'OS changée pendant que l'app tourne (mode « Système »).
  window.addEventListener("languagechange", () => render());

  rescale();
  render();
  syncVisibility();
  started = true;
  sendAnchor();
  // Pas de requestAnimationFrame ici : il ne tourne pas tant que la fenêtre est cachée.
  setTimeout(() => void backend.uiReady(), 0);
}

pickBackend()
  .then(start)
  .catch((e: unknown) => {
    console.error(e);
  });
