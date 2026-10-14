import { copyFor, counterText, keyVisual } from "../copy.ts";
import { formatCount, type Lang, lang, t } from "../i18n.ts";
import { keyGroups, shortcutParts } from "../keys.ts";
import type { AppState, KeyId, Platform, ShortcutErrorCode } from "../types.ts";
import { h, setText } from "./dom.ts";
import { padlock, paw } from "./icons.ts";
import { guardBanner, shortcutErrorText } from "./noticeView.ts";

export interface MainHandlers {
  onCat(): void;
  onLockAll(): void;
  onKey(id: KeyId): void;
  onChangeShortcut(): void;
}

export interface UiState {
  recording: boolean;
  shortcutError: ShortcutErrorCode | null;
}

export interface MainView {
  el: HTMLElement;
  /** Bouton du chat : le canvas animé y est inséré. */
  cat: HTMLButtonElement;
  /** Les « z » du chat endormi. */
  zz: HTMLElement;
  /** Clé de la bande pour une touche (pour orienter l'oreille du chat). */
  keyEl(id: KeyId): HTMLButtonElement | undefined;
  update(s: AppState, ui: UiState): void;
  setTotal(total: number): void;
}

export function createMainView(handlers: MainHandlers): MainView {
  const led = h("span", { class: "led" });
  const tag = h("span");
  const title = h("h1", { class: "title" });
  const sub = h("p", { class: "sub" });
  const hint = h("span");
  const banner = h("p", { class: "banner", attrs: { role: "status" } });

  const cat = h("button", { class: "cat", attrs: { type: "button" } });
  cat.addEventListener("click", () => handlers.onCat());
  const zz = h("div", { class: "zz", attrs: { "aria-hidden": "true" } });

  const strip = h("div", { class: "strip" }, cat, zz);
  const keyEls = new Map<KeyId, HTMLButtonElement>();
  let builtFor: { platform: Platform; lang: Lang } | null = null;

  const legend = h("div", { class: "legend" });
  const count = h("b");
  const countText = h("span");
  const activity = h("div", { class: "activity" }, paw(), h("span", {}, count, " ", countText));

  const lockLabel = h("span");
  const lockall = h("button", {
    class: "lockall",
    attrs: { type: "button", "aria-pressed": "false" },
  });
  lockall.addEventListener("click", () => handlers.onLockAll());

  const scInfo = h("div", { class: "shortcut" });
  const change = h("button", { class: "change", attrs: { type: "button" } });
  change.addEventListener("click", () => handlers.onChangeShortcut());
  const shortcut = h("div", { class: "shortcut" }, scInfo, change);

  const el = h(
    "main",
    { class: "body" },
    h("div", { class: "status" }, h("div", { class: "badge" }, led, tag), title, sub),
    h("div", { class: "hint" }, paw(), hint),
    strip,
    legend,
    activity,
    banner,
    h("div", { class: "footer" }, lockall, shortcut),
  );

  function buildKeys(platform: Platform): void {
    for (const g of strip.querySelectorAll(".group")) g.remove();
    keyEls.clear();
    for (const group of keyGroups(platform)) {
      const g = h("div", { class: "group" });
      for (const k of group) {
        const b = h("button", {
          class: `key${k.wide ? " wide" : ""}`,
          attrs: { type: "button", "data-name": k.name },
        });
        b.append(
          h("span", { class: "kled", attrs: { "aria-hidden": "true" } }),
          h("span", { text: k.label }),
        );
        b.addEventListener("click", () => handlers.onKey(k.id));
        keyEls.set(k.id, b);
        g.append(b);
      }
      strip.append(g);
    }
    builtFor = { platform, lang: lang() };
  }

  let lastLegend = "";
  let lastShortcut = "";

  function update(s: AppState, ui: UiState): void {
    if (builtFor?.platform !== s.platform || builtFor.lang !== lang()) buildKeys(s.platform);
    const c = copyFor(s);
    el.classList.toggle("on", c.on);
    el.classList.toggle("off", !c.on);
    setText(tag, c.tag);
    setText(title, c.title);
    setText(sub, c.sub);
    setText(hint, c.hint);
    const warn = guardBanner(s.guard, s.platform);
    banner.hidden = warn === null;
    setText(banner, warn ?? "");
    cat.setAttribute("aria-pressed", String(c.on));
    cat.setAttribute("aria-label", c.catLabel);

    for (const [id, b] of keyEls) {
      const [cls, txt] = keyVisual(s, id);
      b.classList.remove("s-active", "s-planned", "s-free");
      b.classList.add(cls);
      b.setAttribute("aria-pressed", String(s.mode === "all" || s.blocked.includes(id)));
      b.setAttribute("aria-label", `${b.dataset.name ?? id}, ${txt}`);
      b.setAttribute("aria-disabled", String(s.mode === "all"));
      const kled = b.firstElementChild as HTMLElement;
      kled.hidden = cls !== "s-active";
    }

    const legendKey = JSON.stringify(c.legend);
    if (legendKey !== lastLegend) {
      lastLegend = legendKey;
      legend.replaceChildren(
        ...c.legend.map((it) => h("span", { class: "it" }, h("span", { class: `sw ${it.swatch}` }), it.text)),
      );
    }

    const all = s.mode === "all";
    lockall.setAttribute("aria-pressed", String(all));
    setText(lockLabel, all ? t("lock.off") : t("lock.on"));
    lockall.replaceChildren(padlock(all), lockLabel);

    const parts = shortcutParts(s.shortcut, s.platform);
    const scKey = JSON.stringify([parts, ui.recording, ui.shortcutError, all, lang()]);
    if (scKey !== lastShortcut) {
      lastShortcut = scKey;
      const nodes: Node[] = [];
      if (ui.shortcutError) {
        nodes.push(
          h("span", {
            class: "error",
            attrs: { role: "alert" },
            text: shortcutErrorText(ui.shortcutError, s.platform),
          }),
        );
      }
      if (ui.recording) {
        nodes.push(
          h("span", { class: "recording", attrs: { role: "status" }, text: t("shortcut.recording") }),
        );
      } else {
        nodes.push(...parts.map((p) => h("kbd", { text: p })));
      }
      setText(change, ui.recording ? t("shortcut.cancel") : t("shortcut.change"));
      change.disabled = all;
      change.setAttribute(
        "aria-label",
        ui.recording ? t("shortcut.cancelAria") : t("shortcut.changeAria", { sc: parts.join(" + ") }),
      );
      scInfo.replaceChildren(...nodes);
    }
    setTotal(s.total);
  }

  function setTotal(total: number): void {
    setText(count, formatCount(total));
    setText(countText, counterText(total));
  }

  return { el, cat, zz, keyEl: (id) => keyEls.get(id), update, setTotal };
}
