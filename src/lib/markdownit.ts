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
    return defaultFence(tokens, idx, opts, env, self);
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

  return md;
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
