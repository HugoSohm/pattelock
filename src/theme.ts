import type { ThemePref } from "./types.ts";

const DARK_QUERY = window.matchMedia("(prefers-color-scheme: dark)");

/**
 * Applique le thème sur <html data-theme>. En mode « Système », suit l'OS en direct :
 * la fenêtre Tauri n'a pas de thème forcé, donc `prefers-color-scheme` reflète l'OS.
 */
export class ThemeController {
  private pref: ThemePref = "system";
  private applied: "light" | "dark" | null = null;

  constructor(private readonly onChange: (dark: boolean) => void) {
    DARK_QUERY.addEventListener("change", () => {
      if (this.pref === "system") this.apply();
    });
  }

  get dark(): boolean {
    return this.resolve() === "dark";
  }

  setPref(pref: ThemePref): void {
    if (pref === this.pref && this.applied) return;
    this.pref = pref;
    this.apply();
  }

  private resolve(): "light" | "dark" {
    if (this.pref === "system") return DARK_QUERY.matches ? "dark" : "light";
    return this.pref;
  }

  private apply(): void {
    const theme = this.resolve();
    if (theme === this.applied) return;
    this.applied = theme;
    document.documentElement.dataset.theme = theme;
    this.onChange(theme === "dark");
  }
}

export function applyAccent(color: string): void {
  document.documentElement.style.setProperty("--accent", color);
}
