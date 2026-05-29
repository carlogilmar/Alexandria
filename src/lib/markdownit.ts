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

  return md;
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
