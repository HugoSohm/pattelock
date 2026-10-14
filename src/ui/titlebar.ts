import { h } from "./dom.ts";
import { back, close, dots, minimize, paw } from "./icons.ts";

export interface TitlebarHandlers {
  onSettings(): void;
  onBack(): void;
  onMinimize(): void;
  onClose(): void;
}

export interface Titlebar {
  el: HTMLElement;
  setView(view: "main" | "settings"): void;
}

export function createTitlebar(handlers: TitlebarHandlers): Titlebar {
  const backBtn = h(
    "button",
    { class: "back", attrs: { type: "button", "aria-label": "Retour à l’écran principal" } },
    back(),
    h("span", { text: "Réglages" }),
  );
  backBtn.addEventListener("click", () => handlers.onBack());

  const brand = h(
    "div",
    { class: "brand", attrs: { "data-tauri-drag-region": "" } },
    paw(),
    h("span", { text: "Pattelock" }),
  );

  const settingsBtn = h("button", { attrs: { type: "button", "aria-label": "Réglages" } }, dots());
  settingsBtn.addEventListener("click", () => handlers.onSettings());
  const minBtn = h("button", { attrs: { type: "button", "aria-label": "Réduire la fenêtre" } }, minimize());
  minBtn.addEventListener("click", () => handlers.onMinimize());
  const closeBtn = h(
    "button",
    {
      attrs: { type: "button", "aria-label": "Fermer la fenêtre (Pattelock reste dans la barre des tâches)" },
    },
    close(),
  );
  closeBtn.addEventListener("click", () => handlers.onClose());

  const el = h(
    "header",
    { class: "titlebar", attrs: { "data-tauri-drag-region": "" } },
    backBtn,
    brand,
    h("div", { class: "winbtns" }, settingsBtn, minBtn, closeBtn),
  );

  function setView(view: "main" | "settings"): void {
    const settings = view === "settings";
    backBtn.hidden = !settings;
    brand.hidden = settings;
    settingsBtn.hidden = settings;
  }
  setView("main");

  return { el, setView };
}
