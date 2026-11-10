import { isStripCode, MODIFIER_CODES, usedByShortcut } from "../keys.ts";
import type { CustomKey, CustomKeyErrorCode, Shortcut } from "../types.ts";
import { keyLabel } from "./shortcutRecorder.ts";

/** Touche refusée, avec la raison : de quoi afficher un message qui la nomme. */
export interface CustomKeyFailure {
  error: CustomKeyErrorCode;
  key: CustomKey;
}

export interface CustomRecorderHandlers {
  /** Ajoute la touche ; rejette avec un code si elle est refusée. */
  save(k: CustomKey): Promise<void>;
  /** Raccourci actuel : ses touches ne peuvent pas être bloquées. */
  shortcut(): Shortcut;
  /** L'état d'enregistrement ou l'erreur a changé. */
  changed(recording: boolean, failure: CustomKeyFailure | null): void;
}

/** Durée d'affichage d'une erreur ; plus longue pour un conflit avec le raccourci, qui propose une action. */
const ERROR_MS = 6000;
const SHORTCUT_ERROR_MS = 12000;

/**
 * « + Touche » : enregistre la prochaine touche pressée dans la fenêtre, par sa position
 * physique. Échap seul annule.
 *
 * Un modificateur (Maj, Ctrl, Alt, Win...) est retenu quand on le relâche sans avoir pressé
 * d'autre touche : Maj + A ajoute A. AltGr arrive sous Windows comme Ctrl gauche puis Alt
 * droit : le dernier modificateur pressé l'emporte. Fn n'envoie rien au système : elle ne
 * peut pas être enregistrée.
 */
export class CustomKeyRecorder {
  private recording = false;
  private errorTimer: number | undefined;
  /** Touche enregistrée encore enfoncée : son relâchement ne doit rien déclencher. */
  private pressed: string | null = null;
  /** Modificateur pressé seul, retenu à son relâchement. */
  private pendingModifier: string | null = null;

  constructor(private readonly h: CustomRecorderHandlers) {
    window.addEventListener("keydown", (e) => this.onKeyDown(e), { capture: true });
    window.addEventListener("keyup", (e) => this.onKeyUp(e), { capture: true });
    window.addEventListener("blur", () => this.cancel());
  }

  get active(): boolean {
    return this.recording;
  }

  toggle(): void {
    if (this.recording) this.stop(null);
    else this.start();
  }

  cancel(): void {
    if (this.recording) this.stop(null);
  }

  /** Ferme le message d'erreur. */
  dismiss(): void {
    window.clearTimeout(this.errorTimer);
    this.h.changed(this.recording, null);
  }

  private start(): void {
    this.recording = true;
    this.pendingModifier = null;
    this.setFailure(null);
  }

  private stop(failure: CustomKeyFailure | null): void {
    this.recording = false;
    this.pendingModifier = null;
    this.setFailure(failure);
  }

  private setFailure(failure: CustomKeyFailure | null): void {
    window.clearTimeout(this.errorTimer);
    this.h.changed(this.recording, failure);
    if (failure) {
      const ms = failure.error === "shortcut" ? SHORTCUT_ERROR_MS : ERROR_MS;
      this.errorTimer = window.setTimeout(() => this.h.changed(this.recording, null), ms);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (MODIFIER_CODES.has(e.code)) {
      this.pendingModifier = e.code;
      return;
    }
    this.pendingModifier = null;
    if (e.code === "Escape" && !(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)) {
      this.stop(null);
      return;
    }
    this.pressed = e.code;
    void keyLabel(e).then((label) => this.record(label ? { code: e.code, label } : { code: e.code }));
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.recording && this.pendingModifier !== null && MODIFIER_CODES.has(e.code)) {
      e.preventDefault();
      e.stopPropagation();
      const code = this.pendingModifier;
      this.pendingModifier = null;
      this.record({ code });
      return;
    }
    // Espace relâché sur le bouton « + Touche » le cliquerait et relancerait l'enregistrement.
    if (e.code !== this.pressed) return;
    this.pressed = null;
    e.preventDefault();
    e.stopPropagation();
  }

  private record(key: CustomKey): void {
    if (isStripCode(key.code)) {
      this.stop({ error: "inStrip", key });
      return;
    }
    if (usedByShortcut(key.code, this.h.shortcut())) {
      this.stop({ error: "shortcut", key });
      return;
    }
    this.h
      .save(key)
      .then(() => this.stop(null))
      .catch((err: unknown) => this.stop({ error: isErrorCode(err) ? err : "refused", key }));
  }
}

const ERROR_CODES: readonly CustomKeyErrorCode[] = [
  "inStrip",
  "unsupported",
  "shortcut",
  "duplicate",
  "full",
  "refused",
];

function isErrorCode(v: unknown): v is CustomKeyErrorCode {
  return typeof v === "string" && (ERROR_CODES as readonly string[]).includes(v);
}
