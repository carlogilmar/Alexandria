// Shared markdown-it configuration for every markdown surface (notes,
// articles). Centralizing it means the link behavior and the inline
// ```mermaid fence support live in one place instead of being copy-pasted
// into each editor.

import MarkdownIt from "markdown-it";
import { renderMermaid } from "$lib/mermaid";
import hljs from "highlight.js/lib/core";
import elixir from "highlight.js/lib/languages/elixir";
import erlang from "highlight.js/lib/languages/erlang";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import yaml from "highlight.js/lib/languages/yaml";

// Core-only hljs build + hand-picked languages (Elixir first-class) to keep
// the bundle lean. Aliases (js/ts/sh/html) come with each language def.
hljs.registerLanguage("elixir", elixir);
hljs.registerLanguage("erlang", erlang);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("yaml", yaml);

// One configured instance shape, used by every markdown surface.
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
    // Fenced code with a known language tag → hljs token spans (styled in
    // app.css for light/dark). Unknown/absent language falls back to
    // markdown-it's default escaping.
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang, ignoreIllegals: true })
            .value;
        } catch {
          // fall through to default escaping
        }
      }
      return "";
    },
  });

  // Open links in a new tab with a safe rel.
  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    if (t.attrIndex("target") < 0) t.attrPush(["target", "_blank"]);
    if (t.attrIndex("rel") < 0) t.attrPush(["rel", "noopener noreferrer"]);
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  // ```mermaid fences → a placeholder that's hydrated to SVG after the HTML
  // lands in the DOM. mermaid.render is async and md.render is sync, so we
  // can't produce the SVG during the markdown pass. The source rides along
  // as escaped text in data-source (durable across re-renders) and as visible
  // text (a readable fallback until the SVG swaps in / if mermaid fails).
  const defaultFence =
    md.renderer.rules.fence ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const info = tokens[idx].info.trim().toLowerCase();
    if (info === "mermaid") {
      const escaped = md.utils.escapeHtml(tokens[idx].content);
      return `<div class="mermaid-block" data-source="${escaped}" data-rendered="0">${escaped}</div>`;
    }
    // ```cards → a responsive grid of link tiles (title/desc/link/color/icon).
    // Rendered directly to HTML (no async), links reuse the editors' existing
    // anchor click handling (internal entity nav + external open).
    if (info === "cards") {
      return renderCards(tokens[idx].content, md);
    }
    // ```chart → an inline SVG bar / donut / line chart (synchronous, no dep).
    if (info === "chart") {
      return renderChart(tokens[idx].content, md);
    }
    // ```marquee [color] [speed] → a scrolling colored banner (CSS-only).
    // Modifiers ride in the fence info string so the text can contain colons.
    if (info === "marquee" || info.startsWith("marquee ")) {
      return renderMarquee(tokens[idx].content, info.split(/\s+/).slice(1), md);
    }
    // ```progress → labeled progress bars. One `Label: value` per line, value
    // as 4/10, 60%, or a bare 0–100 number (optional trailing color word).
    if (info === "progress" || info.startsWith("progress ")) {
      return renderProgress(tokens[idx].content, md, env);
    }
    // Every other fenced block gets a GitHub-style copy button. The button is
    // static HTML (no per-instance handler survives `{@html}` re-renders); a
    // single delegated document listener — installCodeCopy — handles the click
    // and reads the code from the sibling <code>'s textContent.
    const rendered = defaultFence(tokens, idx, opts, env, self);
    return `<div class="md-code">${CODE_COPY_BTN}${rendered}</div>`;
  };

  // `Some text` followed by a line of dashes shouldn't silently become a big
  // heading (a confusing "stray line"). Keep `---` as a thematic-break divider
  // only — disable setext (underline) headings.
  md.disable("lheading");

  // ==highlight== → <mark>.
  addInlineWrap(md, "mark", 0x3d /* = */, /^==(.+?)==/, (m) =>
    `<mark class="md-hl">${md.utils.escapeHtml(m[1])}</mark>`,
  );

  // ++underline++ → <u> (markdown has no native underline syntax).
  addInlineWrap(md, "underline", 0x2b /* + */, /^\+\+(.+?)\+\+/, (m) =>
    `<u>${md.utils.escapeHtml(m[1])}</u>`,
  );

  // {color|text} → colored inline span. Named palette only (see app.css).
  addInlineWrap(
    md,
    "colortext",
    0x7b /* { */,
    /^\{(red|orange|amber|green|teal|blue|violet|pink|gray)\|([^}]+)\}/,
    (m) => `<span class="md-c md-c-${m[1]}">${md.utils.escapeHtml(m[2])}</span>`,
  );

  // GitHub-style callouts: a blockquote whose first line is [!TYPE].
  addCallouts(md);

  // GitHub-style task lists: `- [ ] todo` / `- [x] done` → checkbox items.
  addTaskLists(md);

  // One delegated listener powers the copy buttons across every surface.
  installCodeCopy();

  return md;
}

// The copy button injected into each non-mermaid fenced block. Two icons —
// clipboard + check — CSS-toggled by the `.md-copied` class after a copy.
const CODE_COPY_BTN =
  '<button class="md-copy-btn" type="button" title="Copy code" aria-label="Copy code">' +
  '<svg class="md-copy-i" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path d="M7 3a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V7.414A2 2 0 0014.414 6L12 3.586A2 2 0 0010.586 3H7z"/>' +
  '<path d="M3 7a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>' +
  '<svg class="md-copy-check" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z" clip-rule="evenodd"/></svg>' +
  "</button>";

// ```cards renderer. Cards are separated by a `---` line; each card is
// `key: value` lines (title / desc / link / color / icon). Emits a grid of
// tiles — an <a> when a link is present (so the editors' existing anchor
// click handling navigates entities / opens URLs), else a plain <div>.
const CARD_SOLID = new Set([
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "gray",
  "black",
]);
const CARD_GRADIENT = new Set(["sunset", "ocean", "forest", "dusk", "candy"]);
const CARD_ENTITY = /^(note|list|workflow|article|flashcard|blueprint):(\d+)$/;

function renderCards(source: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const blocks = source.split(/^\s*-{3,}\s*$/m);
  const cards: string[] = [];
  for (const block of blocks) {
    const f: Record<string, string> = {};
    for (const line of block.split("\n")) {
      const m = /^\s*([a-zA-Z]+)\s*:\s*(.*)$/.exec(line);
      if (m) f[m[1].toLowerCase()] = m[2].trim();
    }
    const title = f.title ?? "";
    const desc = f.desc ?? "";
    const link = f.link ?? "";
    if (!title && !desc && !link) continue;

    const color = (f.color ?? "").toLowerCase();
    // `filled: true` → a bold, darker saturated fill with white text (vs the
    // default pale tint). Ignored for gradients (already bold).
    const filled = /^(true|yes|1|on)$/i.test(f.filled ?? "");
    let cls: string;
    if (CARD_GRADIENT.has(color)) {
      cls = `md-card-grad md-card-${color}`;
    } else {
      const c = CARD_SOLID.has(color) ? color : "gray";
      cls = `md-card-solid md-card-${c}${filled ? " md-card-filled" : ""}`;
    }

    const icon = f.icon
      ? `<span class="md-card-icon">${esc(f.icon)}</span>`
      : "";
    const titleH = title
      ? `<span class="md-card-title">${esc(title)}</span>`
      : "";
    const descH = desc ? `<span class="md-card-desc">${esc(desc)}</span>` : "";

    let badge = "";
    const ent = CARD_ENTITY.exec(link);
    if (ent) {
      badge = `<span class="md-card-badge">${ent[1]}</span>`;
    } else if (/^https?:\/\//i.test(link)) {
      let host = "";
      try {
        host = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        /* ignore */
      }
      badge = `<span class="md-card-badge">${esc(host || "link")} ↗</span>`;
    }

    const inner = `${icon}${titleH}${descH}${badge}`;
    cards.push(
      link
        ? `<a class="md-card ${cls}" href="${esc(link)}">${inner}</a>`
        : `<div class="md-card ${cls}">${inner}</div>`,
    );
  }
  if (cards.length === 0) return "";
  return `<div class="md-cards">${cards.join("")}</div>`;
}

// ```chart renderer. Same `key: value` line shape as ```cards: `type` / `title`
// / `color` configure the chart, every other `Label: number` line is a data
// point (order preserved). Emits inline SVG synchronously — no dependency, no
// async hydration, crisp at any zoom, and works inside blueprint cards.
type ChartDatum = { label: string; value: number };

// Mid-tone categorical palette — legible on both light and dark surfaces.
const CHART_PALETTE = [
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#64748b",
];
const CHART_NAMED: Record<string, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  red: "#ef4444",
  teal: "#14b8a6",
  pink: "#ec4899",
  orange: "#f97316",
  gray: "#64748b",
};

// Round a positive number up to a "nice" 1/2/5×10ⁿ ceiling for the axis top.
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

// Compact number formatting: integers as-is, else up to 2 decimals.
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function renderChart(source: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  let type = "bar";
  let title = "";
  let color = "";
  const data: ChartDatum[] = [];
  for (const line of source.split("\n")) {
    const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].trim();
    const raw = m[2].trim();
    const low = key.toLowerCase();
    if (low === "type") {
      type = raw.toLowerCase();
    } else if (low === "title") {
      title = raw;
    } else if (low === "color") {
      color = raw.toLowerCase();
    } else {
      const value = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(value) && value >= 0) data.push({ label: key, value });
    }
  }
  if (data.length === 0) return "";

  const accent = CHART_NAMED[color] ?? CHART_PALETTE[0];
  const titleH = title
    ? `<div class="md-chart-title">${esc(title)}</div>`
    : "";

  let body: string;
  if (type === "donut" || type === "pie") {
    body = renderDonutChart(data, esc);
  } else if (type === "line") {
    body = renderLineChart(data, accent, esc);
  } else {
    body = renderBarChart(data, accent, esc);
  }
  return `<div class="md-chart md-chart-${esc(type)}">${titleH}${body}</div>`;
}

function renderBarChart(
  data: ChartDatum[],
  accent: string,
  esc: (s: string) => string,
): string {
  const W = 640;
  const H = 300;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = niceCeil(Math.max(...data.map((d) => d.value)));
  const n = data.length;
  const band = plotW / n;
  const barW = Math.min(band * 0.62, 64);

  const parts: string[] = [];
  // Horizontal gridlines + y-axis labels (0 → max in quarters).
  for (let g = 0; g <= 4; g++) {
    const val = (max * g) / 4;
    const y = padT + plotH * (1 - g / 4);
    parts.push(
      `<line class="md-chart-grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>`,
      `<text class="md-chart-axis" x="${padL - 6}" y="${y + 3}" text-anchor="end">${fmtNum(val)}</text>`,
    );
  }
  // Bars + labels.
  data.forEach((d, i) => {
    const bx = padL + i * band + (band - barW) / 2;
    const bh = plotH * (d.value / max);
    const by = padT + plotH - bh;
    const cx = padL + i * band + band / 2;
    parts.push(
      `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${accent}"/>`,
      `<text class="md-chart-val" x="${cx.toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle">${fmtNum(d.value)}</text>`,
      `<text class="md-chart-axis" x="${cx.toFixed(1)}" y="${H - padB + 18}" text-anchor="middle">${esc(d.label)}</text>`,
    );
  });
  return `<svg class="md-chart-svg" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

function renderLineChart(
  data: ChartDatum[],
  accent: string,
  esc: (s: string) => string,
): string {
  const W = 640;
  const H = 300;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = niceCeil(Math.max(...data.map((d) => d.value)));
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH * (1 - v / max);

  const parts: string[] = [];
  for (let g = 0; g <= 4; g++) {
    const val = (max * g) / 4;
    const gy = padT + plotH * (1 - g / 4);
    parts.push(
      `<line class="md-chart-grid" x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}"/>`,
      `<text class="md-chart-axis" x="${padL - 6}" y="${gy + 3}" text-anchor="end">${fmtNum(val)}</text>`,
    );
  }
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
  if (data.length > 1) {
    parts.push(
      `<polyline fill="none" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(" ")}"/>`,
    );
  }
  data.forEach((d, i) => {
    parts.push(
      `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3.5" fill="${accent}"/>`,
      `<text class="md-chart-axis" x="${x(i).toFixed(1)}" y="${H - padB + 18}" text-anchor="middle">${esc(d.label)}</text>`,
    );
  });
  return `<svg class="md-chart-svg" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

function renderDonutChart(
  data: ChartDatum[],
  esc: (s: string) => string,
): string {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return "";
  const cx = 100;
  const cy = 100;
  const R = 92;
  const r = 56;
  const mid = (R + r) / 2;

  const arcs: string[] = [];
  if (slices.length === 1) {
    // A full ring can't be drawn with a single arc — stroke a circle instead.
    arcs.push(
      `<circle cx="${cx}" cy="${cy}" r="${mid}" fill="none" stroke="${CHART_PALETTE[0]}" stroke-width="${R - r}"/>`,
    );
  } else {
    let angle = -Math.PI / 2; // start at top
    slices.forEach((d, i) => {
      const frac = d.value / total;
      const end = angle + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const p = (rad: number, a: number) =>
        `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
      const path = [
        `M ${p(R, angle)}`,
        `A ${R} ${R} 0 ${large} 1 ${p(R, end)}`,
        `L ${p(r, end)}`,
        `A ${r} ${r} 0 ${large} 0 ${p(r, angle)}`,
        "Z",
      ].join(" ");
      arcs.push(
        `<path d="${path}" fill="${CHART_PALETTE[i % CHART_PALETTE.length]}"/>`,
      );
      angle = end;
    });
  }
  const svg =
    `<svg class="md-chart-donut-svg" viewBox="0 0 200 200" role="img" preserveAspectRatio="xMidYMid meet">` +
    arcs.join("") +
    `<text class="md-chart-total" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${fmtNum(total)}</text>` +
    `</svg>`;

  const legend = slices
    .map((d, i) => {
      const pct = Math.round((d.value / total) * 100);
      const c = CHART_PALETTE[i % CHART_PALETTE.length];
      return (
        `<li><span class="md-chart-swatch" style="background:${c}"></span>` +
        `<span class="md-chart-legend-label">${esc(d.label)}</span>` +
        `<span class="md-chart-legend-val">${fmtNum(d.value)}</span>` +
        `<span class="md-chart-legend-pct">${pct}%</span></li>`
      );
    })
    .join("");

  return `<div class="md-chart-body">${svg}<ul class="md-chart-legend">${legend}</ul></div>`;
}

// ```marquee renderer. A scrolling colored banner (right→left), for calling out
// important notes or as a bold divider. CSS-only — the track holds the text
// twice so translateX(-50%) loops seamlessly; hover pauses; reduced-motion
// shows it static + centered (see app.css). Options (color + speed) come from
// the fence info string so the banner text may contain any characters.
const MARQUEE_COLORS: Record<string, string> = {
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  green: "#16a34a",
  teal: "#0d9488",
  blue: "#2563eb",
  violet: "#7c3aed",
  pink: "#db2777",
  gray: "#4b5563",
  black: "#111318",
};
// Gradient presets — shared with the ```cards gradient look.
const MARQUEE_GRADIENTS: Record<string, string> = {
  sunset: "linear-gradient(135deg, #f97316, #ec4899)",
  ocean: "linear-gradient(135deg, #0ea5e9, #14b8a6)",
  forest: "linear-gradient(135deg, #22c55e, #14b8a6)",
  dusk: "linear-gradient(135deg, #8b5cf6, #6366f1)",
  candy: "linear-gradient(135deg, #ec4899, #a855f7)",
};
const MARQUEE_SPEEDS = new Set(["slow", "normal", "fast"]);

function renderMarquee(
  source: string,
  mods: string[],
  md: MarkdownIt,
): string {
  const text = source.trim().replace(/\s+/g, " ");
  if (!text) return "";
  let bg = MARQUEE_COLORS.blue;
  let speed = "normal";
  for (const m of mods) {
    if (MARQUEE_COLORS[m]) bg = MARQUEE_COLORS[m];
    else if (MARQUEE_GRADIENTS[m]) bg = MARQUEE_GRADIENTS[m];
    else if (MARQUEE_SPEEDS.has(m)) speed = m;
  }
  const safe = md.utils.escapeHtml(text);
  const item = `<span class="md-marquee-item">${safe}</span>`;
  const itemDup = `<span class="md-marquee-item" aria-hidden="true">${safe}</span>`;
  return (
    `<div class="md-marquee md-marquee-${speed}" style="background:${bg}">` +
    `<div class="md-marquee-track">${item}${itemDup}</div>` +
    `</div>`
  );
}

// ```progress renderer. One labeled bar per `Label: value` line. Value forms:
// `4/10` (fraction → its %), `60%`, or a bare `0–100`. An optional trailing
// named color word (see MARQUEE_COLORS) sets the fill. CSS-only, no hydration.
//
// When rendered with `env.progressInteractive` (the note/article editors), an
// integer-fraction bar `n/d` also gets −/+ stepper buttons that rewrite the
// source (see stepProgressInSource) — a live counter. Its `data-progress`
// index is assigned per-render via a counter on `env`, matching the source
// scan order (cf. task checkboxes).
function renderProgress(
  source: string,
  md: MarkdownIt,
  env?: Record<string, unknown>,
): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const interactive = env?.progressInteractive === true;
  const rows: string[] = [];
  for (const line of source.split("\n")) {
    const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const label = m[1].trim();
    const rest = m[2].trim();
    if (!rest) continue;

    // Split off an optional trailing color word; the rest is the value token.
    let fill = MARQUEE_COLORS.blue;
    let valTok = "";
    for (const t of rest.split(/\s+/)) {
      if (MARQUEE_COLORS[t.toLowerCase()]) fill = MARQUEE_COLORS[t.toLowerCase()];
      else if (!valTok) valTok = t;
    }

    let pct: number | null = null;
    let display = valTok;
    // A bar is "steppable" only when it's an integer fraction n/d.
    const steppable = /^\d+\/\d+$/.test(valTok);
    let frac: RegExpExecArray | null;
    if ((frac = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(valTok))) {
      const den = Number(frac[2]);
      pct = den > 0 ? (Number(frac[1]) / den) * 100 : 0;
    } else if (/^(\d+(?:\.\d+)?)%$/.test(valTok)) {
      pct = Number(valTok.slice(0, -1));
    } else if (/^\d+(?:\.\d+)?$/.test(valTok)) {
      pct = Number(valTok);
      display = `${valTok}%`;
    }
    if (pct === null || !Number.isFinite(pct)) continue;
    pct = Math.max(0, Math.min(100, pct));

    // A completed bar always turns green (overrides the chosen color).
    const done = pct >= 100;
    const barColor = done ? MARQUEE_COLORS.green : fill;

    // Steppers (interactive fraction bars only). The per-render index lives on
    // env so it's document-ordered across every ```progress fence.
    let valBlock = `<span class="md-progress-val">${esc(display)}</span>`;
    if (interactive && steppable) {
      const i = (env!.progressSteps as number) ?? 0;
      env!.progressSteps = i + 1;
      valBlock =
        `<span class="md-progress-ctrls">` +
        `<button type="button" class="md-progress-step" data-progress="${i}" data-dir="dec" aria-label="Decrease ${esc(label)}">−</button>` +
        `<span class="md-progress-val">${esc(display)}</span>` +
        `<button type="button" class="md-progress-step" data-progress="${i}" data-dir="inc" aria-label="Increase ${esc(label)}">+</button>` +
        `</span>`;
    }

    rows.push(
      `<div class="md-progress-row${done ? " md-progress-done" : ""}">` +
        `<div class="md-progress-head">` +
        `<span class="md-progress-label">${esc(label)}</span>` +
        valBlock +
        `</div>` +
        `<div class="md-progress-track">` +
        `<div class="md-progress-fill" style="width:${pct.toFixed(1)}%;background-color:${barColor}">` +
        (done ? `<span class="md-progress-flabel">Complete</span>` : "") +
        `</div>` +
        `</div>` +
        `</div>`,
    );
  }
  if (rows.length === 0) return "";
  return `<div class="md-progress">${rows.join("")}</div>`;
}

// Scan for ```progress fences and adjust the numerator of the Nth integer
// fraction line (`Label: n/d [color]`) by `delta`, clamped to 0..d. Returns the
// new source, or null if that index wasn't found. Mirrors toggleTaskInSource.
export function stepProgressInSource(
  src: string,
  index: number,
  delta: number,
): string | null {
  const lines = src.split("\n");
  let inFence = false;
  let inProgress = false;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (fence) {
      if (!inFence) {
        inFence = true;
        const info = fence[2].trim().toLowerCase();
        inProgress = info === "progress" || info.startsWith("progress ");
      } else {
        inFence = false;
        inProgress = false;
      }
      continue;
    }
    if (!inProgress) continue;
    const m = /^(\s*[^:]+?\s*:\s*)(\d+)(\s*\/\s*)(\d+)(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (n === index) {
      const den = Number(m[4]);
      const num = Math.max(0, Math.min(den, Number(m[2]) + delta));
      lines[i] = `${m[1]}${num}${m[3]}${m[4]}${m[5]}`;
      return lines.join("\n");
    }
    n++;
  }
  return null;
}

// Count steppable (integer-fraction) ```progress lines in a source chunk — used
// by ArticleEditor to offset per-segment stepper indices (cf. task checkboxes).
export function countProgressStepsInSource(src: string): number {
  const lines = src.split("\n");
  let inFence = false;
  let inProgress = false;
  let n = 0;
  for (const line of lines) {
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        const info = fence[2].trim().toLowerCase();
        inProgress = info === "progress" || info.startsWith("progress ");
      } else {
        inFence = false;
        inProgress = false;
      }
      continue;
    }
    if (!inProgress) continue;
    if (/^\s*[^:]+?\s*:\s*\d+\s*\/\s*\d+.*$/.test(line)) n++;
  }
  return n;
}

// Install a single, document-wide delegated click handler for copy buttons.
// Delegation (vs. a per-button handler) survives the `{@html}` re-renders
// every markdown surface does. Capture phase + stopPropagation so the click
// doesn't also trip a surface's click-to-edit.
let codeCopyInstalled = false;
function installCodeCopy(): void {
  if (codeCopyInstalled || typeof document === "undefined") return;
  codeCopyInstalled = true;
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const btn = target?.closest?.(".md-copy-btn") as HTMLButtonElement | null;
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const code = btn.closest(".md-code")?.querySelector("code");
      const text = code?.textContent ?? "";
      if (!text) return;
      void navigator.clipboard.writeText(text).then(
        () => {
          btn.classList.add("md-copied");
          window.setTimeout(() => btn.classList.remove("md-copied"), 1400);
        },
        () => {
          /* clipboard denied — no-op */
        },
      );
    },
    true,
  );
}

// Convert list items starting with `[ ] ` / `[x] ` into checkbox items. Each
// checkbox carries data-task="N" (its document-order index) so a click in the
// preview can flip the matching marker in the markdown source — see
// toggleTaskInSource. Checked items get a `task-done` class (struck via CSS).
function addTaskLists(md: MarkdownIt): void {
  md.core.ruler.after("inline", "task_lists", (state) => {
    const tokens = state.tokens;
    let taskIndex = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "inline") continue;
      const inline = tokens[i];
      // A task item's inline content sits inside li > p (p may be hidden for
      // tight lists). Walk back: inline ← paragraph_open ← list_item_open.
      if (i < 2) continue;
      if (tokens[i - 1].type !== "paragraph_open") continue;
      if (tokens[i - 2].type !== "list_item_open") continue;
      const kids = inline.children;
      if (!kids || kids.length === 0 || kids[0].type !== "text") continue;
      const m = /^\[( |x|X)\] /.exec(kids[0].content);
      if (!m) continue;
      const checked = m[1] !== " ";
      kids[0].content = kids[0].content.slice(m[0].length);
      const checkbox = new state.Token("html_inline", "", 0);
      checkbox.content = `<input type="checkbox" class="md-task" data-task="${taskIndex}"${
        checked ? " checked" : ""
      }>`;
      kids.unshift(checkbox);
      tokens[i - 2].attrJoin(
        "class",
        checked ? "task-list-item task-done" : "task-list-item",
      );
      taskIndex++;
    }
  });
}

// Count task markers in raw markdown (same scan rules as toggleTaskInSource).
// Used by ArticleEditor to offset per-segment checkbox indices into a
// whole-document index.
export function countTasksInSource(src: string): number {
  let inFence = false;
  let n = 0;
  for (const line of src.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?=\s)/.test(line)) n++;
  }
  return n;
}

// Flip the Nth task marker (document order, same order addTaskLists assigns
// data-task) in raw markdown source. Skips fenced code blocks so a literal
// "- [ ]" inside ``` doesn't shift the count. Returns null if not found.
export function toggleTaskInSource(src: string, index: number): string | null {
  const lines = src.split("\n");
  let inFence = false;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // `>` prefixes allowed: tasks inside blockquotes/callouts render as
    // tasks too, and both counters must stay in the same document order.
    const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?=\s)/.exec(
      lines[i],
    );
    if (!m) continue;
    if (n === index) {
      const next = m[2] === " " ? "x" : " ";
      lines[i] =
        m[1] + `[${next}]` + lines[i].slice(m[1].length + 3);
      return lines.join("\n");
    }
    n++;
  }
  return null;
}

// Register an inline rule that matches `re` (anchored at the cursor) when the
// current char is `triggerCh`, and renders it via `render(match)`. The output
// is trusted HTML (html:false only escapes *source* HTML, not our renderer
// output) — render() must escape any user text itself.
function addInlineWrap(
  md: MarkdownIt,
  name: string,
  triggerCh: number,
  re: RegExp,
  render: (m: RegExpExecArray) => string,
): void {
  md.inline.ruler.before("emphasis", name, (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== triggerCh) return false;
    const m = re.exec(state.src.slice(state.pos));
    if (!m) return false;
    if (!silent) {
      const token = state.push(name, "", 0);
      token.meta = { m };
    }
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules[name] = (tokens, idx) =>
    render((tokens[idx].meta as { m: RegExpExecArray }).m);
}

const CALLOUT_KINDS = new Set([
  "note",
  "tip",
  "warning",
  "comment",
  "important",
  "caution",
]);
const CALLOUT_LABEL: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
  comment: "Comment",
  important: "Important",
  caution: "Caution",
};

// Turn `> [!TYPE]\n> body` blockquotes into styled callout panels: tag the
// blockquote with a class, strip the `[!TYPE]` marker, and emit a label.
function addCallouts(md: MarkdownIt): void {
  md.core.ruler.after("block", "callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      let inline: (typeof tokens)[number] | null = null;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "blockquote_close") break;
        if (tokens[j].type === "inline") {
          inline = tokens[j];
          break;
        }
      }
      if (!inline) continue;
      const m = /^\s*\[!(\w+)\]\s*/.exec(inline.content);
      if (!m) continue;
      const kind = m[1].toLowerCase();
      const cls = CALLOUT_KINDS.has(kind) ? kind : "note";
      tokens[i].attrJoin("class", `callout callout-${cls}`);
      tokens[i].meta = { ...(tokens[i].meta ?? {}), callout: cls };
      // Strip the marker from the content + the inline children.
      inline.content = inline.content.slice(m[0].length);
      const kids = inline.children ?? [];
      if (kids.length && kids[0].type === "text") {
        kids[0].content = kids[0].content.replace(/^\s*\[!\w+\]\s*/, "");
        // Drop a now-empty leading text + its trailing softbreak (marker was
        // on its own line).
        if (kids[0].content === "" && kids[1] && kids[1].type === "softbreak") {
          kids.splice(0, 2);
        }
      }
    }
  });

  const defBq =
    md.renderer.rules.blockquote_open ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.blockquote_open = (tokens, idx, opts, env, self) => {
    const open = defBq(tokens, idx, opts, env, self);
    const cls = (tokens[idx].meta as { callout?: string } | undefined)?.callout;
    if (!cls) return open;
    return `${open}<div class="callout-label">${CALLOUT_LABEL[cls] ?? cls}</div>`;
  };
}

// Rough word + character counts for the editor footer.
export function countWords(text: string): { words: number; chars: number } {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return { words, chars: text.length };
}

// Source+theme keyed cache of rendered SVGs. Keeps re-renders (every keystroke,
// a ResizeObserver tick, a theme flip) cheap, and lets a transient syntax error
// while typing keep the previous good SVG on screen instead of flashing empty.
const svgCache = new Map<string, string>();

// Walk a rendered container and hydrate any ```mermaid placeholders into SVG.
// Idempotent: a block already showing the right render for the current theme is
// skipped, so this is safe to call on every render/theme change.
export async function hydrateMermaidBlocks(
  root: HTMLElement,
  theme: "dark" | "default",
): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>(".mermaid-block"),
  );
  await Promise.all(
    blocks.map(async (el) => {
      const source = (el.dataset.source ?? "").trim();
      if (!source) return;
      const key = `${theme}\n${source}`;
      // Already rendered for this exact source+theme — nothing to do.
      if (el.dataset.renderedKey === key) return;

      const cached = svgCache.get(key);
      if (cached) {
        el.innerHTML = cached;
        el.dataset.rendered = "1";
        el.dataset.renderedKey = key;
        return;
      }
      try {
        const svg = await renderMermaid(source, theme);
        svgCache.set(key, svg);
        el.innerHTML = svg;
        el.dataset.rendered = "1";
        el.dataset.renderedKey = key;
      } catch (e) {
        // Invalid syntax — surface the message (GitHub-style) unless we already
        // have a good render for this block, in which case keep showing it.
        if (el.dataset.rendered !== "1") {
          const msg = e instanceof Error ? e.message : String(e);
          el.innerHTML = `<pre class="mermaid-error"></pre>`;
          const pre = el.firstElementChild as HTMLElement | null;
          if (pre) pre.textContent = msg;
          el.dataset.renderedKey = key;
        }
      }
    }),
  );
}
