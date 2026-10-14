import { SpriteCanvas } from "../cat/render.ts";
import { SKINS, type SkinId } from "../cat/skins.ts";
import { FRAMES } from "../cat/sprite.ts";
import { type LangPref, t } from "../i18n.ts";
import type { AppState, Settings, ThemePref } from "../types.ts";
import { h, rovingRadios, setText, syncRadios } from "./dom.ts";

export const ACCENTS = [
  { color: "#ff9548", name: "accent.orange" },
  { color: "#f4a3b4", name: "accent.rose" },
  { color: "#7fd1a8", name: "accent.menthe" },
  { color: "#8fb0ff", name: "accent.bleu" },
] as const;

const THEMES: ThemePref[] = ["system", "light", "dark"];

/** Les noms de langue restent dans leur propre langue, quelle que soit celle de l'UI. */
const LANGUAGES: { id: LangPref; name: string | null }[] = [
  { id: "system", name: null },
  { id: "fr", name: "Français" },
  { id: "en", name: "English" },
];

export interface SettingsView {
  el: HTMLElement;
  update(s: AppState, dark: boolean): void;
  /** Recalcule la taille des vignettes (changement de taille ou de DPI). */
  rescale(): void;
}

export function createSettingsView(onChange: (patch: Partial<Settings>) => void): SettingsView {
  const labels: { el: HTMLElement; update(): void }[] = [];
  const section = (label: Parameters<typeof t>[0], id: string, control: HTMLElement) => {
    const title = h("h2", { class: "lbl", attrs: { id } });
    labels.push({ el: title, update: () => setText(title, t(label)) });
    return h("section", { class: "section" }, title, control);
  };

  // Pelages
  const furs = h("div", {
    class: "furs",
    attrs: { role: "radiogroup", "aria-labelledby": "lbl-fur" },
  });
  const thumbs: { id: SkinId; btn: HTMLButtonElement; canvas: SpriteCanvas; name: HTMLElement }[] = [];
  for (const skin of SKINS) {
    const canvas = new SpriteCanvas(4);
    const name = h("span");
    const btn = h(
      "button",
      { class: "fur", attrs: { type: "button", role: "radio", "aria-checked": "false" } },
      canvas.el,
      name,
    );
    btn.addEventListener("click", () => onChange({ skin: skin.id }));
    thumbs.push({ id: skin.id, btn, canvas, name });
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
      { class: "acc", attrs: { type: "button", role: "radio", "aria-checked": "false" } },
      swatch,
    );
    b.addEventListener("click", () => onChange({ accent: a.color }));
    accs.append(b);
    return { ...a, b };
  });
  rovingRadios(accs);

  // Thème
  const themes = h("div", {
    class: "themes",
    attrs: { role: "radiogroup", "aria-labelledby": "lbl-theme" },
  });
  const themeBtns = THEMES.map((id) => {
    const name = h("span");
    const b = h(
      "button",
      { class: `th th-${id}`, attrs: { type: "button", role: "radio", "aria-checked": "false" } },
      h("i", { attrs: { "aria-hidden": "true" } }),
      name,
    );
    b.addEventListener("click", () => onChange({ theme: id }));
    themes.append(b);
    return { id, b, name };
  });
  rovingRadios(themes);

  // Langue : même sélecteur segmenté que le thème, sans icône.
  const langs = h("div", {
    class: "themes",
    attrs: { role: "radiogroup", "aria-labelledby": "lbl-lang" },
  });
  const langBtns = LANGUAGES.map((l) => {
    const b = h("button", {
      class: "th",
      attrs: { type: "button", role: "radio", "aria-checked": "false" },
    });
    if (l.name) {
      b.textContent = l.name;
      b.lang = l.id;
    }
    b.addEventListener("click", () => onChange({ language: l.id }));
    langs.append(b);
    return { ...l, b };
  });
  rovingRadios(langs);

  // Interrupteurs
  const option = (key: "autostart" | "mediaKeys") => {
    const label = h("span");
    const b = h(
      "button",
      { class: "opt", attrs: { type: "button", role: "switch", "aria-checked": "false" } },
      label,
      h("span", { class: "sw2", attrs: { "aria-hidden": "true" } }, h("span")),
    );
    b.addEventListener("click", () =>
      onChange({ [key]: b.getAttribute("aria-checked") !== "true" } as Partial<Settings>),
    );
    return { b, label };
  };
  const autostart = option("autostart");
  const media = option("mediaKeys");

  const el = h(
    "div",
    { class: "settings" },
    section("settings.coat", "lbl-fur", furs),
    section("settings.accent", "lbl-accent", accs),
    // Thème et langue côte à côte : même format, sans coûter de hauteur.
    h(
      "div",
      { class: "section-row" },
      section("settings.theme", "lbl-theme", themes),
      section("settings.language", "lbl-lang", langs),
    ),
    h("div", { class: "opts" }, autostart.b, media.b),
  );

  function update(s: AppState, dark: boolean): void {
    for (const l of labels) l.update();
    for (const th of thumbs) {
      const skin = SKINS.find((k) => k.id === th.id) ?? SKINS[0];
      th.canvas.draw(FRAMES.awake, skin.palette, dark);
      th.btn.setAttribute("aria-checked", String(s.settings.skin === th.id));
      setText(th.name, t(`skin.${th.id}`));
    }
    for (const a of accBtns) {
      a.b.setAttribute("aria-checked", String(s.settings.accent === a.color));
      a.b.setAttribute("aria-label", t(a.name));
    }
    for (const th of themeBtns) {
      th.b.setAttribute("aria-checked", String(s.settings.theme === th.id));
      setText(th.name, t(`theme.${th.id}`));
    }
    for (const l of langBtns) {
      l.b.setAttribute("aria-checked", String(s.settings.language === l.id));
      if (!l.name) setText(l.b, t("lang.system"));
    }
    syncRadios(furs);
    syncRadios(accs);
    syncRadios(themes);
    syncRadios(langs);
    autostart.b.setAttribute("aria-checked", String(s.settings.autostart));
    setText(autostart.label, t("opt.autostart"));
    media.b.setAttribute("aria-checked", String(s.settings.mediaKeys));
    setText(media.label, t("opt.media"));
    media.b.hidden = s.platform !== "macos";
  }

  function rescale(): void {
    for (const th of thumbs) th.canvas.updateScale();
  }

  return { el, update, rescale };
}
