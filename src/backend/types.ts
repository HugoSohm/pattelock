import type { Lang } from "../i18n.ts";
import type { AppState, KeyId, KeyIntercepted, Settings, Shortcut } from "../types.ts";

/** Tout ce que l'UI demande au cœur de l'app (le Rust). L'état fait foi côté Rust. */
export interface Backend {
  /** La fenêtre est-elle visible dès le départ ? (Dans l'app, elle s'affiche après le premier rendu.) */
  startsVisible: boolean;
  /** État initial. */
  init(): Promise<AppState>;
  onState(cb: (s: AppState) => void): void;
  onTotal(cb: (total: number) => void): void;
  onIntercept(cb: (e: KeyIntercepted) => void): void;
  /** Fenêtre affichée ou cachée / réduite (pour couper les animations). */
  onWindowVisibility(cb: (visible: boolean) => void): void;
  /** Position du curseur global, relative au centre du chat, en px CSS (ou null). */
  onGlobalCursor(cb: (pos: { x: number; y: number } | null) => void): void;

  /** Clic sur le chat : Off <-> FKeys, et All -> Off. */
  catClicked(): Promise<void>;
  /** Bouton « Verrouiller / Déverrouiller tout le clavier ». */
  toggleLockAll(): Promise<void>;
  toggleKey(id: KeyId): Promise<void>;
  /** Coche ou décoche toutes les touches de la bande. */
  setAllKeys(blocked: boolean): Promise<void>;

  /** Suspend le raccourci global pendant l'enregistrement d'un nouveau. */
  beginShortcutCapture(): Promise<void>;
  endShortcutCapture(): Promise<void>;
  /** Rejette avec un message lisible si la combinaison est refusée ou déjà prise. */
  setShortcut(s: Shortcut): Promise<void>;

  updateSettings(patch: Partial<Settings>): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  /** Télécharge et installe la mise à jour proposée, puis relance l'app. */
  installUpdate(): Promise<void>;
  /** Langue réellement affichée, pour traduire le menu du tray. */
  setUiLanguage(lang: Lang): void;
  /** Touche avalée dans la fenêtre de l'app elle-même (compteur). */
  reportLocalKey(key: string): void;
  /** Indique où se trouve le chat dans la fenêtre (pour le suivi du curseur global). */
  setCatAnchor(anchor: { x: number; y: number; tracking: boolean }): void;

  minimize(): Promise<void>;
  hide(): Promise<void>;
  /** Le premier rendu est fait : la fenêtre peut s'afficher. */
  uiReady(): Promise<void>;
}
