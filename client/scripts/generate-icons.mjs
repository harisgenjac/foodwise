// Generates the favicon and the app icons in public/ from design/brand/app-icon.svg.
// Run after the icon changes: `npm run icons` (in client/). The outputs are committed.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const source = readFileSync(here("../../design/brand/app-icon.svg"), "utf8");

// The browser favicon: the same SVG without the content-credential metadata and its namespace.
const svg = source
  .replace(/<metadata>[\s\S]*?<\/metadata>/, "")
  .replace(/\s+xmlns:c2pa="[^"]*"/, "")
  .trim();
writeFileSync(here("../public/favicon.svg"), `${svg}\n`);

const OUTPUTS = [
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];
for (const [name, size] of OUTPUTS) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(here(`../public/${name}`), png);
  console.log(`public/${name} (${size}×${size})`);
}
