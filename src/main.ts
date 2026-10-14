import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/app.css";

import { createMockBackend } from "./backend/devMock.ts";
import type { Backend } from "./backend/types.ts";
import { CatAnimator } from "./cat/catAnimator.ts";
import { SpriteCanvas } from "./cat/render.ts";
import { skinById } from "./cat/skins.ts";
import { applyAccent, ThemeController } from "./theme.ts";
import type { AppState, KeyId } from "./types.ts";
import { h } from "./ui/dom.ts";
import { createMainView, type UiState } from "./ui/mainView.ts";
import { createSettingsView } from "./ui/settingsView.ts";
import { createTitlebar } from "./ui/titlebar.ts";

async function start(backend: Backend): Promise<void> {
  let state: AppState = await backend.init();
  const ui: UiState = { recording: false, shortcutError: null };
  let view: "main" | "settings" =
    new URLSearchParams(location.search).get("vue") === "reglages" ? "settings" : "main";

  const catCanvas = new SpriteCanvas(5);
  const theme = new ThemeController(() => render());

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
    onChangeShortcut: () => {
      ui.recording = !ui.recording;
      render();
    },
  });
  main.cat.append(catCanvas.el);
  const animator = new CatAnimator({ canvas: catCanvas, host: main.cat, zz: main.zz });
  const settings = createSettingsView((patch) => void backend.updateSettings(patch));

  const win = h("div", { class: "win" }, titlebar.el, main.el, settings.el);
  document.getElementById("app")?.replaceWith(win);

  function setView(v: "main" | "settings"): void {
    view = v;
    render();
  }

  function rescale(): void {
    catCanvas.updateScale();
    document.documentElement.style.setProperty("--px", `${catCanvas.cssPx}px`);
    settings.rescale();
  }

  function render(): void {
    theme.setPref(state.settings.theme);
    applyAccent(state.settings.accent);
    const dark = theme.dark;
    titlebar.setView(view);
    main.el.hidden = view !== "main";
    settings.el.hidden = view !== "settings";
    main.update(state, ui);
    settings.update(state, dark);
    animator.setLook(skinById(state.settings.skin).palette, dark);
    animator.setMood(state.mode === "off" ? "awake" : "sleep", started);
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

  // Visibilité : on coupe tout quand la fenêtre est cachée ou réduite.
  let windowVisible = true;
  const syncVisibility = () => animator.setVisible(windowVisible && document.visibilityState === "visible");
  document.addEventListener("visibilitychange", syncVisibility);
  backend.onWindowVisibility((v) => {
    windowVisible = v;
    syncVisibility();
  });

  // Les yeux suivent le curseur dans la fenêtre, et hors de la fenêtre si le Rust le fournit.
  document.addEventListener("mousemove", (e) => {
    const c = animator.eyeCenter();
    animator.setPointer(e.clientX - c.x, e.clientY - c.y);
  });
  backend.onGlobalCursor((pos) => {
    if (pos) animator.setPointer(pos.x, pos.y);
  });

  window.addEventListener("resize", rescale);

  let started = false;
  rescale();
  render();
  syncVisibility();
  started = true;
  await backend.uiReady();
}

void start(createMockBackend());
