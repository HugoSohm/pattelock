import type { GuardStatus, Platform } from "../types.ts";
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

  function update(guard: GuardStatus, platform: Platform): boolean {
    if (guard.kind === "needsAccessibility") {
      title.textContent = "Pattelock a besoin de l’Accessibilité";
      text.textContent =
        platform === "macos"
          ? "Pour bloquer des touches, macOS doit autoriser Pattelock dans Réglages Système, Confidentialité et sécurité, Accessibilité. Coche Pattelock dans la liste, puis reviens ici."
          : "Pattelock n’a pas l’autorisation de lire le clavier.";
      code.hidden = true;
      primary.textContent = "Ouvrir les Réglages Système";
      action = onOpenSettings;
      return true;
    }
    if (guard.kind === "needsInputGroup") {
      title.textContent = "Accès au clavier nécessaire";
      text.textContent =
        "Sous Wayland, Pattelock passe par /dev/input et /dev/uinput. Lance cette commande dans un terminal, puis ferme ta session et reconnecte-toi :";
      code.hidden = false;
      code.textContent = guard.command;
      primary.textContent = "Réessayer";
      action = onRetry;
      return true;
    }
    return false;
  }

  return { el, update };
}

/** Bandeau discret sous l'indice quand le blocage est partiel ou impossible. */
export function guardBanner(guard: GuardStatus): string | null {
  if (guard.kind === "unavailable") return guard.reason;
  if (guard.kind === "partial") return guard.reason;
  return null;
}
