import { t } from "../i18n.ts";
import { keyGroups } from "../keys.ts";
import type { GuardStatus, Platform, ShortcutErrorCode } from "../types.ts";
import { h } from "./dom.ts";
import { paw } from "./icons.ts";

export interface NoticeView {
  el: HTMLElement;
  /** Affiche l'écran si le blocage a besoin d'une action de l'utilisateur. */
  update(guard: GuardStatus, platform: Platform): boolean;
}

/** Écran plein (permissions manquantes), à la place de l'écran principal. */
export function createNoticeView(onOpenSettings: () => void, onRetry: () => void): NoticeView {
  const title = h("h1", { class: "title" });
  const text = h("p");
  const code = h("code");
  const primary = h("button", { class: "btn-ink", attrs: { type: "button" } });
  const el = h("div", { class: "notice" }, paw(), title, text, code, primary);
  let action: () => void = () => {};
  primary.addEventListener("click", () => action());

  function update(guard: GuardStatus): boolean {
    if (guard.kind === "needsAccessibility") {
      title.textContent = t("notice.ax.title");
      text.textContent = t("notice.ax.text");
      code.hidden = true;
      primary.textContent = t("notice.ax.button");
      action = onOpenSettings;
      return true;
    }
    if (guard.kind === "needsInputGroup") {
      title.textContent = t("notice.input.title");
      text.textContent = t("notice.input.text");
      code.hidden = false;
      code.textContent = guard.command;
      primary.textContent = t("notice.input.button");
      action = onRetry;
      return true;
    }
    return false;
  }

  return { el, update };
}

/** Bandeau discret sous le compteur quand le blocage est partiel ou impossible. */
export function guardBanner(guard: GuardStatus, platform: Platform): string | null {
  if (guard.kind === "unavailable") {
    const reason = t(`reason.${guard.reason}`);
    return guard.detail ? `${reason} (${guard.detail})` : reason;
  }
  if (guard.kind === "partial") {
    const names = new Map(
      keyGroups(platform)
        .flat()
        .flatMap((g) => g.map((k) => [k.id, k.name] as const)),
    );
    const keys = guard.unavailable.map((k) => names.get(k) ?? k).join(", ");
    return t("reason.partial", { keys });
  }
  return null;
}

/** Message d'erreur du raccourci, dans la langue courante. */
export function shortcutErrorText(code: ShortcutErrorCode, platform: Platform): string {
  if (code === "missingModifier") {
    const or = t("error.or");
    const mods = platform === "macos" ? `Ctrl, Option ${or} Cmd` : `Ctrl ${or} Alt`;
    return t("error.missingModifier", { mods });
  }
  return t(`error.${code}`);
}
