import { copyFor, counterText, customVisual, keyVisual } from "../copy.ts";
import { formatCount, type Lang, lang, t } from "../i18n.ts";
import { customKeyLabel, keyGroups, modifierGroup, shortcutParts, shortcutPieces } from "../keys.ts";
import {
  type AppState,
  KEY_IDS,
  type KeyId,
  MAX_CUSTOM_KEYS,
  type Platform,
  type ShortcutErrorCode,
} from "../types.ts";

const KEY_COUNT = KEY_IDS.length;

import type { CustomKeyFailure } from "./customKeyRecorder.ts";
import { h, setText } from "./dom.ts";
import { close, padlock, paw } from "./icons.ts";
import { guardBanner, shortcutErrorText } from "./noticeView.ts";

export interface MainHandlers {
  onCat(): void;
  onLockAll(): void;
  onKey(id: KeyId): void;
  onAllKeys(blocked: boolean): void;
  onAddCustom(): void;
  onRemoveCustom(code: string): void;
  onInstallUpdate(): void;
  onChangeShortcut(): void;
  onDismissCustomError(): void;
}

export interface UiState {
  recording: boolean;
  shortcutError: ShortcutErrorCode | null;
  customRecording: boolean;
  customError: CustomKeyFailure | null;
}

export interface MainView {
  el: HTMLElement;
  /** Bouton du chat : le canvas animé y est inséré. */
  cat: HTMLButtonElement;
  /** Les « z » du chat endormi. */
  zz: HTMLElement;
  /** Élément d'une touche interceptée (`F5`, `custom`...), pour orienter l'oreille du chat. */
  keyEl(id: string): HTMLElement | undefined;
  update(s: AppState, ui: UiState): void;
  setTotal(total: number): void;
  /** Recalcule ce qui tient sur la rangée des touches ajoutées (taille de fenêtre changée). */
  relayout(): void;
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
  // « Tout sélectionner » / « Tout désélectionner » : action de la bande, posée au-dessus
  // de son bord droit (la légende reste purement informative).
  const allKeys = h("button", { class: "linkbtn", attrs: { type: "button" } });
  let allBlocked = false;
  allKeys.addEventListener("click", () => handlers.onAllKeys(!allBlocked));
  strip.append(allKeys);

  // Touches ajoutées : 3e rangée de la bande, sur une seule ligne. Ce qui ne tient pas se
  // replie derrière « +N », qui déplie la rangée (la page défile alors si besoin).
  const customRow = h("div", { class: "krow custom" });
  strip.append(customRow);
  const more = h("button", { class: "key wide more", attrs: { type: "button" } });
  const addKey = h("button", { class: "key add", attrs: { type: "button" } });
  const chips: HTMLButtonElement[] = [];
  let expanded = false;
  more.addEventListener("click", () => {
    expanded = !expanded;
    fit();
  });
  addKey.addEventListener("click", () => handlers.onAddCustom());
  // Carte d'erreur d'une touche refusée, sous la bande.
  const cardBody = h("div", { class: "ccard-body" });
  const cardClose = h("button", { class: "toast-close", attrs: { type: "button" } }, close());
  cardClose.addEventListener("click", () => handlers.onDismissCustomError());
  const cardAction = h("button", { class: "change", attrs: { type: "button" } });
  cardAction.addEventListener("click", () => handlers.onChangeShortcut());
  const card = h(
    "div",
    { class: "ccard", attrs: { role: "alert" } },
    h("span", { class: "ccard-ico", attrs: { "aria-hidden": "true" }, text: "!" }),
    cardBody,
    cardAction,
    cardClose,
  );
  card.hidden = true;

  const count = h("b");
  const countText = h("span");
  const activity = h("div", { class: "activity" }, paw(), h("span", {}, count, " ", countText));

  // Mise à jour : notification flottante en haut au centre, hors du flux de la page.
  // On peut la masquer pour la version proposée (état d’interface, non mémorisé).
  const updateText = h("span");
  const updateBtn = h("button", { class: "change", attrs: { type: "button" } });
  updateBtn.addEventListener("click", () => handlers.onInstallUpdate());
  const updateClose = h("button", { class: "toast-close", attrs: { type: "button" } }, close());
  let dismissedUpdate: string | null = null;
  let lastState: AppState | null = null;
  updateClose.addEventListener("click", () => {
    const u = lastState?.update;
    if (u) dismissedUpdate = `${u.version}:${u.status}`;
    if (lastState) renderUpdate(lastState);
  });
  const updateBar = h(
    "div",
    { class: "update-bar", attrs: { role: "status" } },
    paw(),
    updateText,
    updateBtn,
    updateClose,
  );

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
    // Légende et compteur sur une même ligne : la bande à deux rangées prend de la hauteur.
    h("div", { class: "meta" }, legend, activity),
    card,
    banner,
    updateBar,
    h("div", { class: "footer" }, lockall, shortcut),
  );

  function buildKeys(platform: Platform): void {
    for (const r of strip.querySelectorAll(".krow:not(.custom)")) r.remove();
    keyEls.clear();
    for (const groups of keyGroups(platform)) {
      const row = h("div", { class: "krow" });
      strip.insertBefore(row, customRow);
      for (const group of groups) {
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
        row.append(g);
      }
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
    const warn = guardBanner(s.guard, s.platform, s.customKeys);
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
    allBlocked = s.blocked.length === KEY_COUNT;
    allKeys.hidden = all;
    setText(allKeys, allBlocked ? t("keys.deselectAll") : t("keys.selectAll"));
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
        // Pixelify Sans dessine certains symboles (* ^ ¨...) minuscules : Silkscreen les dessine lisibles.
        nodes.push(
          ...parts.map((p) => h("kbd", { text: p, class: /^[^\p{L}\p{N}]$/u.test(p) ? "sym" : "" })),
        );
      }
      setText(change, ui.recording ? t("shortcut.cancel") : t("shortcut.change"));
      change.disabled = all;
      change.setAttribute(
        "aria-label",
        ui.recording ? t("shortcut.cancelAria") : t("shortcut.changeAria", { sc: parts.join(" + ") }),
      );
      scInfo.replaceChildren(...nodes);
    }
    renderUpdate(s);
    renderCustom(s, ui);
    setTotal(s.total);
  }

  let lastCustom = "";

  function renderCustom(s: AppState, ui: UiState): void {
    const all = s.mode === "all";
    const sig = JSON.stringify([s.customKeys, s.mode, lang(), ui.customRecording]);
    if (sig !== lastCustom) {
      lastCustom = sig;
      const [cls, txt] = customVisual(s);
      chips.length = 0;
      for (const k of s.customKeys) {
        const label = customKeyLabel(k, s.platform);
        const action = all ? "" : `, ${t("custom.remove")}`;
        const b = h(
          "button",
          {
            class: `key wide ckey ${cls}`,
            attrs: {
              type: "button",
              "aria-label": `${label}, ${txt}${action}`,
              "aria-disabled": String(all),
            },
          },
          h("span", { class: "kled", attrs: { "aria-hidden": "true" } }),
          h("span", { class: /^[^\p{L}\p{N}]$/u.test(label) ? "sym" : "", text: label }),
          h("span", { class: "kx", attrs: { "aria-hidden": "true" } }, close()),
        );
        (b.firstElementChild as HTMLElement).hidden = cls !== "s-active";
        b.addEventListener("click", () => {
          if (!all) handlers.onRemoveCustom(k.code);
        });
        chips.push(b);
      }
      const rec = ui.customRecording;
      addKey.classList.toggle("recording", rec);
      setText(addKey, rec ? t("custom.recording") : t("custom.add"));
      addKey.setAttribute("aria-label", rec ? t("custom.cancelAria") : t("custom.addAria"));
      // En mode clavier entier, le hook avale tout : impossible d'enregistrer une touche.
      addKey.disabled = all;
      addKey.hidden = s.customKeys.length >= MAX_CUSTOM_KEYS;
      customRow.replaceChildren(...chips, more, addKey);
    }
    fit();

    renderCard(s, ui.customError);
  }

  let lastCard = "";

  /**
   * Carte d'erreur d'une touche refusée : titre, explication qui nomme la touche, et pour
   * un conflit avec le raccourci, le raccourci avec la touche en cause mise en évidence et
   * un bouton pour le changer.
   */
  function renderCard(s: AppState, failure: CustomKeyFailure | null): void {
    const sig = JSON.stringify([failure, s.shortcut, lang()]);
    if (sig === lastCard) return;
    lastCard = sig;
    card.hidden = failure === null;
    if (!failure) return;
    const { error, key } = failure;
    // Le raccourci, touche en cause mise en évidence.
    const hit = key.code === s.shortcut.key ? "key" : modifierGroup(key.code);
    const sc = h(
      "span",
      { class: "ccard-keys" },
      ...shortcutPieces(s.shortcut, s.platform).flatMap((p, i) => {
        const k = kbd(p.text);
        if (p.id === hit) k.classList.add("hit");
        return i === 0 ? [k] : [h("span", { text: "+" }), k];
      }),
    );
    // Le texte est découpé autour de {key} et {sc} pour les afficher comme des touches :
    // `t` laisse en place les paramètres qu'on ne lui passe pas.
    const marks: Record<string, Node> = { "{key}": kbd(customKeyLabel(key, s.platform)), "{sc}": sc };
    const raw = t(`customError.${error}`, { max: MAX_CUSTOM_KEYS });
    const body = raw.split(/(\{key\}|\{sc\})/).map((part) => marks[part] ?? document.createTextNode(part));
    cardBody.replaceChildren(
      h("p", { class: "ccard-title", text: t(`customError.${error}.title`) }),
      h("p", { class: "ccard-text" }, ...body),
    );
    cardAction.hidden = error !== "shortcut";
    setText(cardAction, t("customError.changeShortcut"));
    card.classList.toggle("shake", error === "shortcut");
    cardClose.setAttribute("aria-label", t("customError.dismiss"));
    cardClose.title = t("customError.dismiss");
  }

  function kbd(text: string): HTMLElement {
    return h("kbd", { text, class: /^[^\p{L}\p{N}]$/u.test(text) ? "sym" : "" });
  }

  /** Affiche les touches ajoutées qui tiennent sur une ligne, le reste derrière « +N ». */
  function fit(): void {
    for (const c of chips) c.hidden = false;
    more.hidden = false;
    customRow.classList.remove("open");
    // Mesure avec le libellé le plus large possible.
    setText(more, t("custom.more", { n: chips.length }));
    const avail = customRow.clientWidth;
    // Vue cachée (Réglages) : on recalculera au prochain rendu.
    if (avail === 0) return;
    const gap = Number.parseFloat(getComputedStyle(customRow).columnGap) || 0;
    const widths = chips.map((c) => c.offsetWidth + gap);
    const add = addKey.hidden ? 0 : addKey.offsetWidth + gap;
    const total = widths.reduce((a, b) => a + b, 0) + add - gap;
    if (total <= avail) {
      more.hidden = true;
      expanded = false;
      return;
    }
    if (expanded) {
      customRow.classList.add("open");
      setText(more, t("custom.less"));
      more.setAttribute("aria-expanded", "true");
      more.setAttribute("aria-label", t("custom.lessAria"));
      return;
    }
    let used = more.offsetWidth + add;
    let shown = 0;
    while (shown < chips.length && used + (widths[shown] ?? 0) <= avail) {
      used += widths[shown] ?? 0;
      shown++;
    }
    for (const c of chips.slice(shown)) c.hidden = true;
    const n = chips.length - shown;
    setText(more, t("custom.more", { n }));
    more.setAttribute("aria-expanded", "false");
    more.setAttribute("aria-label", t("custom.moreAria", { n }));
  }

  function renderUpdate(s: AppState): void {
    lastState = s;
    const u = s.update;
    updateBar.hidden = u === null || dismissedUpdate === `${u.version}:${u.status}`;
    if (!u) return;
    updateClose.setAttribute("aria-label", t("update.dismiss"));
    updateClose.title = t("update.dismiss");
    updateBar.classList.toggle("failed", u.status === "failed");
    switch (u.status) {
      case "available":
        setText(updateText, t("update.available", { version: u.version }));
        setText(updateBtn, t("update.install"));
        break;
      case "downloading":
        setText(
          updateText,
          u.progress === undefined
            ? t("update.downloadingNoSize")
            : t("update.downloading", { p: u.progress }),
        );
        break;
      case "installing":
        setText(updateText, t("update.installing"));
        break;
      case "failed":
        setText(updateText, t("update.failed"));
        setText(updateBtn, t("update.retry"));
        break;
    }
    const busy = u.status === "downloading" || u.status === "installing";
    updateBtn.hidden = busy;
    updateClose.hidden = busy;
  }

  function setTotal(total: number): void {
    setText(count, formatCount(total));
    setText(countText, counterText(total));
  }

  return {
    el,
    cat,
    zz,
    keyEl: (id) => (id === "custom" ? customRow : keyEls.get(id as KeyId)),
    update,
    setTotal,
    relayout: fit,
  };
}
