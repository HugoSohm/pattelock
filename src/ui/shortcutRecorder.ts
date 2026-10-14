import { BLOCKABLE_CODES, MODIFIER_CODES } from "../keys.ts";
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
    if (BLOCKABLE_CODES.has(e.code)) {
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
    // Caractère imprimé sur la touche (A sur la position Q d'un AZERTY). Les autres
    // touches (Espace, flèches...) sont nommées à l'affichage, dans la langue courante.
    if (e.key.length === 1 && e.key.trim()) shortcut.label = e.key.toUpperCase();
    void this.h
      .save(shortcut)
      .then(() => this.stop(null))
      .catch((err: unknown) => this.stop(isErrorCode(err) ? err : "refused"));
  }
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
