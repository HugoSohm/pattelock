import { BLOCKABLE_CODES, codeLabel, MODIFIER_CODES } from "../keys.ts";
import type { Shortcut } from "../types.ts";

export interface RecorderHandlers {
  /** Enregistre la combinaison ; rejette avec un message si elle est refusée. */
  save(s: Shortcut): Promise<void>;
  begin(): Promise<void>;
  end(): Promise<void>;
  /** L'état d'enregistrement ou le message d'erreur a changé. */
  changed(recording: boolean, error: string | null): void;
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

  private async stop(error: string | null): Promise<void> {
    this.recording = false;
    this.setError(error);
    await this.h.end().catch(() => {});
  }

  private setError(error: string | null): void {
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
      void this.stop("Cette touche peut être bloquée, choisis-en une autre.");
      return;
    }
    const label = e.key.length === 1 && e.key.trim() ? e.key.toUpperCase() : codeLabel(e.code);
    const shortcut: Shortcut = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
      key: e.code,
      label,
    };
    void this.h
      .save(shortcut)
      .then(() => this.stop(null))
      .catch((err: unknown) => this.stop(typeof err === "string" ? err : "Combinaison refusée."));
  }
}
