// Generates one standalone 288x288 SVG per Stream Deck icon, rasterized to PNG
// by macOS `qlmanage` (see build.sh). Full-bleed gradient in the entity's hue,
// white glyph + label. Colours mirror the app's per-entity hues.
import { writeFileSync } from "node:fs";

const ICONS = [
  {
    name: "today",
    label: "TODAY",
    hue: 158,
    glyph: `<path d="M7 2a1 1 0 011 1v1h8V3a1 1 0 112 0v1h1a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1zM5 9v10h14V9H5z"/><path d="M10.7 16.6l-2.5-2.5 1.15-1.15 1.35 1.35 3.25-3.25 1.15 1.15-4.4 4.4z"/>`,
  },
  {
    name: "note",
    label: "NOTE",
    hue: 217,
    glyph: `<path d="M6 2h7.2L20 8v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.6V8h4.4L13 3.6zM7.5 12h9v1.7h-9zm0 3.6h9v1.7h-9zM7.5 8.4H12v1.7H7.5z"/>`,
  },
  {
    name: "blueprint",
    label: "BLUEPRINT",
    hue: 200,
    stroke: true,
    glyph: `<rect x="3" y="4" width="7.5" height="6" rx="1.3"/><rect x="13.5" y="14" width="7.5" height="6" rx="1.3"/><path d="M10.5 7h4.5a2.5 2.5 0 012.5 2.5V14"/>`,
  },
  {
    name: "summary",
    label: "SUMMARY",
    hue: 222,
    sat: 16,
    light: 42,
    glyph: `<rect x="3" y="5" width="3.6" height="3" rx="1.2"/><rect x="9" y="5.2" width="12" height="2.6" rx="1.3"/><rect x="3" y="10.5" width="3.6" height="3" rx="1.2"/><rect x="9" y="10.7" width="12" height="2.6" rx="1.3"/><rect x="3" y="16" width="3.6" height="3" rx="1.2"/><rect x="9" y="16.2" width="9" height="2.6" rx="1.3"/>`,
  },
  {
    name: "article",
    label: "ARTICLE",
    hue: 268,
    // A star — matches the in-app ★ "quick article" toggle that ⌘⇧A opens.
    glyph: `<path d="M12 2.1l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.16l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96z"/>`,
  },
];

const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

for (const ic of ICONS) {
  const s = ic.sat ?? 70;
  const l = ic.light ?? 50;
  const top = hsl(ic.hue, s, l + 8);
  const bot = hsl(ic.hue, s, l - 10);
  const glyphAttrs = ic.stroke
    ? `fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="#fff"`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 288 288">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bot}"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="288" height="288" fill="url(#g)"/>
  <g filter="url(#sh)">
    <svg x="78" y="46" width="132" height="132" viewBox="0 0 24 24" ${glyphAttrs}>${ic.glyph}</svg>
    <text x="144" y="236" text-anchor="middle" fill="#fff"
      font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="800"
      letter-spacing="1.5">${ic.label}</text>
  </g>
</svg>`;
  writeFileSync(new URL(`./${ic.name}.svg`, import.meta.url), svg);
  console.log("wrote", ic.name + ".svg");
}
