import { BLOCKABLE_CODES, charLabel, isLayoutCode, isNumpadCode, MODIFIER_CODES } from "../keys.ts";
import type { Shortcut, ShortcutErrorCode } from "../types.ts";

export interface RecorderHandlers {
  /** Enregistre la combinaison ; rejette avec un message si elle est refusée. */
  save(s: Shortcut): Promise<void>;
  begin(): Promise<void>;
  end(): Promise<void>;
  /** L'état d'enregistrement ou le message d'erreur a changé. */
  changed(recording: boolean, error: ShortcutErrorCode | null): void;
}

/** « Changer » : enregistre la prochaine combinaison pressée dans la fenêtre. */
export class ShortcutRecorder {
  private recording = false;
  private errorTimer: number | undefined;

  constructor(private readonly h: RecorderHandlers) {
    window.addEventListener("keydown", (e) => this.onKey(e), { capture: true });
    window.addEventListener("blur", () => {
      if (this.recording) void this.stop(null);
    });
  }

  get active(): boolean {
    return this.recording;
  }

  toggle(): void {
    if (this.recording) void this.stop(null);
    else void this.start();
  }

  private async start(): Promise<void> {
    this.recording = true;
    this.setError(null);
    await this.h.begin().catch(() => {});
  }

  private async stop(error: ShortcutErrorCode | null): Promise<void> {
    this.recording = false;
    this.setError(error);
    await this.h.end().catch(() => {});
  }

  private setError(error: ShortcutErrorCode | null): void {
    window.clearTimeout(this.errorTimer);
    this.h.changed(this.recording, error);
    if (error) {
      this.errorTimer = window.setTimeout(() => this.h.changed(this.recording, null), 6000);
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || MODIFIER_CODES.has(e.code)) return;
    if (e.code === "Escape" && !(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)) {
      void this.stop(null);
      return;
    }
    if (BLOCKABLE_CODES.has(e.code) || isNumpadCode(e.code)) {
      void this.stop("blockable");
      return;
    }
    const shortcut: Shortcut = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
      key: e.code,
    };
    void keyLabel(e)
      .then((label) => {
        if (label) shortcut.label = label;
        return this.h.save(shortcut);
      })
      .then(() => this.stop(null))
      .catch((err: unknown) => this.stop(isErrorCode(err) ? err : "refused"));
  }
}

interface LayoutMap {
  get(code: string): string | undefined;
}

/** Keyboard Map API : absente de lib.dom, disponible dans WebView2 (Windows) seulement. */
interface NavigatorWithKeyboard {
  keyboard?: { getLayoutMap(): Promise<LayoutMap> };
}

/**
 * Caractère imprimé sur la touche dans la disposition de l'utilisateur (A sur la position
 * Q d'un AZERTY). Les autres touches (Espace, flèches, chiffres...) sont nommées à
 * l'affichage, dans la langue courante.
 */
async function keyLabel(e: KeyboardEvent): Promise<string | undefined> {
  if (!isLayoutCode(e.code)) return undefined;
  const typed = e.key;
  const alt = e.altKey;
  // La carte donne le caractère sans modificateur : * et non µ (Maj + *) sur un AZERTY,
  // E et non € (AltGr, soit Ctrl + Alt, + E).
  const keyboard = (navigator as NavigatorWithKeyboard).keyboard;
  const map = await keyboard?.getLayoutMap().catch(() => undefined);
  const base = map?.get(e.code);
  if (base) return charLabel(base);
  // Sans la carte, `key` subit les modificateurs. Option (Mac) compose des symboles qui
  // ne sont pas sur la touche : on ne garde alors que les lettres.
  if (alt && !/^[a-z]$/i.test(typed)) return undefined;
  return charLabel(typed);
}

const ERROR_CODES: readonly ShortcutErrorCode[] = [
  "missingKey",
  "missingModifier",
  "blockable",
  "unsupported",
  "taken",
  "refused",
];

function isErrorCode(v: unknown): v is ShortcutErrorCode {
  return typeof v === "string" && (ERROR_CODES as readonly string[]).includes(v);
}
