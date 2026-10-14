/** Textes de l'écran principal selon l'état (pas de tiret cadratin dans l'UI). */
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
      tag: "CLAVIER ENTIER VERROUILLÉ",
      title: "Le chat dort sur tout le clavier",
      sub: `Toutes les touches sont ignorées, sauf ${sc}. La souris fonctionne toujours.`,
      hint: `Clique sur le chat ou fais ${sc} pour tout déverrouiller`,
      catLabel: "Le chat dort sur tout le clavier. Cliquer pour le réveiller et tout déverrouiller.",
      legend: [
        { swatch: "sw-active", text: "verrouillée" },
        { swatch: "sw-all", text: `tout le reste du clavier aussi, sauf ${sc}` },
      ],
    };
  }
  if (s.mode === "fkeys") {
    const n = s.blocked.length;
    const sub =
      n === 0
        ? "Aucune touche n’est choisie, tout le clavier répond normalement."
        : n === 1
          ? "1 touche est désactivée en ce moment, le reste du clavier répond normalement."
          : `${n} touches sont désactivées en ce moment, le reste du clavier répond normalement.`;
    return {
      on: true,
      tag: "BLOCAGE EN COURS",
      title: "Le chat dort",
      sub,
      hint: "Clique sur le chat pour le réveiller",
      catLabel: "Le chat dort, blocage en cours. Cliquer pour le réveiller.",
      legend: [
        { swatch: "sw-active", text: "bloquée en ce moment" },
        { swatch: "sw-free", text: "libre" },
      ],
    };
  }
  return {
    on: false,
    tag: "EN PAUSE, RIEN N’EST BLOQUÉ",
    title: "Le chat est réveillé",
    sub: "Clavier libre, toutes les touches répondent.",
    hint: "Clique sur le chat pour l’endormir",
    catLabel: "Le chat est réveillé, protection en pause. Cliquer pour l’endormir.",
    legend: [
      { swatch: "sw-planned", text: "prévue, pas encore bloquée" },
      { swatch: "sw-free", text: "libre" },
    ],
  };
}

export function keyVisual(s: AppState, id: KeyId): [KeyVisual, string] {
  const blocked = s.blocked.includes(id);
  if (s.mode === "all") return ["s-active", "verrouillée avec tout le clavier"];
  if (s.mode === "fkeys" && blocked) return ["s-active", "bloquée en ce moment"];
  if (blocked) return ["s-planned", "prévue, pas encore bloquée"];
  return ["s-free", "libre"];
}

const NUMBER = new Intl.NumberFormat("fr-FR");

/** « 1 284 » avec espace fine insécable. */
export function formatCount(n: number): string {
  return NUMBER.format(n);
}
