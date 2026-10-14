import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/app.css";

import { createMockBackend } from "./backend/devMock.ts";
import type { Backend } from "./backend/types.ts";
import { SpriteCanvas } from "./cat/render.ts";
import { skinById } from "./cat/skins.ts";
import { FRAMES } from "./cat/sprite.ts";
import { applyAccent, ThemeController } from "./theme.ts";
import type { AppState } from "./types.ts";
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
    const on = state.mode !== "off";
    catCanvas.draw(on ? FRAMES.sleep : FRAMES.awake, skinById(state.settings.skin).palette, dark);
    main.zz.textContent = "z Z";
  }

  backend.onState((s) => {
    state = s;
    render();
  });
  backend.onTotal((total) => {
    state = { ...state, total };
    main.setTotal(total);
  });
  window.addEventListener("resize", rescale);

  rescale();
  render();
  await backend.uiReady();
}

void start(createMockBackend());
