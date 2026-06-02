// `#tag` badges for board and card titles. Tags are extracted from the title;
// the remaining text is shown normally and each tag renders as a small pill,
// colored deterministically from the tag text (same tag → same color).

const TAG_RE = /#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

export function parseTags(raw: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = raw
    .replace(TAG_RE, (_m, t: string) => {
      tags.push(t);
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text: text || raw.trim(), tags };
}

// Stable hue (0–359) from a tag's lowercased text.
export function tagHue(tag: string): number {
  const s = tag.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
