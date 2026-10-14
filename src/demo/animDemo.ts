/**
 * Page de démo des animations du chat (docs/anim-demo.html).
 * En développement : http://localhost:1420/anim-demo.html
 * Version autonome : `npm run demo:build` (écrit docs/anim-demo.html).
 */
import "../styles/fonts.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "./animDemo.css";

import { type ActionName, CatAnimator, type Mood } from "../cat/catAnimator.ts";
import { SpriteCanvas } from "../cat/render.ts";
import { SKINS, type SkinId, skinById } from "../cat/skins.ts";
import { h } from "../ui/dom.ts";

interface Demo {
  title: string;
  note: string;
  mood: Mood;
  /** Animation rejouée en boucle (aucune : l'état seul suffit). */
  action?: ActionName | "react";
  every?: number;
  /** Le chat suit le curseur de la page. */
  follow?: boolean;
  /** Mouvements aléatoires automatiques, comme dans l'app. */
  auto?: boolean;
}

const DEMOS: { section: string; items: Demo[] }[] = [
  {
    section: "Le chat dort (protection active)",
    items: [
      {
        title: "Respiration et « z »",
        note: "Toutes les 2,5 s, poitrail plus large et tête 1 px plus bas. Trois « z » décalés de 0,8 s.",
        mood: "sleep",
      },
      {
        title: "Queue",
        note: "Le bout se décale d’1 pixel (toutes les 6 à 10 s dans l’app).",
        mood: "sleep",
        action: "tailTip",
        every: 2500,
      },
      {
        title: "Oreille qui frémit",
        note: "1 frame, 150 ms (détail aléatoire toutes les 8 à 15 s).",
        mood: "sleep",
        action: "earTwitch",
        every: 1600,
      },
      { title: "Mlem", note: "2 frames de langue.", mood: "sleep", action: "mlem", every: 2200 },
      {
        title: "Touche interceptée",
        note: "L’oreille la plus proche frémit et un « ! » apparaît 400 ms, sans le réveiller.",
        mood: "sleep",
        action: "react",
        every: 1400,
      },
    ],
  },
  {
    section: "Le chat est réveillé (pause)",
    items: [
      {
        title: "Yeux qui suivent le curseur",
        note: "3 positions horizontales x 2 verticales. Bouge la souris sur la page.",
        mood: "awake",
        follow: true,
      },
      {
        title: "Clignement",
        note: "Toutes les 3 à 6 s, parfois double.",
        mood: "awake",
        action: "doubleBlink",
        every: 1800,
      },
      {
        title: "Queue qui fouette",
        note: "Crochet à droite, droite, crochet plus haut, en boucle courte.",
        mood: "awake",
        action: "whip",
        every: 2600,
      },
      {
        title: "Toilette",
        note: "La patte monte jusqu’à la bouche, coup de langue.",
        mood: "awake",
        action: "groom",
        every: 3000,
      },
      {
        title: "Tête penchée",
        note: "Lignes 0 à 10 décalées d’1 px pendant 1 s.",
        mood: "awake",
        action: "tilt",
        every: 2200,
      },
      { title: "Oreille qui tourne", note: "600 ms.", mood: "awake", action: "earTurn", every: 1800 },
      {
        title: "Sautillement",
        note: "Monte de 2 px puis redescend, en 3 frames.",
        mood: "awake",
        action: "jump",
        every: 1500,
      },
      {
        title: "Regard qui balaie",
        note: "Quand le curseur ne bouge pas.",
        mood: "awake",
        action: "sweep",
        every: 2200,
      },
      { title: "Survol", note: "Passe la souris sur le chat : les oreilles se dressent.", mood: "awake" },
    ],
  },
  {
    section: "Transitions",
    items: [
      {
        title: "Réveil",
        note: "~500 ms : un œil, les deux, bâillement.",
        mood: "sleep",
        action: "wake",
        every: 2400,
      },
      {
        title: "Endormissement",
        note: "~600 ms : yeux plissés, fermés, puis les « z ».",
        mood: "awake",
        action: "fallAsleep",
        every: 3200,
      },
      {
        title: "Comme dans l’app",
        note: "Mouvements aléatoires. Clique sur le chat pour le réveiller ou l’endormir.",
        mood: "sleep",
        auto: true,
      },
    ],
  },
];

interface Live {
  canvas: SpriteCanvas;
  animator: CatAnimator;
  stage: HTMLElement;
  demo: Demo;
}

const lives: Live[] = [];
let skin: SkinId = "noir";
let dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

function makeStage(demo: Demo): HTMLElement {
  const canvas = new SpriteCanvas(5);
  const cat = h("button", { class: "cat", attrs: { type: "button", "aria-label": demo.title } }, canvas.el);
  const zz = h("div", { class: "zz", attrs: { "aria-hidden": "true" } });
  const floor = h("div", { class: "strip demo-floor" }, cat, zz);
  const stage = h("div", { class: "demo-stage" }, floor);
  const animator = new CatAnimator({ canvas, host: cat, zz, auto: demo.auto ?? false });
  animator.setMood(demo.mood, false);
  const live = { canvas, animator, stage, demo };
  lives.push(live);

  let mood = demo.mood;
  if (demo.auto) {
    cat.addEventListener("click", () => {
      mood = mood === "sleep" ? "awake" : "sleep";
      animator.setMood(mood, true);
    });
  }
  const replay = () => {
    const a = demo.action;
    if (!a) return;
    if (a === "react") {
      animator.react(Math.random() < 0.5 ? "left" : "right");
    } else if (a === "wake" || a === "fallAsleep") {
      animator.setMood(demo.mood, false);
      animator.play(a);
    } else {
      animator.play(a);
    }
  };
  if (demo.action) {
    replay();
    window.setInterval(replay, demo.every ?? 2000);
  }

  const card = h(
    "article",
    { class: "demo-card" },
    stage,
    h("h3", { text: demo.title }),
    h("p", { text: demo.note }),
  );
  if (demo.action) {
    const b = h("button", { class: "change", attrs: { type: "button" }, text: "Rejouer" });
    b.addEventListener("click", replay);
    card.append(b);
  }
  return card;
}

function applyLook(): void {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const palette = skinById(skin).palette;
  for (const l of lives) {
    l.canvas.updateScale();
    l.stage.style.setProperty("--px", `${l.canvas.cssPx}px`);
    l.animator.setLook(palette, dark);
  }
}

function build(): void {
  const skinSelect = h("select", { attrs: { "aria-label": "Pelage" } });
  for (const s of SKINS) skinSelect.append(h("option", { text: s.name, attrs: { value: s.id } }));
  skinSelect.addEventListener("change", () => {
    skin = skinSelect.value as SkinId;
    applyLook();
  });
  const themeBtn = h("button", { class: "change", attrs: { type: "button" }, text: "Clair / sombre" });
  themeBtn.addEventListener("click", () => {
    dark = !dark;
    applyLook();
  });

  const page = h(
    "div",
    { class: "demo" },
    h(
      "header",
      { class: "demo-head" },
      h("h1", { class: "title", text: "Pattelock, animations du chat" }),
      h("p", {
        class: "sub",
        text: "Tout bouge par frames ou par sauts d’un pixel entier. Avec « réduire les animations » activé dans l’OS, le chat reste fixe.",
      }),
      h("div", { class: "demo-tools" }, skinSelect, themeBtn),
    ),
  );
  for (const sec of DEMOS) {
    page.append(h("h2", { class: "lbl", text: sec.section.toUpperCase() }));
    page.append(h("div", { class: "demo-grid" }, ...sec.items.map(makeStage)));
  }
  document.getElementById("app")?.replaceWith(page);

  document.addEventListener("mousemove", (e) => {
    for (const l of lives) {
      if (!l.demo.follow && !l.demo.auto) continue;
      const c = l.animator.eyeCenter();
      l.animator.setPointer(e.clientX - c.x, e.clientY - c.y);
    }
  });
  window.addEventListener("resize", applyLook);
  applyLook();
  for (const l of lives) l.animator.setVisible(true);
}

build();
