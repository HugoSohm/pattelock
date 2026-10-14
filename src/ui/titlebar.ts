import { t } from "../i18n.ts";
import { h, setText } from "./dom.ts";
import { back, close, gear, minimize, paw } from "./icons.ts";

export interface TitlebarHandlers {
  onSettings(): void;
  onBack(): void;
  onMinimize(): void;
  onClose(): void;
}

export interface Titlebar {
  el: HTMLElement;
  setView(view: "main" | "settings"): void;
  /** Met à jour les textes (changement de langue). */
  update(): void;
}

export function createTitlebar(handlers: TitlebarHandlers): Titlebar {
  const backLabel = h("span");
  const backBtn = h("button", { class: "back", attrs: { type: "button" } }, back(), backLabel);
  backBtn.addEventListener("click", () => handlers.onBack());

  const brand = h(
    "div",
    { class: "brand", attrs: { "data-tauri-drag-region": "" } },
    paw(),
    h("span", { text: "Pattelock" }),
  );

  const settingsBtn = h("button", { attrs: { type: "button" } }, gear());
  settingsBtn.addEventListener("click", () => handlers.onSettings());
  const minBtn = h("button", { attrs: { type: "button" } }, minimize());
  minBtn.addEventListener("click", () => handlers.onMinimize());
  const closeBtn = h("button", { attrs: { type: "button" } }, close());
  closeBtn.addEventListener("click", () => handlers.onClose());

  const el = h(
    "header",
    { class: "titlebar", attrs: { "data-tauri-drag-region": "" } },
    backBtn,
    brand,
    h("div", { class: "winbtns" }, settingsBtn, minBtn, closeBtn),
  );

  /** Libellé accessible et infobulle au survol. */
  const label = (b: HTMLElement, text: string) => {
    b.setAttribute("aria-label", text);
    b.title = text;
  };

  function update(): void {
    setText(backLabel, t("titlebar.settings"));
    backBtn.setAttribute("aria-label", t("titlebar.back"));
    label(settingsBtn, t("titlebar.settings"));
    label(minBtn, t("titlebar.minimize"));
    label(closeBtn, t("titlebar.close"));
  }

  function setView(view: "main" | "settings"): void {
    const settings = view === "settings";
    backBtn.hidden = !settings;
    brand.hidden = settings;
    settingsBtn.hidden = settings;
  }
  setView("main");
  update();

  return { el, setView, update };
}
