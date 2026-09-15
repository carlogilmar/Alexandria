// Shared markdown-it configuration for every markdown surface (notes). Centralizing it means the link behavior and the inline
// ```mermaid fence support live in one place instead of being copy-pasted
// into each editor.

import MarkdownIt from "markdown-it";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { iconByShortcode, iconInlineSvg } from "$lib/storyIcons";
import { cardAccent } from "$lib/cardColors";
import { tagHue } from "$lib/badges";
import { parseStages } from "$lib/stages";
import type { FeedbackColumn, FeedbackCardSummary } from "$lib/ipc";
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
    const rawInfo = tokens[idx].info.trim();
    const info = rawInfo.toLowerCase();
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
    // ```treemap [color] [animated] → a single-color squarified treemap.
    if (info === "treemap" || info.startsWith("treemap ")) {
      return renderTreemap(tokens[idx].content, info.split(/\s+/).slice(1), md);
    }
    // ```lettering [color] → a big, centered display-type announcement.
    if (info === "lettering" || info.startsWith("lettering ")) {
      return renderLettering(tokens[idx].content, info.split(/\s+/).slice(1), md);
    }
    // ```workflow [title] → a numbered "chain" of steps in a card (PNG copy).
    if (info === "workflow" || info.startsWith("workflow ")) {
      return renderWorkflow(tokens[idx].content, rawInfo.slice(8).trim(), md);
    }
    // ```list → a simple, hover-friendly list of ideas (one row each).
    if (info === "list") {
      return renderList(tokens[idx].content, md);
    }
    // ```files → a changed-files list (status chip · path · ±lines · note).
    if (info === "files") {
      return renderFiles(tokens[idx].content, md);
    }
    // ```stats → a row of metric cards.  ```spec → a label→value sheet.
    // Both take an optional accent color in the fence info (e.g. `spec violet`).
    if (info === "stats" || info.startsWith("stats ")) {
      return renderStats(tokens[idx].content, info.split(/\s+/).slice(1), md);
    }
    if (info === "spec" || info.startsWith("spec ")) {
      return renderSpec(tokens[idx].content, info.split(/\s+/).slice(1), md);
    }
    // ```terminal [title] [animated] → a console window (backend PR docs).
    if (info === "terminal" || info.startsWith("terminal ")) {
      return renderTerminal(tokens[idx].content, rawInfo.slice(8).trim(), md);
    }
    // ```tree [title] → a file/dir tree; a line ending `pulse` breathes.
    if (info === "tree" || info.startsWith("tree ")) {
      return renderTree(tokens[idx].content, rawInfo.slice(4).trim(), md);
    }
    // ```flow [title] → a linear pipeline (auto horizontal / vertical).
    if (info === "flow" || info.startsWith("flow ")) {
      return renderFlow(tokens[idx].content, rawInfo.slice(4).trim(), md);
    }
    // ```compare [title] → before / after, split by a `---` line.
    if (info === "compare" || info.startsWith("compare ")) {
      return renderCompare(tokens[idx].content, rawInfo.slice(7).trim(), md);
    }
    // ```blueprint [title] → a small node-graph diagram from the import DSL.
    if (info === "blueprint" || info.startsWith("blueprint ")) {
      return renderBlueprint(tokens[idx].content, rawInfo.slice(9).trim(), md);
    }
    // ```links [title] → a "related items" list of internal entity links
    // ([label](note:5) etc.), one per line, rendered as icon+title+kind rows.
    if (info === "links" || info.startsWith("links ")) {
      return renderLinks(tokens[idx].content, rawInfo.slice(5).trim(), md);
    }
    // ```linkchips [title] → the same links rendered as compact "see also" pills.
    if (info === "linkchips" || info.startsWith("linkchips ")) {
      return renderLinkChips(tokens[idx].content, rawInfo.slice(9).trim(), md);
    }
    // ```stages [title] → an illustrated "tree of stages" — ordered strata with
    // magnitude bubbles. Emits a host that hydrateStagesBlocks mounts a canvas
    // into (async, interactive), like the board embeds.
    if (info === "stages" || info.startsWith("stages ")) {
      return renderStages(tokens[idx].content, rawInfo.slice(6).trim(), md);
    }
    // Every other fenced block gets a GitHub-style copy button. The button is
    // static HTML (no per-instance handler survives `{@html}` re-renders); a
    // single delegated document listener — installCodeCopy — handles the click
    // and reads the code from the sibling <code>'s textContent.
    const rendered = defaultFence(tokens, idx, opts, env, self);
    return `<div class="md-code">${CODE_COPY_BTN}${rendered}</div>`;
  };

  // Stamp the source line range (data-line / data-end-line) on every fenced
  // block's outer element — the per-block editor uses it to slice/splice just
  // that block. Wrapped AFTER the big dispatch above so that stays untouched;
  // the regular block tokens get the same attrs via addLineNumbers.
  const fenceRule = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) =>
    withSourceRange(fenceRule(tokens, idx, opts, env, self), tokens[idx].map);

  // Inline `code` → a copyable "badge": the token text + an always-visible copy
  // button carrying the raw text in data-code (browsers decode entities on read,
  // so the copied text is exact). A delegated listener does the copy.
  md.renderer.rules.code_inline = (tokens, idx) => {
    const esc = md.utils.escapeHtml(tokens[idx].content);
    return (
      `<code class="md-badge" data-code="${esc}">${esc}` +
      `<button class="md-badge-copy" type="button" tabindex="-1" aria-label="Copy" title="Copy">${INLINE_COPY_ICON}</button>` +
      `</code>`
    );
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

  // `:name:` → an inline dev icon (Lucide concept / Devicon brand). Only
  // consumes the token when `name` is a KNOWN icon, so `10:30` / URLs / plain
  // colons are left untouched. Concept icons inherit the text color.
  addIconShortcodes(md);

  // GitHub-style callouts: a blockquote whose first line is [!TYPE].
  addCallouts(md);

  // GitHub-style task lists: `- [ ] todo` / `- [x] done` → checkbox items.
  addTaskLists(md);

  // Tag each top-level block with its source line (`data-line`). Inert almost
  // everywhere; the note editor uses it to (a) scroll the preview to the block
  // you last edited and (b) place the caret when you click a block to edit.
  addLineNumbers(md);

  // Toggle headings: `## > Title` → a collapsible <details> section (collapsed
  // by default) so a long note reads as a summary you expand on demand. Runs
  // after line_numbers so the heading tokens keep their data-line.
  addCollapsibleSections(md);

  // `{{board N}}` → a read-only feedback-board embed (hydrated after render).
  addBoardEmbeds(md);

  // One delegated listener powers the copy buttons across every surface.
  installCodeCopy();
  installInlineCopy();
  installBlockImageCopy();
  installGifSave();
  installSectionToggle();

  return md;
}

// Collapsible "toggle" sections. A heading whose text starts with `>` becomes a
// <details> section whose body is every block down to the next heading of the
// same-or-higher level. `## > Title` is COLLAPSED, `## >> Title` is OPEN — the
// open/closed status lives in the source, so clicking the header flips the
// marker (see toggleSectionInSource) and it survives edit → view. Each section
// carries a `data-section` document-order index so the click can find its line.
function addCollapsibleSections(md: MarkdownIt): void {
  md.core.ruler.push("collapsible_sections", (state) => {
    const src = state.tokens;
    const out: typeof src = [];
    const stack: number[] = []; // levels of currently-open toggle sections
    let sectionIdx = 0;

    const closeThrough = (level: number) => {
      while (stack.length && stack[stack.length - 1] >= level) {
        stack.pop();
        out.push(new state.Token("section_close", "", -1));
      }
    };

    for (let i = 0; i < src.length; i++) {
      const tok = src[i];
      if (
        tok.type === "heading_open" &&
        src[i + 1]?.type === "inline" &&
        src[i + 2]?.type === "heading_close"
      ) {
        const level = Number(tok.tag.slice(1)) || 1; // h2 → 2
        // A new heading closes any open section at its level or deeper.
        closeThrough(level);
        const inline = src[i + 1];
        const m = /^(>>?)\s?/.exec(inline.content);
        if (m) {
          const isOpen = m[1] === ">>";
          // Strip the `>` / `>>` marker from the rendered heading text.
          inline.content = inline.content.replace(/^>>?\s?/, "");
          const first = inline.children?.[0];
          if (first && first.type === "text") {
            first.content = first.content.replace(/^>>?\s?/, "");
          }
          const so = new state.Token("section_open", "", 1);
          so.attrSet("data-section", String(sectionIdx));
          if (isOpen) so.attrSet("data-open", "1");
          sectionIdx++;
          out.push(so);
          out.push(tok, inline, src[i + 2]);
          out.push(new state.Token("section_body_open", "", 0));
          stack.push(level);
        } else {
          out.push(tok, inline, src[i + 2]);
        }
        i += 2;
        continue;
      }
      out.push(tok);
    }
    closeThrough(0); // close any still-open sections at EOF
    state.tokens = out;
  });

  md.renderer.rules.section_open = (tokens, idx) => {
    const t = tokens[idx];
    const i = t.attrGet("data-section") ?? "0";
    const open = t.attrGet("data-open") ? " open" : "";
    return `<details class="md-section"${open}><summary class="md-section-sum" data-section="${i}">`;
  };
  md.renderer.rules.section_body_open = () =>
    '</summary><div class="md-section-body">';
  md.renderer.rules.section_close = () => "</div></details>";
}

// Native <details> toggling is intercepted here (capture phase) so a click on a
// section header toggles it WITHOUT tripping a surface's click-to-edit. This is
// the EPHEMERAL toggle for read-only surfaces (blueprint cards, flashcards). An
// editor preview marked `[data-md-sections="persist"]` handles its own clicks
// (it writes the open/closed status back to the source), so we bail there and
// let the click bubble to the editor. A link inside the heading is left alone.
let sectionToggleInstalled = false;
function installSectionToggle(): void {
  if (sectionToggleInstalled || typeof document === "undefined") return;
  sectionToggleInstalled = true;
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const sum = target?.closest?.(".md-section-sum") as HTMLElement | null;
      if (!sum) return;
      if (target?.closest?.("a")) return; // let links navigate
      if (sum.closest('[data-md-sections="persist"]')) return; // editor persists
      e.stopPropagation();
      e.preventDefault();
      const details = sum.closest(
        "details.md-section",
      ) as HTMLDetailsElement | null;
      if (details) details.open = !details.open;
    },
    true,
  );
}

// Flip the Nth toggle-section marker (`## > ` ↔ `## >> `, document order) in
// raw markdown source, persisting its open/closed status. Skips fenced code so
// a literal `## > ` inside a code block isn't counted. Mirrors
// toggleTaskInSource; returns the new source, or null if the index wasn't found.
export function toggleSectionInSource(src: string, index: number): string | null {
  const lines = src.split("\n");
  let inFence = false;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(\s*#{1,6}\s+)(>>?)(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (count === index) {
      lines[i] = m[1] + (m[2] === ">>" ? ">" : ">>") + m[3];
      return lines.join("\n");
    }
    count++;
  }
  return null;
}

// Set `data-line="<0-based source line>"` on every top-level block token that
// carries source-map info. Runs as a core rule after all block parsing, so it
// sees final tokens; the default `renderToken` emits the attribute. Custom
// fence renderers (mermaid/cards/chart/…) build HTML by hand and ignore token
// attrs, so those blocks simply won't carry a line — acceptable.
function addLineNumbers(md: MarkdownIt): void {
  md.core.ruler.push("line_numbers", (state) => {
    for (const token of state.tokens) {
      // level 0 = top-level; nesting >= 0 = open or self-closing (skip closes).
      if (token.level === 0 && token.nesting >= 0 && token.map) {
        token.attrSet("data-line", String(token.map[0]));
        // End line is exclusive (markdown-it convention) — the per-block editor
        // slices lines[start, end).
        token.attrSet("data-end-line", String(token.map[1]));
      }
    }
  });
}

// Inject data-line / data-end-line into the outermost element of a fenced
// block's HTML (custom fences build HTML by hand and ignore token attrs). Used
// to make powered blocks per-block editable like the regular blocks.
function withSourceRange(html: string, map: [number, number] | null): string {
  if (!map || !html) return html;
  return html.replace(
    /^(\s*<[a-zA-Z][\w-]*)/,
    `$1 data-line="${map[0]}" data-end-line="${map[1]}"`,
  );
}

// Replace source lines [start, end) with `text` (the per-block editor's save).
// Sibling of toggleTaskInSource — a targeted rewrite of one block's raw markdown.
export function replaceLinesInSource(
  src: string,
  start: number,
  end: number,
  text: string,
): string {
  const lines = src.split("\n");
  const before = lines.slice(0, Math.max(0, start));
  const after = lines.slice(Math.max(start, end));
  return [...before, ...text.split("\n"), ...after].join("\n");
}

// The copy button injected into each non-mermaid fenced block. Two icons —
// clipboard + check — CSS-toggled by the `.md-copied` class after a copy.
// Clipboard + check icons for the inline-code "badge" copy button. CSS toggles
// them via `.md-copied` (see app.css .md-badge-copy).
const INLINE_COPY_ICON =
  '<svg class="md-badge-clip" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path d="M7 3a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V7.4A2 2 0 0014.4 6L12 3.6A2 2 0 0010.6 3H7z"/>' +
  '<path d="M3 7a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>' +
  '<svg class="md-badge-check" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z" clip-rule="evenodd"/></svg>';

// Per-type callout icons (currentColor → tinted with the type color). Warning +
// caution share the triangle; note = info, tip = bulb, important = star,
// comment = speech bubble.
const CALLOUT_ICON: Record<string, string> = {
  note: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 4a1 1 0 11-2 0 1 1 0 012 0zM9 9h2v5H9V9z"/></svg>',
  tip: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2a5 5 0 00-3 9v2a1 1 0 001 1h4a1 1 0 001-1v-2a5 5 0 00-3-9zM8 16a1 1 0 001 1h2a1 1 0 001-1v-1H8v1z"/></svg>',
  important:
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 1.6l2.5 5 5.5.8-4 3.9.95 5.5L10 14.7 5.05 16.8 6 11.3l-4-3.9 5.5-.8L10 1.6z"/></svg>',
  warning:
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M8.6 2.9a1.6 1.6 0 012.8 0l6.3 11.4A1.6 1.6 0 0116.3 17H3.7a1.6 1.6 0 01-1.4-2.7L8.6 2.9zM9 7v4h2V7H9zm0 6v2h2v-2H9z"/></svg>',
  caution:
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M8.6 2.9a1.6 1.6 0 012.8 0l6.3 11.4A1.6 1.6 0 0116.3 17H3.7a1.6 1.6 0 01-1.4-2.7L8.6 2.9zM9 7v4h2V7H9zm0 6v2h2v-2H9z"/></svg>',
  comment:
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M4 3h12a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>',
};

const CODE_COPY_BTN =
  '<button class="md-copy-btn" type="button" title="Copy code" aria-label="Copy code">' +
  '<svg class="md-copy-i" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path d="M7 3a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V7.414A2 2 0 0014.414 6L12 3.586A2 2 0 0010.586 3H7z"/>' +
  '<path d="M3 7a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>' +
  '<svg class="md-copy-check" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z" clip-rule="evenodd"/></svg>' +
  "</button>";

// "Copy as image" button — injected into doc blocks (files/stats/spec/cards).
// A delegated listener (installBlockImageCopy) rasterizes the block and copies
// a PNG to the clipboard so it can be pasted straight into a PR / chat.
const IMG_COPY_BTN =
  '<button class="md-img-copy" type="button" title="Copy as image" aria-label="Copy as image">' +
  '<svg class="md-copy-i" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
  '<rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="8" cy="9" r="1.6"/><path d="M4 15l4-4 3 3 3-3 2 2"/></svg>' +
  '<svg class="md-copy-check" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z" clip-rule="evenodd"/></svg>' +
  "</button>";

// "Save as GIF" button — shown only on files/stats/spec blocks that contain a
// `pulse` item. Saves a looping GIF of the breathing animation (installGifSave).
const GIF_SAVE_BTN =
  '<button class="md-gif-save" type="button" title="Save as animated GIF (pulse)" aria-label="Save as animated GIF">GIF</button>';

// Wrap a block so it gets a hover "copy as image" button (positioned by CSS).
// `opts.gif` adds the "Save as GIF" button (blocks with a pulse item).
function withImgCopy(inner: string, opts: { gif?: boolean } = {}): string {
  const gif = opts.gif ? GIF_SAVE_BTN : "";
  return `<div class="md-block" data-md-block>${inner}${IMG_COPY_BTN}${gif}</div>`;
}

// Shared GitHub-style header bar (tinted strip: title + optional subtitle on
// the left, a metric/count on the right). Used by files/cards/spec.
function blockHeader(
  title: string,
  sub: string,
  meta: string,
  md: MarkdownIt,
): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  return (
    `<div class="md-bhead"><span class="md-bhead-left">` +
    `<span class="md-bhead-title">${esc(title)}</span>` +
    (sub ? `<span class="md-bhead-sub">${esc(sub)}</span>` : "") +
    `</span>` +
    (meta ? `<span class="md-bhead-meta">${esc(meta)}</span>` : "") +
    `</div>`
  );
}

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
const CARD_ENTITY =
  /^(note|list|flashcard|blueprint|storyboard):(\d+)$/;

// ```workflow [title] → a numbered chain of steps in a card. One step per
// non-empty line; `backtick` segments render as tag badges. Wrapped in a card
// (optional fence-info header) with a hover effect + a PNG copy button (no GIF).
function renderWorkflow(source: string, title: string, md: MarkdownIt): string {
  const steps = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (steps.length === 0) return "";
  const items = steps
    .map((line, i) => {
      const parts = line
        .split(/(`[^`]+`)/g)
        .filter(Boolean)
        .map((seg) =>
          seg.length > 1 && seg.startsWith("`") && seg.endsWith("`")
            ? `<span class="md-wf-tag">${md.utils.escapeHtml(seg.slice(1, -1))}</span>`
            : md.utils.escapeHtml(seg),
        )
        .join("");
      return `<li class="md-wf-step"><span class="md-wf-num">${i + 1}</span><span class="md-wf-text">${parts}</span></li>`;
    })
    .join("");
  // Default header "Workflow" when the fence gives no title.
  const bar = blockHeader(
    title || "Workflow",
    "",
    `${steps.length} step${steps.length === 1 ? "" : "s"}`,
    md,
  );
  return withImgCopy(
    `<div class="md-workflow-block">${bar}<ol class="md-workflow">${items}</ol></div>`,
  );
}

// ```list → a simple list of ideas as one row each (a visual, hover-friendly
// list — NOT a workflow), styled like the files block. Per line:
//   idea title [— description] [- <color>]
// A trailing ` - <color>` tints the row's left rail; an optional ` — ` (or
// ` -- ` / ` # `) adds a description row beneath. No export buttons. Both the
// title and description support inline markdown.
function renderList(source: string, md: MarkdownIt): string {
  const rows: string[] = [];
  for (const raw of source.split("\n")) {
    let text = raw.trim();
    if (!text) continue;
    // Trailing ` - <color>` (single hyphen) → the row's accent.
    let color = "";
    const cm = /\s+-\s+([a-zA-Z]+)\s*$/.exec(text);
    if (cm && NAMED_COLORS[cm[1].toLowerCase()]) {
      color = NAMED_COLORS[cm[1].toLowerCase()];
      text = text.slice(0, cm.index).trim();
    }
    // Optional description after ` — ` / ` -- ` / ` # `.
    let desc = "";
    const dm = /\s+(?:—|--|#)\s+(.*)$/.exec(text);
    if (dm) {
      desc = dm[1].trim();
      text = text.slice(0, dm.index).trim();
    }
    if (!text && !desc) continue;
    const style = color ? ` style="--c:${color}"` : "";
    rows.push(
      `<div class="md-list-row"${style}>` +
        `<div class="md-list-title">${md.renderInline(text)}</div>` +
        (desc ? `<div class="md-list-desc">${md.renderInline(desc)}</div>` : "") +
        `</div>`,
    );
  }
  if (rows.length === 0) return "";
  return `<div class="md-list">${rows.join("")}</div>`;
}

function renderCards(source: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const blocks = source.split(/^\s*-{3,}\s*$/m);

  // Optional section header: if the FIRST block declares `heading:`, render a
  // GitHub-style header bar (title + optional `desc:` subtitle + card count)
  // ABOVE the grid. Backward-compatible — cards without `heading:` are a bare
  // grid.
  let headingText = "";
  let descText = "";
  if (blocks.length > 0) {
    const first: Record<string, string> = {};
    for (const line of blocks[0].split("\n")) {
      const m = /^\s*([a-zA-Z]+)\s*:\s*(.*)$/.exec(line);
      if (m) first[m[1].toLowerCase()] = m[2].trim();
    }
    if (first.heading) {
      headingText = first.heading;
      descText = first.desc ?? "";
      blocks.shift();
    }
  }

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
  const n = cards.length;
  const bar = headingText
    ? blockHeader(headingText, descText, `${n} card${n === 1 ? "" : "s"}`, md)
    : "";
  if (n === 0) {
    return bar ? withImgCopy(`<div class="md-cards-panel">${bar}</div>`) : "";
  }
  const grid = `<div class="md-cards">${cards.join("")}</div>`;
  return withImgCopy(
    bar
      ? `<div class="md-cards-panel">${bar}<div class="md-cards-body">${grid}</div></div>`
      : grid,
  );
}

// Surface themes for the stats/spec widgets, chosen by a fence keyword (e.g.
// ```stats slate` / ```spec github`). Each maps to a `.md-theme-*` class that
// sets the surface CSS vars. Default is github (the light-gray "files changed"
// look). `gray` is an alias for github.
const SURFACE_THEMES: Record<string, string> = {
  dark: "md-theme-dark",
  midnight: "md-theme-midnight",
  slate: "md-theme-slate",
  light: "md-theme-light",
  github: "md-theme-github",
  gray: "md-theme-github",
};
function surfaceThemeClass(opts: string[]): string {
  for (const o of opts) {
    const t = o.toLowerCase();
    if (SURFACE_THEMES[t]) return SURFACE_THEMES[t];
  }
  return "md-theme-github"; // default
}

// Per-item `pulse` flag: a standalone trailing `pulse` word marks that single
// card / row / file for the breathing animation. Returns the text with it
// removed + whether it was present. Shared by stats / spec / files.
function peelPulse(s: string): { text: string; pulse: boolean } {
  const m = /\s+pulse\s*$/i.exec(s);
  if (m) return { text: s.slice(0, m.index).trim(), pulse: true };
  return { text: s.trim(), pulse: false };
}

// Status → accent color / long label, shared by the files block.
const FILE_STATUS_COLOR: Record<string, string> = {
  A: "#16a34a",
  M: "#d97706",
  D: "#dc2626",
  R: "#2563eb",
};
const FILE_STATUS_WORD: Record<string, string> = {
  A: "new",
  M: "edit",
  D: "delete",
  R: "rename",
};

// ```files → a changed-files list for PR/code docs. One file per line:
//   <STATUS> <path> [— note]
// STATUS is A/M/D/R → a colored `new`/`edit`/`delete`/`rename` label (case-
// insensitive, default M). Any `+N`/`-N` counts are ignored (not shown). A note
// after ` — ` / ` -- ` / ` # ` renders as a description row (inline markdown).
function renderFiles(source: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const rows: string[] = [];
  let nFiles = 0;
  let anyPulse = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // Peel off a trailing note after — / -- / #.
    let note = "";
    let main = line;
    const nm = /\s+(?:—|--|#)\s+(.*)$/.exec(line);
    if (nm) {
      note = nm[1].trim();
      main = line.slice(0, nm.index).trim();
    }
    // A trailing `pulse` (before the note) makes this file row breathe.
    let pulse = false;
    ({ text: main, pulse } = peelPulse(main));
    anyPulse ||= pulse;
    // Drop any `+N` / `-N` counts — we show a status label, not line numbers.
    main = main.replace(/\s+[+-]\d+/g, "").trim();
    const parts = main.split(/\s+/);
    let status = "M";
    let idx = 0;
    if (/^[AMDR]$/i.test(parts[0])) {
      status = parts[0].toUpperCase();
      idx = 1;
    }
    const path = parts[idx] ?? "";
    if (!path) continue;
    nFiles++;
    // Split dir/ from the filename so the reviewer's eye lands on the file.
    const slash = path.lastIndexOf("/");
    const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const pathHtml =
      (dir ? `<span class="md-file-dir">${esc(dir)}</span>` : "") +
      `<span class="md-file-name">${esc(name)}</span>`;
    const acc = FILE_STATUS_COLOR[status] ?? FILE_STATUS_COLOR.M;
    const word = FILE_STATUS_WORD[status] ?? "edit";
    rows.push(
      `<div class="md-file${pulse ? " md-pulse" : ""}" style="--st:${acc}">` +
        `<div class="md-file-top">` +
        `<span class="md-file-tag md-file-tag-${word}">${word}</span>` +
        `<span class="md-file-path">${pathHtml}</span></div>` +
        // The note supports basic inline markdown (`code`, **bold**, links).
        (note ? `<div class="md-file-desc">${md.renderInline(note)}</div>` : "") +
        `</div>`,
    );
  }
  if (rows.length === 0) return "";
  const head =
    `<div class="md-files-head"><span class="md-files-count">${nFiles} file${nFiles === 1 ? "" : "s"} changed</span></div>`;
  return withImgCopy(`<div class="md-files">${head}${rows.join("")}</div>`, {
    gif: anyPulse,
  });
}

// ```stats [theme] → a row of metric cards. One `Label: value` per line; the
// value is free text (big), the label small. `+N` / `-N` inside the value are
// colored (green/red). Cards follow the widget theme (default github). A
// trailing `pulse` on a line makes that card breathe; a trailing color word is
// accepted but ignored (legacy).
function renderStats(source: string, opts: string[], md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const colorNums = (s: string) =>
    esc(s)
      .replace(/\+(\d[\d,]*)/g, '<span class="p">+$1</span>')
      .replace(/[−-](\d[\d,]*)/g, '<span class="m">−$1</span>');
  // An optional `heading:` line becomes a GitHub-style header bar (title +
  // metric count); every other `Label: value` line is a metric card.
  let headingText = "";
  let anyPulse = false;
  const cards: string[] = [];
  for (const raw of source.split("\n")) {
    const hm = /^\s*heading\s*:\s*(.*)$/i.exec(raw);
    if (hm) {
      headingText = hm[1].trim();
      continue;
    }
    const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const label = m[1].trim();
    let value = m[2].trim();
    if (!label && !value) continue;
    // Peel a trailing `pulse` flag, then strip a legacy trailing color word.
    let pulse = false;
    ({ text: value, pulse } = peelPulse(value));
    anyPulse ||= pulse;
    const cm = /\s+([a-zA-Z]+)$/.exec(value);
    if (cm && NAMED_COLORS[cm[1].toLowerCase()]) {
      value = value.slice(0, cm.index).trim();
    }
    cards.push(
      `<div class="md-stat${pulse ? " md-pulse" : ""}"><span class="md-stat-v">${colorNums(value)}</span><span class="md-stat-k">${esc(label)}</span></div>`,
    );
  }
  if (cards.length === 0) return "";
  const surf = surfaceThemeClass(opts);
  if (!headingText) {
    return withImgCopy(`<div class="md-stats ${surf}">${cards.join("")}</div>`, {
      gif: anyPulse,
    });
  }
  const n = cards.length;
  const bar = blockHeader(
    headingText,
    "",
    `${n} metric${n === 1 ? "" : "s"}`,
    md,
  );
  return withImgCopy(
    `<div class="md-stats-panel ${surf}">${bar}<div class="md-stats-body"><div class="md-stats">${cards.join("")}</div></div></div>`,
    { gif: anyPulse },
  );
}

// ```spec [theme] → a label→value "spec sheet". One `Label: value` per line.
// The key column follows the widget theme (default github); values support
// basic inline markdown (`code`, **bold**, links, :icons:).
function renderSpec(source: string, opts: string[], md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  // An optional `heading:` line becomes a GitHub-style header bar (title +
  // field count); every other `Label: value` line is a row.
  let headingText = "";
  let anyPulse = false;
  const rows: string[] = [];
  for (const raw of source.split("\n")) {
    const hm = /^\s*heading\s*:\s*(.*)$/i.exec(raw);
    if (hm) {
      headingText = hm[1].trim();
      continue;
    }
    const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const label = m[1].trim();
    // A trailing `pulse` makes this row breathe.
    const { text: value, pulse } = peelPulse(m[2].trim());
    anyPulse ||= pulse;
    if (!label && !value) continue;
    rows.push(
      `<div class="md-spec-row${pulse ? " md-pulse" : ""}"><span class="md-spec-k">${esc(label)}</span><span class="md-spec-v">${md.renderInline(value)}</span></div>`,
    );
  }
  if (rows.length === 0) return "";
  const n = rows.length;
  const bar = headingText
    ? blockHeader(headingText, "", `${n} field${n === 1 ? "" : "s"}`, md)
    : "";
  const surf = surfaceThemeClass(opts);
  return withImgCopy(`<div class="md-spec ${surf}">${bar}${rows.join("")}</div>`, {
    gif: anyPulse,
  });
}

// ```terminal [title] [animated] → a console window for "how to run / test".
// The fence info is the title-bar label (its built-in header); a trailing
// `animated` streams the lines in (GIF). Lines starting with `$` are commands.
function renderTerminal(source: string, meta: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  let animated = false;
  const title = meta
    .split(/\s+/)
    .filter((t) => {
      if (t.toLowerCase() === "animated") {
        animated = true;
        return false;
      }
      return true;
    })
    .join(" ");
  const lines = source.replace(/\n+$/, "").split("\n");
  const body = lines
    .map((l, i) => {
      const isCmd = /^\s*\$\s?/.test(l);
      const cls = isCmd ? "md-term-cmd" : "md-term-out";
      const inner = `<span class="${cls}">${esc(l === "" ? " " : l)}</span>`;
      return animated
        ? `<span class="md-term-line" style="animation-delay:${(i * 0.5).toFixed(2)}s">${inner}</span>`
        : inner;
    })
    .join("\n");
  const bar =
    `<div class="md-term-bar"><i class="r"></i><i class="y"></i><i class="g"></i>` +
    `<span>${esc(title || "terminal")}</span></div>`;
  return withImgCopy(
    `<div class="md-term${animated ? " md-term-anim" : ""}">${bar}<pre>${body}</pre></div>`,
    { gif: animated },
  );
}

// ```tree [title] → a file/directory tree. Indentation (2 spaces = 1 level)
// nests; a trailing ` - new` / ` - edit` legend tags the file (green / amber, no
// line counts). A line ending in `pulse` makes its TEXT breathe (GIF). Header
// from the fence info.
type TreeNode = {
  name: string;
  status: "new" | "edit" | "";
  pulse: boolean;
  depth: number;
  children: TreeNode[];
};
function renderTree(source: string, title: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const flat: TreeNode[] = [];
  let newCount = 0;
  let anyPulse = false;
  for (const raw of source.replace(/\n+$/, "").split("\n")) {
    if (!raw.trim()) continue;
    const indent = (raw.match(/^ */)?.[0].length ?? 0) >> 1;
    const { text, pulse } = peelPulse(raw.trim());
    anyPulse ||= pulse;
    // Trailing ` - new` / ` - edit` (also tolerates the old 2-space form).
    let status: TreeNode["status"] = "";
    let name = text;
    const sm = /(?:\s+-\s+|\s{2,})(new|edit)\s*$/i.exec(text);
    if (sm) {
      status = sm[1].toLowerCase() as TreeNode["status"];
      name = text.slice(0, sm.index).trim();
    }
    if (status === "new") newCount++;
    flat.push({ name, status, pulse, depth: indent, children: [] });
  }
  if (flat.length === 0) return "";
  // Build nesting from the depth column.
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const node of flat) {
    while (stack.length > node.depth) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  const rows: string[] = [];
  const walk = (nodes: TreeNode[], prefix: string, root: boolean) => {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      const branch = root ? "" : last ? "└── " : "├── ";
      const nameCls = n.status ? `md-tree-${n.status}` : "";
      const tag = n.status
        ? `  <span class="md-tree-tag md-tree-tag-${n.status}">${n.status}</span>`
        : "";
      rows.push(
        `<span class="md-tree-line${n.pulse ? " md-tpulse" : ""}">${esc(prefix + branch)}` +
          `<span class="${nameCls}">${esc(n.name)}</span>${tag}</span>`,
      );
      if (n.children.length)
        walk(n.children, root ? "" : prefix + (last ? "    " : "│   "), false);
    });
  };
  walk(roots, "", true);
  const bar = title
    ? blockHeader(title, "", newCount ? `${newCount} new` : "", md)
    : "";
  return withImgCopy(
    `<div class="md-tree-block${anyPulse ? " md-treeon" : ""}">${bar}<div class="md-tree">${rows.join("\n")}</div></div>`,
    { gif: anyPulse },
  );
}

// ```flow [title] → a linear pipeline. One node per line, `Name: sublabel`.
// ≤4 nodes render horizontally, 5+ stack vertically (labels stay readable).
// Always motion (a marker travels + nodes light in order) → GIF. Header from
// the fence info.
function renderFlow(source: string, title: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const nodes = source
    .replace(/\n+$/, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const c = l.indexOf(":");
      return c === -1
        ? { name: l, sub: "" }
        : { name: l.slice(0, c).trim(), sub: l.slice(c + 1).trim() };
    });
  if (nodes.length === 0) return "";
  const n = nodes.length;
  const bar = title
    ? blockHeader(title, "", `${n} step${n === 1 ? "" : "s"}`, md)
    : "";
  const vertical = n >= 5;
  const cycle = vertical ? 5.5 : 4; // seconds — matches the marker travel
  // Each node's highlight fires when the marker is over it (its `--fdelay`).
  const delay = (i: number) =>
    (((n === 1 ? 0.5 : 0.06 + 0.88 * (i / (n - 1))) * cycle) as number).toFixed(
      2,
    );
  if (vertical) {
    const items = nodes
      .map(
        (nd, i) =>
          `<div class="md-fnode" style="--fdelay:${delay(i)}s"><span class="md-frd"></span>${esc(nd.name)}` +
          (nd.sub ? `<small>${esc(nd.sub)}</small>` : "") +
          `</div>`,
      )
      .join("");
    return withImgCopy(
      `<div class="md-flow-block md-flowon">${bar}<div class="md-vflow">${items}<span class="md-fdot"></span></div></div>`,
      { gif: true },
    );
  }
  const items = nodes
    .map(
      (nd, i) =>
        `<div class="md-fnode" style="--fdelay:${delay(i)}s">${esc(nd.name)}` +
        (nd.sub ? `<small>${esc(nd.sub)}</small>` : "") +
        `</div>`,
    )
    .join("");
  return withImgCopy(
    `<div class="md-flow-block md-flowon">${bar}<div class="md-hflow"><div class="md-ftrack">${items}<span class="md-fdot"></span></div></div></div>`,
    { gif: true },
  );
}

// ```compare [title] → before / after, split by a `---` line. Cross-fades in
// place (GIF). Header from the fence info.
function renderCompare(source: string, title: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const parts = source.replace(/\n+$/, "").split(/^\s*-{3,}\s*$/m);
  const before = (parts[0] ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
  const after = (parts[1] ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
  if (!before && !after) return "";
  const bar = title
    ? blockHeader(title, "", "before → after", md)
    : "";
  return withImgCopy(
    `<div class="md-compare md-cmpon">${bar}<div class="md-cmp-stage">` +
      `<div class="md-cmp-layer md-cmp-before"><span class="md-cmp-tag">Before</span><pre>${esc(before)}</pre></div>` +
      `<div class="md-cmp-layer md-cmp-after"><span class="md-cmp-tag">After</span><pre>${esc(after)}</pre></div>` +
      `</div></div>`,
    { gif: true },
  );
}

// ```blueprint [title] → a SMALL node-graph diagram (the Blueprint import DSL,
// rendered inline). Lines:
//   Name: short description   → a box (title + optional desc)
//   A -> B -> C               → edges (undefined names auto-create nodes)
// Auto-laid-out into left→right layers (longest-path), drawn as pure SVG boxes +
// animated dashed arrows. PNG-copyable; big diagrams still belong in Blueprints.
let bpSeq = 0;
function renderBlueprint(source: string, title: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const order: string[] = [];
  const nodes = new Map<
    string,
    { title: string; desc: string; color: string }
  >();
  const edges: { from: string; to: string }[] = [];
  const ensure = (raw: string): string => {
    const n = raw.trim();
    if (!n) return "";
    if (!nodes.has(n)) {
      nodes.set(n, { title: n, desc: "", color: "" });
      order.push(n);
    }
    return n;
  };
  for (const line of source.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.includes("->")) {
      const parts = t.split(/->+/).map((p) => p.trim()).filter(Boolean);
      let prev = "";
      for (const p of parts) {
        const n = ensure(p);
        if (prev && n) edges.push({ from: prev, to: n });
        prev = n;
      }
      continue;
    }
    // A node line: `Name: description [- color]`.
    let body = t;
    let color = "";
    const cm = /\s+-\s+([a-zA-Z]+)\s*$/.exec(body);
    if (cm && NAMED_COLORS[cm[1].toLowerCase()]) {
      color = NAMED_COLORS[cm[1].toLowerCase()];
      body = body.slice(0, cm.index).trim();
    }
    const c = body.indexOf(":");
    const n = ensure(c >= 0 ? body.slice(0, c) : body);
    const rec = nodes.get(n);
    if (rec) {
      const desc = c >= 0 ? body.slice(c + 1).trim() : "";
      if (desc && !rec.desc) rec.desc = desc;
      if (color) rec.color = color;
    }
  }
  if (nodes.size === 0) return "";

  // Longest-path layering (Kahn). Cycle leftovers fall back to layer 0.
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of order) {
    adj.set(n, []);
    indeg.set(n, 0);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const layer = new Map<string, number>();
  const q = order.filter((n) => (indeg.get(n) ?? 0) === 0);
  for (const n of q) layer.set(n, 0);
  const left = new Map(indeg);
  for (let h = 0; h < q.length; h++) {
    const n = q[h];
    for (const m of adj.get(n) ?? []) {
      layer.set(m, Math.max(layer.get(m) ?? 0, (layer.get(n) ?? 0) + 1));
      left.set(m, (left.get(m) ?? 0) - 1);
      if ((left.get(m) ?? 0) === 0) q.push(m);
    }
  }
  const byLayer = new Map<number, string[]>();
  let maxLayer = 0;
  for (const n of order) {
    const L = layer.get(n) ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L)!.push(n);
    maxLayer = Math.max(maxLayer, L);
  }

  const BW = 178;
  const BH = 62;
  const GX = 66;
  const GY = 26;
  const PAD = 18;
  let maxCount = 1;
  for (let L = 0; L <= maxLayer; L++)
    maxCount = Math.max(maxCount, (byLayer.get(L) ?? []).length);
  const contentH = maxCount * BH + (maxCount - 1) * GY;
  const contentW = (maxLayer + 1) * BW + maxLayer * GX;
  const W = contentW + PAD * 2;
  const H = contentH + PAD * 2;

  const pos = new Map<string, { x: number; y: number }>();
  for (let L = 0; L <= maxLayer; L++) {
    const nl = byLayer.get(L) ?? [];
    const layerH = nl.length * BH + (nl.length - 1) * GY;
    const yStart = PAD + (contentH - layerH) / 2;
    const x = PAD + L * (BW + GX);
    nl.forEach((n, i) => pos.set(n, { x, y: yStart + i * (BH + GY) }));
  }

  // Edges: an SVG layer behind the cards (animated dashed, arrow at the target).
  const arrow = `md-bp-arrow-${bpSeq++}`;
  const edgeSvg = edges
    .map((e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) return "";
      const x1 = a.x + BW;
      const y1 = a.y + BH / 2;
      const x2 = b.x;
      const y2 = b.y + BH / 2;
      const dx = Math.max(24, Math.abs(x2 - x1) * 0.5);
      return `<path class="md-bp-edge" marker-end="url(#${arrow})" d="M${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"/>`;
    })
    .join("");
  const edgeLayer =
    `<svg class="md-bp-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><marker id="${arrow}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z"/></marker></defs>` +
    `${edgeSvg}</svg>`;
  // Nodes: HTML cards (left accent bar + shadow + centered title) like Blueprints.
  const nodeHtml = order
    .map((n) => {
      const p = pos.get(n)!;
      const rec = nodes.get(n)!;
      const accent = rec.color || "#64748b";
      return (
        `<div class="md-bp-node" style="left:${p.x}px;top:${p.y}px;width:${BW}px;height:${BH}px;--bp-accent:${accent}">` +
        `<div class="md-bp-t">${esc(rec.title)}</div>` +
        (rec.desc ? `<div class="md-bp-d">${esc(rec.desc)}</div>` : "") +
        `</div>`
      );
    })
    .join("");
  // Connection handles: a small dot wherever an edge meets a card (source
  // right / target left), on a layer ABOVE the cards so they sit on the border.
  const dotSet = new Set<string>();
  for (const e of edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    dotSet.add(`${a.x + BW},${a.y + BH / 2}`);
    dotSet.add(`${b.x},${b.y + BH / 2}`);
  }
  const dotsLayer = dotSet.size
    ? `<svg class="md-bp-dots" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      [...dotSet]
        .map((p) => {
          const [x, y] = p.split(",");
          return `<circle class="md-bp-dot" cx="${x}" cy="${y}" r="4"/>`;
        })
        .join("") +
      `</svg>`
    : "";
  const scene = `<div class="md-bp-scene" style="width:${W}px;height:${H}px">${edgeLayer}${nodeHtml}${dotsLayer}</div>`;
  const bar = title
    ? blockHeader(
        title,
        "",
        `${nodes.size} node${nodes.size === 1 ? "" : "s"}`,
        md,
      )
    : "";
  return withImgCopy(
    `<div class="md-blueprint">${bar}<div class="md-bp-canvas">${scene}</div></div>`,
  );
}

// ```links / ```linkchips — a list of internal entity links rendered as a
// distinct "related items" component instead of a stack of plain link buttons.
// Both read the same body: one markdown link per line, `[label](kind:id)` for a
// known entity kind (an optional `- ` / `* ` / `1. ` list prefix is tolerated,
// since these are usually authored as a bullet list), or `[label](https://…)`
// for an external URL. Labels are authored inline so no store/IPC lookup is
// needed — this renders synchronously like the other powered blocks. The anchors
// reuse the editors' existing entity-link click handling (see MarkdownEditor's
// onPreviewClick + navigateEntity), so `board:` is included alongside the five
// entity-link kinds.
const LINK_ICONS: Record<string, string> = {
  note:
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5 2.5A1.5 1.5 0 003.5 4v12A1.5 1.5 0 005 17.5h10A1.5 1.5 0 0016.5 16V7.4a1.5 1.5 0 00-.44-1.06l-3.4-3.4A1.5 1.5 0 0011.6 2.5H5z"/><rect x="6.2" y="8" width="7.6" height="1.3" rx=".65" fill="#fff" opacity=".85"/><rect x="6.2" y="10.7" width="7.6" height="1.3" rx=".65" fill="#fff" opacity=".85"/><rect x="6.2" y="13.4" width="4.6" height="1.3" rx=".65" fill="#fff" opacity=".85"/></svg>',
  blueprint:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="10" cy="15" r="2"/><path d="M6.5 7.2 8.7 13M13.5 7.2 11.3 13"/></svg>',
  board:
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><rect x="3" y="3.5" width="3.6" height="13" rx="1.2"/><rect x="8.2" y="3.5" width="3.6" height="9" rx="1.2"/><rect x="13.4" y="3.5" width="3.6" height="11" rx="1.2"/></svg>',
  list:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5l1.3 1.3L7.5 4.5"/><path d="M4 10.6l1.3 1.3 2.2-2.3"/><path d="M4 15.7l1.3 1.3 2.2-2.3"/><path d="M10.5 6h6M10.5 11h6M10.5 16h6"/></svg>',
  storyboard:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.8" y="5" width="9" height="7" rx="1.4"/><path d="M13.6 6.2h2.2a1 1 0 011 1v6.6a1 1 0 01-1 1H7.2a1 1 0 01-1-1V13" fill="none"/></svg>',
  flashcard:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4.5" width="14" height="11" rx="1.8"/><path d="M3 8.2h14"/><circle cx="6" cy="6.35" r=".55" fill="currentColor" stroke="none"/></svg>',
  link:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c1.9 2 1.9 12 0 14M10 3c-1.9 2-1.9 12 0 14"/></svg>',
};
const LINK_KIND: Record<string, { color: string; label: string }> = {
  note: { color: "#2563eb", label: "Note" },
  blueprint: { color: "#7c3aed", label: "Blueprint" },
  board: { color: "#0d9488", label: "Board" },
  list: { color: "#16a34a", label: "List" },
  storyboard: { color: "#db2777", label: "Storyboard" },
  flashcard: { color: "#d97706", label: "Card" },
};
const LINK_GO =
  '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7.3 4.8a1 1 0 000 1.4L11.1 10l-3.8 3.8a1 1 0 101.4 1.4l4.5-4.5a1 1 0 000-1.4L8.7 4.8a1 1 0 00-1.4 0z"/></svg>';

type LinkRef = {
  label: string;
  href: string;
  color: string;
  kindLabel: string;
  icon: string;
  external: boolean;
};
function parseEntityLinks(source: string): LinkRef[] {
  const out: LinkRef[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // `[label](target)`, optionally prefixed by a list marker.
    const m = /^(?:[-*]\s+|\d+[.)]\s+)?\[([^\]]+)\]\(\s*([^)\s]+)\s*\)$/.exec(
      line,
    );
    if (!m) continue;
    const label = m[1].trim();
    const target = m[2].trim();
    const ent = /^([a-z]+):(\d+)$/i.exec(target);
    if (ent && LINK_KIND[ent[1].toLowerCase()]) {
      const k = ent[1].toLowerCase();
      const meta = LINK_KIND[k];
      out.push({
        label,
        href: `${k}:${ent[2]}`,
        color: meta.color,
        kindLabel: meta.label,
        icon: LINK_ICONS[k] ?? LINK_ICONS.link,
        external: false,
      });
    } else if (/^https?:\/\//i.test(target)) {
      let host = "";
      try {
        host = new URL(target).hostname.replace(/^www\./, "");
      } catch {
        /* ignore */
      }
      out.push({
        label,
        href: target,
        color: "#64748b",
        kindLabel: host || "Link",
        icon: LINK_ICONS.link,
        external: true,
      });
    }
  }
  return out;
}

// ```links [title] → a bordered "related items" list: per row, a kind-colored
// icon tile + the label + the kind + a hover arrow. PNG-copyable.
function renderLinks(source: string, title: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const refs = parseEntityLinks(source);
  if (refs.length === 0) return "";
  const rows = refs
    .map((r) => {
      const attrs = r.external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return (
        `<a class="md-link-row" href="${esc(r.href)}" style="--lc:${r.color}"${attrs}>` +
        `<span class="md-link-ico">${r.icon}</span>` +
        `<span class="md-link-label">${esc(r.label)}</span>` +
        `<span class="md-link-kind">${esc(r.kindLabel)}</span>` +
        `<span class="md-link-go">${LINK_GO}</span>` +
        `</a>`
      );
    })
    .join("");
  const bar = blockHeader(title || "References", "", `${refs.length}`, md);
  return withImgCopy(`<div class="md-links">${bar}${rows}</div>`);
}

// ```linkchips [title] → the same links as compact wrapping "see also" pills
// (kind-colored dot + label). Lightweight/inline — no PNG button.
function renderLinkChips(source: string, title: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const refs = parseEntityLinks(source);
  if (refs.length === 0) return "";
  const chips = refs
    .map((r) => {
      const attrs = r.external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return (
        `<a class="md-linkchip" href="${esc(r.href)}" style="--lc:${r.color}"${attrs}>` +
        `<span class="md-linkchip-dot"></span>${esc(r.label)}</a>`
      );
    })
    .join("");
  const head = title
    ? `<div class="md-linkchips-title">${esc(title)}</div>`
    : "";
  return `<div class="md-linkchips-wrap">${head}<div class="md-linkchips">${chips}</div></div>`;
}

// ```stages → an illustrated "tree of stages". Synchronous render emits only a
// host (header + a sr-only fallback list); hydrateStagesBlocks (from
// $lib/stages) mounts the interactive <canvas> after the HTML lands. The full
// source rides in data-src (title line prepended when the fence carries one).
const STAGES_COPY_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="14" height="11" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M3 15l4-4 3 3 3-3 4 4"/></svg>' +
  '<svg class="md-stages-ok" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z" clip-rule="evenodd"/></svg>';
const STAGES_DETAIL_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 8V5a1 1 0 011-1h3M16 12v3a1 1 0 01-1 1h-3M12 4h3a1 1 0 011 1v3M8 16H5a1 1 0 01-1-1v-3"/></svg>';

function renderStages(content: string, fenceTitle: string, md: MarkdownIt): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const full = fenceTitle ? `${fenceTitle}\n${content}` : content;
  const data = parseStages(full);
  if (data.stages.length === 0) return "";
  const title = data.title || "Stages";
  const nS = data.stages.length;
  const nM = data.milestones;
  const meta = `${nS} stage${nS === 1 ? "" : "s"} · ${nM} milestone${nM === 1 ? "" : "s"}`;
  const bodyH = Math.min(820, Math.max(240, 60 + nM * 24 + nS * 20));
  // Screen-reader / no-canvas fallback: a plain nested list.
  const list = data.stages
    .map((s) => {
      const items = s.items
        .map(
          (it) =>
            `<li>${esc(it.name)}${it.w > 1 ? ` (×${it.w})` : ""}${it.desc ? `: ${esc(it.desc)}` : ""}</li>`,
        )
        .join("");
      return `<li>${esc(s.name)}<ol>${items}</ol></li>`;
    })
    .join("");
  return (
    `<div class="md-stages" data-src="${esc(full)}">` +
    `<div class="md-bhead"><span class="md-bhead-left">` +
    `<span class="md-bhead-title">${esc(title)}</span><span class="md-bhead-sub">Stages</span></span>` +
    `<span class="md-stages-head-right"><span class="md-bhead-meta">${esc(meta)}</span>` +
    `<button class="md-stages-btn md-stages-copy" type="button" title="Copy as image" aria-label="Copy as image">${STAGES_COPY_ICON}<span>Copy</span></button>` +
    `<button class="md-stages-btn md-stages-detail" type="button" title="Open detail view" aria-label="Open detail view">${STAGES_DETAIL_ICON}<span>Detail</span></button>` +
    `</span></div>` +
    `<div class="md-stages-body" style="height:${bodyH}px"><ol class="md-stages-a11y">${list}</ol></div>` +
    `</div>`
  );
}

// Minimal HTML escape for content built outside a markdown-it render pass.
function escHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

// ```board <id> → a placeholder for a READ-ONLY feedback-board embed. The real
// content (columns + cards) is fetched + filled in by hydrateBoardEmbeds (like
// mermaid), since a synchronous fence can't reach the store / IPC.
function renderBoardEmbed(idStr: string): string {
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return "";
  return withImgCopy(
    `<div class="md-board-embed" data-board="${id}"><div class="md-board-loading">Loading board…</div></div>`,
  );
}

// `{{board N}}` on its own line → the board embed placeholder. A core rule that
// replaces a paragraph consisting solely of the marker (the ```board <id> fence
// still works too). Kept simple: exact match, block-level only.
function addBoardEmbeds(md: MarkdownIt): void {
  md.core.ruler.push("board_embeds", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (
        tokens[i].type === "paragraph_open" &&
        tokens[i + 1].type === "inline" &&
        tokens[i + 2].type === "paragraph_close"
      ) {
        const m = /^\{\{\s*board[\s:]+(\d+)\s*\}\}$/i.exec(
          tokens[i + 1].content.trim(),
        );
        if (m) {
          const t = new state.Token("html_block", "", 0);
          t.content = renderBoardEmbed(m[1]);
          t.block = true;
          tokens.splice(i, 3, t);
        }
      }
    }
  });
}

// Build the read-only mini-kanban HTML for an embedded board.
function boardEmbedHtml(
  title: string,
  cols: FeedbackColumn[],
  cards: FeedbackCardSummary[],
): string {
  const byCol = new Map<number, FeedbackCardSummary[]>();
  for (const c of cards) {
    if (!byCol.has(c.columnId)) byCol.set(c.columnId, []);
    byCol.get(c.columnId)!.push(c);
  }
  const colsHtml = [...cols]
    .sort((a, b) => a.position - b.position)
    .map((col) => {
      const list = (byCol.get(col.id) ?? []).sort(
        (a, b) => a.position - b.position,
      );
      const cardsHtml =
        list
          .map((cd) => {
            const accent = cardAccent(cd.color);
            const style = accent ? ` style="border-left-color:${accent}"` : "";
            const cc = cd.commentCount
              ? `<span class="md-board-cc">${cd.commentCount}</span>`
              : "";
            const tags = (cd.tags ?? "")
              .split(/\s+/)
              .filter(Boolean)
              .map(
                (t) =>
                  `<span class="md-board-tag" style="--h:${tagHue(t)}">${escHtml(t)}</span>`,
              )
              .join("");
            return (
              `<div class="md-board-card"${style}>` +
              `<div class="md-board-card-row"><span class="md-board-card-t">${escHtml(cd.title)}</span>${cc}</div>` +
              (tags ? `<div class="md-board-tags">${tags}</div>` : "") +
              `</div>`
            );
          })
          .join("") || `<div class="md-board-empty">·</div>`;
      return (
        `<div class="md-board-col"><div class="md-board-col-h">${escHtml(col.name)}` +
        `<span class="md-board-col-n">${list.length}</span></div>` +
        `<div class="md-board-col-body">${cardsHtml}</div></div>`
      );
    })
    .join("");
  const head =
    `<div class="md-board-head"><span class="md-board-title">${escHtml(title)} <span class="md-board-open">↗</span></span>` +
    `<span class="md-board-meta">${cards.length} card${cards.length === 1 ? "" : "s"}</span></div>`;
  return `${head}<div class="md-board-cols">${colsHtml}</div>`;
}

// Fetch each embedded board (```board <id>) and fill its placeholder with the
// read-only mini-kanban. Guarded per placeholder (data-rendered) so the
// MutationObserver re-run doesn't refetch or loop on its own innerHTML write.
export async function hydrateBoardEmbeds(el: HTMLElement): Promise<void> {
  const nodes = Array.from(
    el.querySelectorAll<HTMLElement>(".md-board-embed[data-board]"),
  );
  for (const node of nodes) {
    const id = Number(node.dataset.board);
    if (!Number.isFinite(id) || node.dataset.rendered === String(id)) continue;
    node.dataset.rendered = String(id);
    try {
      const { listFeedbackBoards, listFeedbackColumns, listFeedbackCards } =
        await import("$lib/ipc");
      const [boards, cols, cards] = await Promise.all([
        listFeedbackBoards(true),
        listFeedbackColumns(id),
        listFeedbackCards(id),
      ]);
      const title = boards.find((b) => b.id === id)?.title ?? "Board";
      node.innerHTML = boardEmbedHtml(title, cols, cards);
    } catch {
      node.innerHTML = '<div class="md-board-err">Board unavailable</div>';
    }
  }
}

// ```chart renderer. Same `key: value` line shape as ```cards: `type` / `title`
// / `color` configure the chart, every other `Label: number` line is a data
// point (order preserved). Emits inline SVG synchronously — no dependency, no
// async hydration, crisp at any zoom, and works inside blueprint cards.
type ChartDatum = { label: string; value: number };

// Mid-tone categorical palette for donut SLICES (auto-assigned, not a user
// color choice — that vocabulary is NAMED_COLORS / NAMED_GRADIENTS below).
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

  // Bar/line accent: a solid color OR a gradient (needs an SVG def). Donut
  // keeps its own categorical palette.
  const { fill: accent, def: accentDef } = namedSvgFill(color || "blue");
  const titleH = title
    ? `<div class="md-chart-title">${esc(title)}</div>`
    : "";

  let body: string;
  if (type === "donut" || type === "pie") {
    body = renderDonutChart(data, esc);
  } else if (type === "line") {
    body = renderLineChart(data, accent, accentDef, esc);
  } else {
    body = renderBarChart(data, accent, accentDef, esc);
  }
  return `<div class="md-chart md-chart-${esc(type)}">${titleH}${body}</div>`;
}

function renderBarChart(
  data: ChartDatum[],
  accent: string,
  accentDef: string,
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
  return `<svg class="md-chart-svg" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${accentDef}${parts.join("")}</svg>`;
}

function renderLineChart(
  data: ChartDatum[],
  accent: string,
  accentDef: string,
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
  return `<svg class="md-chart-svg" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${accentDef}${parts.join("")}</svg>`;
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
// ── Shared color vocabulary for every customizable markdown element ──────────
// The SAME solid names + gradient names work across charts, marquee, progress,
// treemap (and, via CSS classes, ```cards). Solids are 600-level so white text
// reads on them; gradients match the ```cards gradient presets.
const NAMED_COLORS: Record<string, string> = {
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
const NAMED_GRADIENTS: Record<string, [string, string]> = {
  sunset: ["#f97316", "#ec4899"],
  ocean: ["#0ea5e9", "#14b8a6"],
  forest: ["#22c55e", "#14b8a6"],
  dusk: ["#8b5cf6", "#6366f1"],
  candy: ["#ec4899", "#a855f7"],
};
// True if a token is any recognized color/gradient name.
function isNamedFill(token: string): boolean {
  const t = token.toLowerCase();
  return t in NAMED_COLORS || t in NAMED_GRADIENTS;
}
// A CSS `background` value for HTML elements (marquee, progress).
function namedBackground(token: string, fallback = NAMED_COLORS.blue): string {
  const t = token.toLowerCase();
  if (NAMED_COLORS[t]) return NAMED_COLORS[t];
  const g = NAMED_GRADIENTS[t];
  if (g) return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
  return fallback;
}
// A fill for SVG elements (chart, treemap): a solid color, or a `url(#id)`
// paired with a <linearGradient> def to prepend into the SVG. Gradients can't
// be an SVG `fill` value directly, so each needs its own def.
let svgGradSeq = 0;
function namedSvgFill(token: string): { fill: string; def: string } {
  const t = token.toLowerCase();
  const g = NAMED_GRADIENTS[t];
  if (g) {
    const id = `mdgrad-${svgGradSeq++}`;
    return {
      fill: `url(#${id})`,
      def: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${g[0]}"/><stop offset="100%" stop-color="${g[1]}"/></linearGradient></defs>`,
    };
  }
  return { fill: NAMED_COLORS[t] ?? NAMED_COLORS.blue, def: "" };
}
const MARQUEE_SPEEDS = new Set(["slow", "normal", "fast"]);

function renderMarquee(
  source: string,
  mods: string[],
  md: MarkdownIt,
): string {
  const text = source.trim().replace(/\s+/g, " ");
  if (!text) return "";
  let bg = NAMED_COLORS.blue;
  let speed = "normal";
  for (const m of mods) {
    const lm = m.toLowerCase();
    if (isNamedFill(lm)) bg = namedBackground(lm);
    else if (MARQUEE_SPEEDS.has(lm)) speed = lm;
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

// ```lettering renderer. A big, centered display-type banner (Oswald) for
// announcements / memorable titles — distinct from headings by being centered
// and large. Each non-empty line becomes a centered line. An optional color or
// gradient (shared vocabulary) tints the text; a gradient becomes gradient text
// via background-clip. CSS-only, synchronous.
function renderLettering(
  source: string,
  mods: string[],
  md: MarkdownIt,
): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const html = lines.map((l) => esc(l)).join("<br>");

  let colorTok = "";
  for (const m of mods) {
    const lm = m.toLowerCase();
    if (isNamedFill(lm)) colorTok = lm;
  }
  let cls = "md-lettering";
  let style = "";
  if (colorTok && NAMED_GRADIENTS[colorTok]) {
    cls += " md-lettering-grad";
    style = ` style="background:${namedBackground(colorTok)}"`;
  } else if (colorTok && NAMED_COLORS[colorTok]) {
    style = ` style="color:${NAMED_COLORS[colorTok]}"`;
  }
  return `<div class="${cls}"${style}>${html}</div>`;
}

// ```progress renderer. One labeled bar per `Label: value` line. Value forms:
// `4/10` (fraction → its %), `60%`, or a bare `0–100`. An optional trailing
// named color/gradient word (see NAMED_COLORS/NAMED_GRADIENTS) sets the fill.
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

    // Split off an optional trailing color/gradient word; the rest is the value.
    let fill = NAMED_COLORS.blue;
    let valTok = "";
    for (const t of rest.split(/\s+/)) {
      if (isNamedFill(t)) fill = namedBackground(t);
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
    const barColor = done ? NAMED_COLORS.green : fill;

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
        `<div class="md-progress-fill" style="width:${pct.toFixed(1)}%;background:${barColor}">` +
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

// ```treemap renderer. A single-color squarified treemap — area ∝ value — for
// showing relative sizes inline (inspired by xray's LOC treemap, simplified to
// one flat color). One `Label: value` per line; area from the value. Options in
// the fence info string: a named color/gradient (default blue) + `animated`
// (pulse all cells). Per line, after the value: a named color/gradient recolors
// just that cell, `highlight` (or `accent`) gives it an AUTO distinct color, and
// `animated` pulses it. CSS-only, synchronous.
type TMData = {
  label?: string;
  value?: number;
  animated?: boolean;
  fill?: string; // resolved per-cell SVG fill (overrides the base color)
  children?: TMData[];
};

// Rotation of solid colors used to auto-assign distinct accents to `highlight`
// cells (skipping the treemap's base color so highlights always stand out).
const TM_AUTO_ORDER = [
  "amber",
  "red",
  "violet",
  "teal",
  "pink",
  "orange",
  "green",
  "blue",
  "gray",
];

function renderTreemap(
  source: string,
  mods: string[],
  md: MarkdownIt,
): string {
  const esc = (s: string) => md.utils.escapeHtml(s);
  let colorTok = "blue";
  let animateAll = false;
  for (const m of mods) {
    const lm = m.toLowerCase();
    if (isNamedFill(lm)) colorTok = lm;
    else if (lm === "animated") animateAll = true;
  }
  // A solid color or a gradient (via an SVG <defs>), shared with every element.
  // `defs` collects the base gradient def plus any per-cell gradient defs.
  const base = namedSvgFill(colorTok);
  const defs: string[] = base.def ? [base.def] : [];

  // Auto-accent cursor for `highlight` cells (skips the base color name).
  let autoIdx = 0;
  const nextAuto = (): string => {
    for (let k = 0; k < TM_AUTO_ORDER.length * 2; k++) {
      const name = TM_AUTO_ORDER[autoIdx++ % TM_AUTO_ORDER.length];
      if (name !== colorTok) return name;
    }
    return "amber";
  };

  const data: TMData[] = [];
  for (const line of source.split("\n")) {
    const m = /^\s*(.+?)\s*:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const rest = m[2];
    const num = /(-?\d+(?:\.\d+)?)/.exec(rest);
    if (!num) continue;
    const value = Number(num[1]);
    if (!Number.isFinite(value) || value <= 0) continue;

    // Per-cell flags after the value: an explicit color/gradient name, or a
    // `highlight`/`accent` flag (auto distinct color), and/or `animated`.
    let explicit: string | null = null;
    let highlight = false;
    let animated = animateAll;
    for (const t of rest.split(/\s+/)) {
      const lt = t.toLowerCase();
      if (isNamedFill(lt)) explicit = lt;
      else if (lt === "highlight" || lt === "accent") highlight = true;
      else if (lt === "animated") animated = true;
    }
    let cellFill = base.fill;
    const token = explicit ?? (highlight ? nextAuto() : null);
    if (token) {
      const r = namedSvgFill(token);
      cellFill = r.fill;
      if (r.def) defs.push(r.def);
    }

    data.push({ label: m[1].trim(), value, animated, fill: cellFill });
  }
  if (data.length === 0) return "";

  const W = 1000;
  const H = 600;
  const root = hierarchy<TMData>({ children: data })
    .sum((d) => d.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const rootRect = treemap<TMData>()
    .tile(treemapSquarify)
    .size([W, H])
    .paddingInner(6)
    .round(true)(root);

  const parts: string[] = [];
  for (const leaf of rootRect.leaves()) {
    const d = leaf.data;
    const x = leaf.x0;
    const y = leaf.y0;
    const bw = leaf.x1 - leaf.x0;
    const bh = leaf.y1 - leaf.y0;
    const label = d.label ?? "";

    parts.push(
      `<rect class="md-treemap-cell${d.animated ? " md-treemap-cell-anim" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="7" ry="7" fill="${d.fill ?? base.fill}"/>`,
    );

    // Fit the label to the cell (Oswald ≈ 0.55·fs per char); hide on tiny cells.
    let fs = Math.min(34, (bw - 16) / (Math.max(label.length, 1) * 0.55), bh * 0.42);
    if (bw > 40 && bh > 24 && fs >= 9) {
      const cx = x + bw / 2;
      const cy = y + bh / 2;
      const maxChars = Math.floor((bw - 12) / (fs * 0.55));
      const text =
        label.length > maxChars
          ? label.slice(0, Math.max(1, maxChars - 1)) + "…"
          : label;
      const subFs = Math.max(8, fs * 0.5);
      const showVal = bh > fs + subFs + 12 && bw > 46;
      if (showVal) {
        parts.push(
          `<text class="md-treemap-label" x="${cx.toFixed(1)}" y="${(cy - subFs * 0.3).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" fill="#fff">${esc(text)}</text>`,
          `<text class="md-treemap-val" x="${cx.toFixed(1)}" y="${(cy + fs * 0.75).toFixed(1)}" text-anchor="middle" font-size="${subFs.toFixed(1)}" fill="rgba(255,255,255,0.82)">${esc(fmtNum(d.value ?? 0))}</text>`,
        );
      } else {
        parts.push(
          `<text class="md-treemap-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${fs.toFixed(1)}" fill="#fff">${esc(text)}</text>`,
        );
      }
    }

    if (d.animated) {
      parts.push(
        `<rect class="md-treemap-pulse" x="${(x + 1.5).toFixed(1)}" y="${(y + 1.5).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${(bh - 3).toFixed(1)}" rx="6" ry="6"/>`,
      );
    }
  }
  return `<div class="md-treemap"><svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${defs.join("")}${parts.join("")}</svg></div>`;
}

// Install a single, document-wide delegated click handler for copy buttons.
// Delegation (vs. a per-button handler) survives the `{@html}` re-renders
// every markdown surface does. Capture phase + stopPropagation so the click
// doesn't also trip a surface's click-to-edit.
let codeCopyInstalled = false;
// Delegated copy for the inline-code badges (mirrors installCodeCopy). Reads the
// exact text from the badge's data-code and flips the button to a check briefly.
let inlineCopyInstalled = false;
function installInlineCopy(): void {
  if (inlineCopyInstalled || typeof document === "undefined") return;
  inlineCopyInstalled = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = (e.target as Element | null)?.closest?.(
        ".md-badge-copy",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const text = btn.closest(".md-badge")?.getAttribute("data-code") ?? "";
      if (!text) return;
      void navigator.clipboard.writeText(text).then(
        () => {
          btn.classList.add("md-copied");
          window.setTimeout(() => btn.classList.remove("md-copied"), 1200);
        },
        () => {
          /* clipboard denied — no-op */
        },
      );
    },
    true,
  );
}

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

// Delegated handler for the "copy as image" buttons on doc blocks. Rasterizes
// the parent `[data-md-block]` via html-to-image and copies a PNG — preferring
// the native Tauri clipboard (reliable in WKWebView), falling back to the web
// Clipboard API. html-to-image + the ipc are dynamic-imported so they don't
// weigh on markdown surfaces that never copy.
let blockImgCopyInstalled = false;
function installBlockImageCopy(): void {
  if (blockImgCopyInstalled || typeof document === "undefined") return;
  blockImgCopyInstalled = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = (e.target as Element | null)?.closest?.(
        ".md-img-copy",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const block = btn.closest("[data-md-block]") as HTMLElement | null;
      if (!block || btn.classList.contains("md-busy")) return;
      btn.classList.add("md-busy");
      // Force every opaque background inline so WKWebView's foreignObject
      // rasterizer captures the widget's OWN surface reliably (it otherwise
      // drops CSS backgrounds). Same colors → no visible flash; restored in
      // `finally`. This lets the surrounding PADDING stay white (below) while a
      // dark-themed widget still renders dark — so pasting into a light PR shows
      // a clean card on white instead of a big dark rectangle.
      const painted: { el: HTMLElement; prev: string }[] = [];
      // Zero the inner block's own vertical margin (each block type has a
      // different one) so every captured image has equal top/bottom padding.
      const innerBlock = block.firstElementChild as HTMLElement | null;
      const prevMargin = innerBlock?.style.margin ?? "";
      if (innerBlock) innerBlock.style.margin = "0";
      void (async () => {
        try {
          const { toBlob } = await import("html-to-image");
          block.querySelectorAll<HTMLElement>("*").forEach((el) => {
            if (el.classList.contains("md-img-copy")) return;
            const bg = getComputedStyle(el).backgroundColor;
            if (bg && !/,\s*0\s*\)/.test(bg) && bg !== "transparent") {
              painted.push({ el, prev: el.style.background });
              el.style.background = bg;
            }
          });
          // The padding blends into the (light) PR page. Padding is applied with
          // `content-box` + an oversized canvas (width/height include the pad)
          // so nothing clips.
          const surface = "#ffffff";
          const pad = 20;
          const w = block.offsetWidth;
          const h = block.offsetHeight;
          const opts = {
            pixelRatio: 2,
            width: w + pad * 2,
            height: h + pad * 2,
            backgroundColor: surface,
            style: {
              boxSizing: "content-box",
              width: `${w}px`,
              height: `${h}px`,
              padding: `${pad}px`,
              margin: "0",
              background: surface,
            },
            filter: (n: Node) =>
              !(n instanceof HTMLElement && n.classList.contains("md-img-copy")),
          };
          // Fonts must be loaded before rasterizing or the reflow truncates the
          // bottom; a throwaway warm-up pass works around a WebKit first-render
          // sizing bug (the second pass is the reliable one).
          await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
          await toBlob(block, opts).catch(() => null);
          const blob = await toBlob(block, opts);
          if (!blob) return;
          const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
          try {
            const { copyImageToClipboard } = await import("$lib/ipc");
            await copyImageToClipboard(bytes);
          } catch {
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob }),
            ]);
          }
          btn.classList.add("md-copied");
          window.setTimeout(() => btn.classList.remove("md-copied"), 1400);
        } catch {
          /* rasterize / clipboard failed — no-op */
        } finally {
          painted.forEach((p) => (p.el.style.background = p.prev));
          if (innerBlock) innerBlock.style.margin = prevMargin;
          btn.classList.remove("md-busy");
        }
      })();
    },
    true,
  );
}

// "Save as GIF" for a motion block. GENERAL multi-frame capture: we build a
// list of frame states (JS-driven, with the live CSS animation frozen via
// `.md-cap`), rasterize each with html-to-image, and encode a looping GIF.
// Handles the pulse ring (stats/spec/files), the tree text pulse, the flow
// marker + node highlight, the before/after crossfade, and the animated
// terminal reveal. Saved via the native dialog (browser fallback: a download) —
// clipboards can't carry animation, which is why this is a SAVE, not a copy.
let gifSaveInstalled = false;
function installGifSave(): void {
  if (gifSaveInstalled || typeof document === "undefined") return;
  gifSaveInstalled = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = (e.target as Element | null)?.closest?.(
        ".md-gif-save",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const block = btn.closest("[data-md-block]") as HTMLElement | null;
      if (!block || btn.classList.contains("md-busy")) return;
      btn.classList.add("md-busy");

      const painted: { el: HTMLElement; prev: string }[] = [];
      const touched: { el: HTMLElement; prop: string; prev: string }[] = [];
      const setS = (el: HTMLElement, prop: string, val: string) => {
        touched.push({ el, prop, prev: el.style.getPropertyValue(prop) });
        el.style.setProperty(prop, val);
      };
      const innerBlock = block.firstElementChild as HTMLElement | null;
      const prevMargin = innerBlock?.style.margin ?? "";

      void (async () => {
        try {
          const [{ toCanvas }, { GIFEncoder, quantize, applyPalette }] =
            await Promise.all([import("html-to-image"), import("gifenc")]);

          // ---- Build the frame plan for this block's motion type ----
          type Frame = { apply: () => void; delay: number };
          const frames: Frame[] = [];
          const hflow = block.querySelector<HTMLElement>(".md-ftrack");
          const vflow = block.querySelector<HTMLElement>(".md-vflow");
          const isFlow = !!(hflow || vflow);
          const isCompare = !!block.querySelector(".md-cmp-stage");
          const isTerm = !!block.querySelector(".md-term-anim");
          const pulses = Array.from(
            block.querySelectorAll<HTMLElement>(".md-pulse, .md-tpulse"),
          );

          let kind = "block";
          if (isFlow) {
            kind = "flow";
            // Match the live view: the marker GLIDES smoothly along the path
            // (no per-node ring). Interpolate the dot from the first node's
            // center to the last's over N frames, fading in/out at the ends.
            const nodes = Array.from(
              block.querySelectorAll<HTMLElement>(".md-fnode"),
            );
            const dot = block.querySelector<HTMLElement>(".md-fdot");
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const FR = 24;
            for (let i = 0; i < FR; i++) {
              const t = i / (FR - 1);
              frames.push({
                delay: 110,
                apply: () => {
                  if (!dot || !first || !last) return;
                  const op = t < 0.06 ? t / 0.06 : t > 0.94 ? (1 - t) / 0.06 : 1;
                  setS(dot, "opacity", op.toFixed(2));
                  // Light the node the marker is currently over (its "hover").
                  const idx = Math.round(t * (nodes.length - 1));
                  nodes.forEach((x, k) => x.classList.toggle("on", k === idx));
                  if (vflow) {
                    const y0 = first.offsetTop + first.offsetHeight / 2 - 6;
                    const y1 = last.offsetTop + last.offsetHeight / 2 - 6;
                    setS(dot, "top", `${(y0 + (y1 - y0) * t).toFixed(1)}px`);
                  } else {
                    const x0 = first.offsetLeft + first.offsetWidth / 2;
                    const x1 = last.offsetLeft + last.offsetWidth / 2;
                    setS(dot, "left", `${(x0 + (x1 - x0) * t).toFixed(1)}px`);
                  }
                },
              });
            }
          } else if (isCompare) {
            kind = "compare";
            const before = block.querySelector<HTMLElement>(".md-cmp-before");
            const after = block.querySelector<HTMLElement>(".md-cmp-after");
            const ba = (b: string, a: string) => {
              if (before) setS(before, "opacity", b);
              if (after) setS(after, "opacity", a);
            };
            frames.push({ delay: 1500, apply: () => ba("1", "0") });
            frames.push({ delay: 110, apply: () => ba("0.5", "0.5") });
            frames.push({ delay: 1500, apply: () => ba("0", "1") });
            frames.push({ delay: 110, apply: () => ba("0.5", "0.5") });
          } else if (isTerm) {
            kind = "terminal";
            const lines = Array.from(
              block.querySelectorAll<HTMLElement>(".md-term-line"),
            );
            lines.forEach((_, k) => {
              frames.push({
                delay: k === lines.length - 1 ? 1500 : 340,
                apply: () =>
                  lines.forEach((ln, j) =>
                    setS(ln, "opacity", j <= k ? "1" : "0"),
                  ),
              });
            });
          } else if (pulses.length) {
            const isTree = !!block.querySelector(".md-tree");
            kind = isTree ? "tree" : "pulse";
            const floor = isTree ? 0.62 : 0.35; // match the CSS breathe floor
            const FRAMES = 16;
            for (let i = 0; i < FRAMES; i++) {
              const op =
                floor +
                (1 - floor) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAMES));
              frames.push({
                delay: 70,
                apply: () => setS(block, "--capop", op.toFixed(3)),
              });
            }
          }
          if (frames.length === 0) return;

          // ---- Prep: inline opaque backgrounds, zero margin, freeze CSS ----
          block.querySelectorAll<HTMLElement>("*").forEach((el) => {
            if (
              el.classList.contains("md-img-copy") ||
              el.classList.contains("md-gif-save")
            )
              return;
            const bg = getComputedStyle(el).backgroundColor;
            if (bg && !/,\s*0\s*\)/.test(bg) && bg !== "transparent") {
              painted.push({ el, prev: el.style.background });
              el.style.background = bg;
            }
          });
          if (innerBlock) innerBlock.style.margin = "0";
          block.classList.add("md-cap");

          const pad = 20;
          const scale = 2;
          const w = block.offsetWidth;
          const h = block.offsetHeight;
          const opts = {
            pixelRatio: scale,
            width: w + pad * 2,
            height: h + pad * 2,
            backgroundColor: "#ffffff",
            style: {
              boxSizing: "content-box",
              width: `${w}px`,
              height: `${h}px`,
              padding: `${pad}px`,
              margin: "0",
              background: "#ffffff",
            },
            filter: (n: Node) =>
              !(
                n instanceof HTMLElement &&
                (n.classList.contains("md-img-copy") ||
                  n.classList.contains("md-gif-save"))
              ),
          };
          const raf = () =>
            new Promise<void>((r) =>
              requestAnimationFrame(() => requestAnimationFrame(() => r())),
            );

          await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
          frames[0].apply();
          await raf();
          await toCanvas(block, opts).catch(() => null); // WebKit warm-up

          const captured: { canvas: HTMLCanvasElement; delay: number }[] = [];
          for (const f of frames) {
            f.apply();
            await raf();
            const c = await toCanvas(block, opts);
            if (c) captured.push({ canvas: c, delay: f.delay });
          }
          if (captured.length === 0) return;

          const cw = captured[0].canvas.width;
          const ch = captured[0].canvas.height;
          const tmp = document.createElement("canvas");
          tmp.width = cw;
          tmp.height = ch;
          const tctx = tmp.getContext("2d");
          if (!tctx) return;
          const gif = GIFEncoder();
          captured.forEach((fr, i) => {
            tctx.clearRect(0, 0, cw, ch);
            tctx.drawImage(fr.canvas, 0, 0);
            const { data } = tctx.getImageData(0, 0, cw, ch);
            const palette = quantize(data, 256);
            const index = applyPalette(data, palette);
            gif.writeFrame(index, cw, ch, {
              palette,
              delay: fr.delay,
              ...(i === 0 ? { repeat: 0 } : {}), // loop forever
            });
          });
          gif.finish();
          const bytes = gif.bytes();

          try {
            const [{ save }, { saveBinaryFile }] = await Promise.all([
              import("@tauri-apps/plugin-dialog"),
              import("$lib/ipc"),
            ]);
            const path = await save({
              defaultPath: `${kind}.gif`,
              filters: [{ name: "GIF", extensions: ["gif"] }],
            });
            if (path) await saveBinaryFile(path, Array.from(bytes));
          } catch {
            const url = URL.createObjectURL(
              new Blob([bytes], { type: "image/gif" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `${kind}.gif`;
            a.click();
            URL.revokeObjectURL(url);
          }
          btn.classList.add("md-copied");
          window.setTimeout(() => btn.classList.remove("md-copied"), 1400);
        } catch {
          /* rasterize / encode / save failed — no-op */
        } finally {
          block.classList.remove("md-cap");
          block
            .querySelectorAll(".md-fnode.on")
            .forEach((n) => n.classList.remove("on"));
          painted.forEach((p) => (p.el.style.background = p.prev));
          // Restore inline styles in REVERSE so the earliest recorded value wins.
          for (let i = touched.length - 1; i >= 0; i--) {
            const t = touched[i];
            if (t.prev) t.el.style.setProperty(t.prop, t.prev);
            else t.el.style.removeProperty(t.prop);
          }
          if (innerBlock) innerBlock.style.margin = prevMargin;
          btn.classList.remove("md-busy");
        }
      })();
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

// `:name:` inline icon shortcode. Consumes the token only when `name` resolves
// to a known icon (so `10:30`, URLs, and stray colons pass through untouched).
function addIconShortcodes(md: MarkdownIt): void {
  const RE = /^:([a-z0-9][a-z0-9-]*):/i;
  md.inline.ruler.before("emphasis", "story_icon", (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x3a /* : */) return false;
    const m = RE.exec(state.src.slice(state.pos));
    if (!m) return false;
    const icon = iconByShortcode(m[1]);
    if (!icon) return false;
    if (!silent) {
      const token = state.push("story_icon", "", 0);
      token.meta = { icon };
    }
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules.story_icon = (tokens, idx) => {
    const icon = (tokens[idx].meta as { icon: ReturnType<typeof iconByShortcode> })
      .icon!;
    return `<span class="md-icon md-icon-${icon.kind}" title="${md.utils.escapeHtml(icon.label)}">${iconInlineSvg(icon)}</span>`;
  };
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
    const ico = CALLOUT_ICON[cls] ?? "";
    return `${open}<div class="callout-label"><span class="callout-ico">${ico}</span>${CALLOUT_LABEL[cls] ?? cls}</div>`;
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
