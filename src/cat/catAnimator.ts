/**
 * Anime le chat en pixel art : uniquement des changements de frames (pixels de la grille)
 * et des translations d'un nombre entier de pixels-sprite, rythmés par paliers.
 *
 * La boucle tourne à ~20 images/s (minuterie + requestAnimationFrame) et s'arrête
 * complètement quand la fenêtre est cachée ou réduite, ou si l'utilisateur préfère
 * réduire les animations.
 */
import { type AnimFrame, BASE_POSE, buildFrame, type Ear, type Pose, SLEEP_POSE } from "./animFrames.ts";
import type { SpriteCanvas } from "./render.ts";
import type { Palette } from "./skins.ts";

export type Mood = "sleep" | "awake";

export type ActionName =
  | "whip"
  | "groom"
  | "tilt"
  | "earTurn"
  | "jump"
  | "sweep"
  | "earTwitch"
  | "mlem"
  | "tailTip"
  | "blink"
  | "doubleBlink"
  | "wake"
  | "fallAsleep";

interface Step {
  dur: number;
  pose?: Partial<Pose>;
  /** Décalage vertical en pixels-sprite (négatif = vers le haut). */
  dy?: number;
}

interface Running {
  name: ActionName;
  steps: Step[];
  start: number;
  total: number;
}

const TICK_MS = 50;
const BREATH_PERIOD = 2500;
const BREATH_HOLD = 1000;
const Z_CYCLE = 2400;
const Z_STEP = 200;
const Z_STAGGER = 800;
const REACTION_EAR_MS = 150;
const REACTION_BANG_MS = 400;
const POINTER_IDLE_MS = 5000;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

function steps(...s: Step[]): Step[] {
  return s;
}

function actionSteps(name: ActionName): Step[] {
  const side = Math.random() < 0.5 ? "earL" : "earR";
  const ear = (e: Ear): Partial<Pose> => ({ [side]: e });
  switch (name) {
    case "whip": {
      const loop = [
        { dur: 130, pose: { tail: "right" } },
        { dur: 130, pose: { tail: "straight" } },
        { dur: 160, pose: { tail: "hookHigh" } },
        { dur: 130, pose: { tail: "straight" } },
      ] satisfies Step[];
      return [...loop, ...loop, { dur: 130, pose: { tail: "right" } }];
    }
    case "groom":
      return steps(
        { dur: 250, pose: { paw: "mid", eyes: { kind: "half" } } },
        { dur: 250, pose: { paw: "mouth", eyes: { kind: "half" } } },
        { dur: 200, pose: { paw: "lick", eyes: { kind: "closed" } } },
        { dur: 200, pose: { paw: "mouth", eyes: { kind: "closed" } } },
        { dur: 200, pose: { paw: "lick", eyes: { kind: "closed" } } },
        { dur: 200, pose: { paw: "mouth", eyes: { kind: "half" } } },
        { dur: 200, pose: { paw: "mid", eyes: { kind: "half" } } },
      );
    case "tilt":
      return steps({ dur: 1000, pose: { headShift: Math.random() < 0.5 ? -1 : 1 } });
    case "earTurn":
      return steps({ dur: 600, pose: ear("turn") });
    case "jump":
      return steps({ dur: 110, dy: -1 }, { dur: 160, dy: -2 }, { dur: 110, dy: -1 });
    case "sweep":
      return steps(
        { dur: 300, pose: { eyes: { kind: "open", px: -1, py: 0 } } },
        { dur: 250, pose: { eyes: { kind: "open", px: 0, py: 0 } } },
        { dur: 300, pose: { eyes: { kind: "open", px: 1, py: 0 } } },
        { dur: 250, pose: { eyes: { kind: "open", px: 0, py: 0 } } },
      );
    case "earTwitch":
      return steps({ dur: 150, pose: ear("twitch") });
    case "mlem":
      return steps(
        { dur: 150, pose: { mouth: "mlem1" } },
        { dur: 250, pose: { mouth: "mlem2" } },
        { dur: 150, pose: { mouth: "mlem1" } },
      );
    case "tailTip":
      return steps({ dur: 800, pose: { tail: "tip" } });
    case "blink":
      return steps({ dur: 110, pose: { eyes: { kind: "closed" } } });
    case "doubleBlink":
      return steps(
        { dur: 100, pose: { eyes: { kind: "closed" } } },
        { dur: 120 },
        { dur: 100, pose: { eyes: { kind: "closed" } } },
      );
    case "wake":
      // ~500 ms : un œil, puis les deux, puis un bâillement.
      return steps(
        { dur: 140, pose: { eyes: { kind: "wink" } } },
        { dur: 110, pose: { eyes: { kind: "open", px: 0, py: 0 } } },
        { dur: 100, pose: { eyes: { kind: "closed" }, mouth: "yawn1" } },
        { dur: 150, pose: { eyes: { kind: "closed" }, mouth: "yawn2" } },
      );
    case "fallAsleep":
      // ~600 ms : yeux à moitié plissés, puis fermés, puis les « z ».
      return steps(
        { dur: 200, pose: { eyes: { kind: "half" } } },
        { dur: 400, pose: { eyes: { kind: "closed" } } },
      );
  }
}

function start(name: ActionName, now: number): Running {
  const s = actionSteps(name);
  return { name, steps: s, start: now, total: s.reduce((t, x) => t + x.dur, 0) };
}

function currentStep(r: Running, now: number): Step | null {
  let t = now - r.start;
  if (t < 0 || t >= r.total) return null;
  for (const s of r.steps) {
    if (t < s.dur) return s;
    t -= s.dur;
  }
  return null;
}

export interface CatAnimatorOptions {
  canvas: SpriteCanvas;
  /** Le bouton du chat (survol, position du « ! »). */
  host: HTMLElement;
  /** Conteneur des « z ». */
  zz: HTMLElement;
  /** Mouvements aléatoires automatiques (désactivables pour la page de démo). */
  auto?: boolean;
}

export class CatAnimator {
  private readonly canvas: SpriteCanvas;
  private readonly host: HTMLElement;
  private readonly zz: HTMLElement;
  private readonly zEls: HTMLSpanElement[];
  private readonly zStatic: HTMLSpanElement;
  private readonly bang: HTMLSpanElement;
  private readonly reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  private auto: boolean;
  private mood: Mood = "sleep";
  private palette: Palette | null = null;
  private dark = false;
  private visible = false;
  private hover = false;

  private transition: Running | null = null;
  private action: Running | null = null;
  private blink: Running | null = null;
  private reaction: { side: "earL" | "earR"; start: number } | null = null;
  private zStart = 0;
  private breathStart = 0;
  private nextIdle = 0;
  private nextBlink = 0;
  private nextTail = 0;
  private nextDetail = 0;

  private gaze: { px: -1 | 0 | 1; py: 0 | 1 } = { px: 0, py: 0 };
  private lastPointer = Number.NEGATIVE_INFINITY;

  private timer: number | undefined;
  private raf: number | undefined;

  constructor(opts: CatAnimatorOptions) {
    this.canvas = opts.canvas;
    this.host = opts.host;
    this.zz = opts.zz;
    this.auto = opts.auto ?? true;

    this.zz.replaceChildren();
    this.zEls = ["z", "z", "Z"].map((t, i) => {
      const s = document.createElement("span");
      s.className = `z z${i}`;
      s.textContent = t;
      this.zz.append(s);
      return s;
    });
    this.zStatic = document.createElement("span");
    this.zStatic.className = "z-static";
    this.zStatic.textContent = "z Z";
    this.zz.append(this.zStatic);

    this.bang = document.createElement("span");
    this.bang.className = "bang";
    this.bang.textContent = "!";
    this.bang.setAttribute("aria-hidden", "true");
    this.bang.hidden = true;
    this.host.append(this.bang);

    this.host.addEventListener("pointerenter", () => {
      this.hover = true;
      this.refresh();
    });
    this.host.addEventListener("pointerleave", () => {
      this.hover = false;
      this.refresh();
    });
    this.reducedQuery.addEventListener("change", () => this.restart());
  }

  private get reduced(): boolean {
    return this.reducedQuery.matches;
  }

  setLook(palette: Palette, dark: boolean): void {
    this.palette = palette;
    this.dark = dark;
    this.refresh();
  }

  /** Change l'humeur ; avec `animate`, joue la transition (l'état réel, lui, a déjà changé). */
  setMood(mood: Mood, animate: boolean): void {
    if (mood === this.mood) {
      this.refresh();
      return;
    }
    this.mood = mood;
    const now = performance.now();
    this.action = null;
    this.blink = null;
    this.transition =
      animate && this.visible && !this.reduced ? start(mood === "sleep" ? "fallAsleep" : "wake", now) : null;
    this.zStart = this.transition ? now + 400 : now;
    this.breathStart = now;
    this.scheduleRandom(now, true);
    this.refresh();
  }

  setAuto(auto: boolean): void {
    this.auto = auto;
    this.scheduleRandom(performance.now(), true);
  }

  /** Joue une animation précise (page de démo). */
  play(name: ActionName): void {
    const now = performance.now();
    if (name === "wake" || name === "fallAsleep") {
      this.mood = name === "wake" ? "awake" : "sleep";
      this.transition = start(name, now);
      this.zStart = now + 400;
    } else if (name === "blink" || name === "doubleBlink") {
      this.blink = start(name, now);
    } else {
      this.action = start(name, now);
    }
    this.refresh();
  }

  /** Une touche vient d'être interceptée : l'oreille la plus proche frémit et un « ! » apparaît. */
  react(side: "left" | "right"): void {
    if (!this.visible || this.reduced) return;
    this.reaction = { side: side === "left" ? "earL" : "earR", start: performance.now() };
    this.refresh();
  }

  /** Position du curseur relative aux yeux du chat, en px CSS. */
  setPointer(dx: number, dy: number): void {
    // Seuils : ~12 pixels-sprite à l'horizontale, ~8 vers le bas.
    const H = 12 * this.canvas.cssPx;
    const V = 8 * this.canvas.cssPx;
    const gaze = { px: dx < -H ? -1 : dx > H ? 1 : 0, py: dy > V ? 1 : 0 } as const;
    const wasIdle = performance.now() - this.lastPointer >= POINTER_IDLE_MS;
    this.lastPointer = performance.now();
    if (wasIdle || gaze.px !== this.gaze.px || gaze.py !== this.gaze.py) {
      this.gaze = gaze;
      if (this.visible) this.refresh();
    }
  }

  /** Centre des yeux du chat dans la fenêtre, en px CSS. */
  eyeCenter(): { x: number; y: number } {
    const r = this.host.getBoundingClientRect();
    const p = this.canvas.cssPx;
    return { x: r.left + 8 * p, y: r.top + 6 * p };
  }

  /** Fenêtre visible ou non : coupe complètement la boucle quand elle est cachée. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.restart();
  }

  private restart(): void {
    this.stopLoop();
    const now = performance.now();
    this.transition = null;
    this.action = null;
    this.blink = null;
    this.reaction = null;
    this.zStart = now;
    this.scheduleRandom(now, true);
    if (this.visible && !this.reduced) this.loop();
    this.refresh();
  }

  private loop(): void {
    this.timer = window.setTimeout(() => {
      this.raf = requestAnimationFrame(() => {
        this.render(performance.now());
        if (this.visible && !this.reduced) this.loop();
      });
    }, TICK_MS);
  }

  private stopLoop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.timer = undefined;
    this.raf = undefined;
  }

  private refresh(): void {
    this.render(performance.now());
  }

  private scheduleRandom(now: number, all: boolean): void {
    if (all || now >= this.nextIdle) this.nextIdle = now + rand(4000, 10000);
    if (all || now >= this.nextBlink) this.nextBlink = now + rand(3000, 6000);
    if (all || now >= this.nextTail) this.nextTail = now + rand(6000, 10000);
    if (all || now >= this.nextDetail) this.nextDetail = now + rand(8000, 15000);
  }

  /** Lance au hasard les petits mouvements quand c'est le moment. */
  private autoplay(now: number): void {
    if (!this.auto || this.transition) return;
    if (this.mood === "sleep") {
      if (!this.action && now >= this.nextTail) {
        this.action = start("tailTip", now);
        this.nextTail = now + rand(6000, 10000);
      }
      if (!this.action && now >= this.nextDetail) {
        this.action = start(Math.random() < 0.5 ? "earTwitch" : "mlem", now);
        this.nextDetail = now + rand(8000, 15000);
      }
      return;
    }
    if (!this.blink && now >= this.nextBlink) {
      this.blink = start(Math.random() < 0.25 ? "doubleBlink" : "blink", now);
      this.nextBlink = now + rand(3000, 6000);
    }
    if (!this.action && now >= this.nextIdle) {
      const idle = now - this.lastPointer > 2000;
      const choices: ActionName[] = ["whip", "groom", "tilt", "earTurn", "jump"];
      if (idle) choices.push("sweep");
      this.action = start(pick(choices), now);
      this.nextIdle = now + rand(4000, 10000);
    }
  }

  private render(now: number): void {
    if (!this.palette) return;
    const animated = this.visible && !this.reduced;

    // Fin des animations terminées.
    if (this.transition && now - this.transition.start >= this.transition.total) this.transition = null;
    if (this.action && now - this.action.start >= this.action.total) this.action = null;
    if (this.blink && now - this.blink.start >= this.blink.total) this.blink = null;
    if (this.reaction && now - this.reaction.start >= REACTION_BANG_MS) this.reaction = null;
    if (animated) this.autoplay(now);

    let frame: AnimFrame;
    let dy = 0;
    if (!animated) {
      frame = buildFrame(this.mood === "sleep" ? SLEEP_POSE : BASE_POSE);
    } else {
      const pose: Pose = { ...(this.mood === "sleep" ? SLEEP_POSE : BASE_POSE) };
      if (this.mood === "sleep") {
        pose.breath =
          !this.transition && (now - this.breathStart) % BREATH_PERIOD >= BREATH_PERIOD - BREATH_HOLD;
      } else {
        const pointerFresh = now - this.lastPointer < POINTER_IDLE_MS;
        pose.eyes = pointerFresh ? { kind: "open", ...this.gaze } : { kind: "open", px: 0, py: 0 };
      }
      if (this.hover) {
        pose.earL = "perk";
        pose.earR = "perk";
      }
      for (const r of [this.action, this.blink, this.transition]) {
        if (!r) continue;
        const s = currentStep(r, now);
        if (s?.pose) Object.assign(pose, s.pose);
        if (s?.dy) dy = s.dy;
      }
      if (this.reaction && now - this.reaction.start < REACTION_EAR_MS) pose[this.reaction.side] = "twitch";
      frame = buildFrame(pose);
    }

    this.canvas.draw(frame.rows, this.palette, this.dark, frame.origin);
    const p = this.canvas.cssPx;
    this.canvas.el.style.transform = dy ? `translateY(${dy * p}px)` : "";

    // « ! » au-dessus de l'oreille concernée.
    const bang = animated && this.reaction !== null;
    this.bang.hidden = !bang;
    if (bang && this.reaction) {
      this.bang.style.left = `${(this.reaction.side === "earL" ? 0 : 14) * p}px`;
      this.bang.style.top = `${-4 * p}px`;
    }

    this.renderZ(now, animated);
  }

  private renderZ(now: number, animated: boolean): void {
    const sleeping = this.mood === "sleep" && !(this.transition && now < this.zStart);
    this.zz.hidden = !sleeping;
    this.zStatic.hidden = animated;
    if (!sleeping) return;
    const p = this.canvas.cssPx;
    // Sauts de 2 px (à 760 px de large), arrondis à un nombre entier de px.
    const step = Math.max(1, Math.round((2 * p) / 5));
    const wobble = [0, 1, 0, -1];
    this.zEls.forEach((el, i) => {
      if (!animated) {
        el.hidden = true;
        return;
      }
      const t = now - this.zStart - i * Z_STAGGER;
      if (t < 0) {
        el.hidden = true;
        return;
      }
      const k = Math.floor((t % Z_CYCLE) / Z_STEP);
      const last = Z_CYCLE / Z_STEP - 1;
      el.hidden = k === last;
      el.style.opacity = k >= last - 2 ? (k === last - 2 ? "0.66" : "0.33") : "1";
      const x = k * step + (wobble[k % 4] ?? 0) * step;
      // Monte de 2 px trois paliers sur quatre : la montée reste sous l'indice.
      el.style.transform = `translate(${x}px, ${-Math.floor((k * 3) / 4) * step}px)`;
    });
  }
}
