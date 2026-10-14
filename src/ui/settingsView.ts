import { SpriteCanvas } from "../cat/render.ts";
import { SKINS, type SkinId } from "../cat/skins.ts";
import { FRAMES } from "../cat/sprite.ts";
import type { AppState, Settings, ThemePref } from "../types.ts";
import { h, rovingRadios, syncRadios } from "./dom.ts";

export const ACCENTS = [
  { color: "#ff9548", name: "Orange" },
  { color: "#f4a3b4", name: "Rose" },
  { color: "#7fd1a8", name: "Menthe" },
  { color: "#8fb0ff", name: "Bleu" },
] as const;

const THEMES: { id: ThemePref; name: string }[] = [
  { id: "system", name: "Système" },
  { id: "light", name: "Clair" },
  { id: "dark", name: "Sombre" },
];

export interface SettingsView {
  el: HTMLElement;
  update(s: AppState, dark: boolean): void;
  /** Recalcule la taille des vignettes (changement de taille ou de DPI). */
  rescale(): void;
}

export function createSettingsView(onChange: (patch: Partial<Settings>) => void): SettingsView {
  const section = (label: string, id: string, control: HTMLElement) =>
    h("section", { class: "section" }, h("h2", { class: "lbl", text: label, attrs: { id } }), control);

  // Pelages
  const furs = h("div", {
    class: "furs",
    attrs: { role: "radiogroup", "aria-labelledby": "lbl-fur" },
  });
  const thumbs: { id: SkinId; btn: HTMLButtonElement; canvas: SpriteCanvas }[] = [];
  for (const skin of SKINS) {
    const canvas = new SpriteCanvas(4);
    const btn = h(
      "button",
      { class: "fur", attrs: { type: "button", role: "radio", "aria-checked": "false" } },
      canvas.el,
      h("span", { text: skin.name }),
    );
    btn.addEventListener("click", () => onChange({ skin: skin.id }));
    thumbs.push({ id: skin.id, btn, canvas });
    furs.append(btn);
  }
  rovingRadios(furs);

  // Accents
  const accs = h("div", {
    class: "accs",
    attrs: { role: "radiogroup", "aria-labelledby": "lbl-accent" },
  });
  const accBtns = ACCENTS.map((a) => {
    const swatch = h("span");
    swatch.style.background = a.color;
    const b = h(
      "button",
      {
        class: "acc",
        attrs: { type: "button", role: "radio", "aria-label": a.name, "aria-checked": "false" },
      },
      swatch,
    );
    b.addEventListener("click", () => onChange({ accent: a.color }));
    accs.append(b);
    return { color: a.color, b };
  });
  rovingRadios(accs);

  // Thème
  const themes = h("div", {
    class: "themes",
    attrs: { role: "radiogroup", "aria-labelledby": "lbl-theme" },
  });
  const themeBtns = THEMES.map((t) => {
    const b = h(
      "button",
      {
        class: `th th-${t.id}`,
        attrs: { type: "button", role: "radio", "aria-checked": "false" },
      },
      h("i", { attrs: { "aria-hidden": "true" } }),
      t.name,
    );
    b.addEventListener("click", () => onChange({ theme: t.id }));
    themes.append(b);
    return { id: t.id, b };
  });
  rovingRadios(themes);

  // Options
  const option = (label: string, key: "autostart" | "mediaKeys") => {
    const b = h(
      "button",
      { class: "opt", attrs: { type: "button", role: "switch", "aria-checked": "false" } },
      h("span", { text: label }),
      h("span", { class: "sw2", attrs: { "aria-hidden": "true" } }, h("span")),
    );
    b.addEventListener("click", () =>
      onChange({ [key]: b.getAttribute("aria-checked") !== "true" } as Partial<Settings>),
    );
    return b;
  };
  const autostart = option("Lancer Pattelock au démarrage", "autostart");
  const media = option("Bloquer aussi les fonctions média de la rangée du haut (Mac)", "mediaKeys");

  const el = h(
    "div",
    { class: "settings" },
    section("PELAGE DU CHAT", "lbl-fur", furs),
    section("COULEUR D’ACCENT", "lbl-accent", accs),
    section("THÈME", "lbl-theme", themes),
    h("div", { class: "opts" }, autostart, media),
  );

  function update(s: AppState, dark: boolean): void {
    for (const t of thumbs) {
      const skin = SKINS.find((k) => k.id === t.id) ?? SKINS[0];
      t.canvas.draw(FRAMES.awake, skin.palette, dark);
      t.btn.setAttribute("aria-checked", String(s.settings.skin === t.id));
    }
    for (const a of accBtns) a.b.setAttribute("aria-checked", String(s.settings.accent === a.color));
    for (const t of themeBtns) t.b.setAttribute("aria-checked", String(s.settings.theme === t.id));
    syncRadios(furs);
    syncRadios(accs);
    syncRadios(themes);
    autostart.setAttribute("aria-checked", String(s.settings.autostart));
    media.setAttribute("aria-checked", String(s.settings.mediaKeys));
    media.hidden = s.platform !== "macos";
  }

  function rescale(): void {
    for (const t of thumbs) t.canvas.updateScale();
  }

  return { el, update, rescale };
}
