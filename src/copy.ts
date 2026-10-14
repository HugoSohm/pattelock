/** Textes de l'écran principal selon l'état, dans la langue courante. */
import { t } from "./i18n.ts";
import { shortcutText } from "./keys.ts";
import type { AppState, KeyId } from "./types.ts";

export type KeyVisual = "s-active" | "s-planned" | "s-free";

export interface LegendItem {
  swatch: "sw-active" | "sw-free" | "sw-planned" | "sw-all";
  text: string;
}

export interface Copy {
  on: boolean;
  tag: string;
  title: string;
  sub: string;
  hint: string;
  catLabel: string;
  legend: LegendItem[];
}

export function copyFor(s: AppState): Copy {
  const sc = shortcutText(s.shortcut, s.platform);
  if (s.mode === "all") {
    return {
      on: true,
      tag: t("tag.all"),
      title: t("title.all"),
      sub: t("sub.all", { sc }),
      hint: t("hint.all", { sc }),
      catLabel: t("cat.all"),
      legend: [
        { swatch: "sw-active", text: t("state.locked") },
        { swatch: "sw-all", text: t("legend.allRest", { sc }) },
      ],
    };
  }
  if (s.mode === "fkeys") {
    const n = s.blocked.length;
    return {
      on: true,
      tag: t("tag.fkeys"),
      title: t("title.fkeys"),
      sub: n === 0 ? t("sub.fkeys.zero") : n === 1 ? t("sub.fkeys.one") : t("sub.fkeys.many", { n }),
      hint: t("hint.fkeys"),
      catLabel: t("cat.fkeys"),
      legend: [
        { swatch: "sw-active", text: t("state.blocked") },
        { swatch: "sw-free", text: t("state.free") },
      ],
    };
  }
  return {
    on: false,
    tag: t("tag.off"),
    title: t("title.off"),
    sub: t("sub.off"),
    hint: t("hint.off"),
    catLabel: t("cat.off"),
    legend: [
      { swatch: "sw-planned", text: t("state.planned") },
      { swatch: "sw-free", text: t("state.free") },
    ],
  };
}

export function keyVisual(s: AppState, id: KeyId): [KeyVisual, string] {
  const blocked = s.blocked.includes(id);
  if (s.mode === "all") return ["s-active", t("state.lockedAll")];
  if (s.mode === "fkeys" && blocked) return ["s-active", t("state.blocked")];
  if (blocked) return ["s-planned", t("state.planned")];
  return ["s-free", t("state.free")];
}

/** « coup de patte évité » ou « coups de patte évités ». */
export function counterText(n: number): string {
  return n <= 1 ? t("counter.one") : t("counter.many");
}
