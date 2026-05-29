// Lazy wrapper around Mermaid. The library is chunky, so it's dynamic-imported
// on first use and kept out of the initial bundle. Used by inline ```mermaid
// fences in note/article markdown (see $lib/markdownit.ts).

type MermaidApi = typeof import("mermaid")["default"];

let mermaidPromise: Promise<MermaidApi> | null = null;
let initializedTheme: "dark" | "default" | null = null;
let renderSeq = 0;

async function getMermaid(theme: "dark" | "default"): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  // initialize() merges config; re-run only when the theme actually changes.
  if (initializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "strict",
    });
    initializedTheme = theme;
  }
  return mermaid;
}

// Render Mermaid source to an SVG string. Throws on invalid syntax — callers
// catch and surface the message (and typically keep the last good render).
export async function renderMermaid(
  source: string,
  theme: "dark" | "default",
): Promise<string> {
  const mermaid = await getMermaid(theme);
  const id = `mmd-${Date.now()}-${renderSeq++}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}
