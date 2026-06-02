// Shared markdown-it configuration for every markdown surface (notes,
// articles). Centralizing it means the link behavior and the inline
// ```mermaid fence support live in one place instead of being copy-pasted
// into each editor.

import MarkdownIt from "markdown-it";
import { renderMermaid } from "$lib/mermaid";

// One configured instance shape, used by every markdown surface.
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
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

  return md;
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
