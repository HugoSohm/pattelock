// Construit docs/anim-demo.html : la page de démo des animations en un seul
// fichier autonome (JS, CSS et polices embarqués), à ouvrir directement dans un navigateur.
//
//   npm run demo:build
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const out = await build({
  configFile: false,
  root: ROOT,
  logLevel: "warn",
  build: {
    write: false,
    target: "es2022",
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    lib: {
      entry: join(ROOT, "src/demo/animDemo.ts"),
      formats: ["iife"],
      name: "PattelockAnimDemo",
      fileName: () => "demo.js",
      cssFileName: "demo",
    },
  },
});

const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
const js = outputs.find((o) => o.type === "chunk")?.code ?? "";
const css = outputs
  .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
  .map((o) => String(o.source))
  .join("\n");
if (!js || !css) throw new Error("build incomplet");

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pattelock, animations du chat</title>
<!-- Fichier généré par scripts/build-anim-demo.mjs à partir de src/demo/animDemo.ts. Ne pas modifier à la main. -->
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js.replace(/<\/script/g, "<\/script")}</script>
</body>
</html>
`;
const target = join(ROOT, "docs/anim-demo.html");
writeFileSync(target, html);
console.log(`écrit ${target} (${Math.round(html.length / 1024)} Ko)`);
