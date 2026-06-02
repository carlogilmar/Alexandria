// Deterministic flat geometric / Bauhaus card artwork. Same seed → same art.
// Returns an SVG string (inject with {@html}); ids are namespaced by `uid` so
// many cards can render on one page without clashing.

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

export type CardArtOpts = {
  seed: string; // card title (or id as string)
  hue: number; // dominant hue 0–359
  uid: string | number; // unique per card → namespaced ids
  muted?: boolean; // low saturation (the "gray" theme)
};

export function cardArtSvg({ seed, hue, uid, muted = false }: CardArtOpts): string {
  const r = rng(hashStr(seed));
  const W = 260;
  const H = 224;
  const pal = [hue, (hue + 40) % 360, (hue + 200) % 360];
  const baseSat = muted ? 18 : 62;
  const C = (p: number, s: number, l: number, a = 1) =>
    `hsl(${pal[p % 3]} ${muted ? Math.min(s, 24) : s}% ${l}% / ${a})`;
  const bg = `hsl(${hue} ${muted ? 14 : 30}% 93%)`;
  const pick = <T>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const P: string[] = [];

  // 1 bold disc, partly cropped at an edge.
  P.push(
    `<circle cx="${pick([30, 40, 225, 230])}" cy="${pick([40, 190])}" r="${(70 + r() * 35) | 0}" fill="${C(0, baseSat, 55, 0.92)}"/>`,
  );
  // 1 concentric ring.
  {
    const cx = (70 + r() * 140) | 0;
    const cy = (40 + r() * 150) | 0;
    P.push(
      `<circle cx="${cx}" cy="${cy}" r="${(34 + r() * 22) | 0}" fill="none" stroke="${C(2, baseSat, 42)}" stroke-width="${(7 + r() * 7) | 0}"/>`,
    );
  }
  // 1 triangle.
  {
    const x = (20 + r() * 180) | 0;
    const y = (120 + r() * 80) | 0;
    const s = (55 + r() * 45) | 0;
    P.push(
      `<path d="M${x} ${y} L${x + s} ${y} L${x + s / 2} ${y - s} Z" fill="${C(1, baseSat + 8, 55, 0.92)}"/>`,
    );
  }
  // 1 corner quarter-circle wedge.
  {
    const cor = pick([
      [0, 0, 1, 1],
      [W, 0, -1, 1],
      [0, H, 1, -1],
      [W, H, -1, -1],
    ]);
    const rr = (60 + r() * 40) | 0;
    P.push(
      `<path d="M${cor[0]} ${cor[1]} h${cor[2] * rr} a${rr} ${rr} 0 0 1 ${-cor[2] * rr} ${cor[3] * rr} Z" fill="${C(2, baseSat - 15, 60, 0.85)}"/>`,
    );
  }
  // 2 thin parallel lines.
  {
    const y = (40 + r() * 150) | 0;
    const a = (r() * 30 - 15) | 0;
    for (let k = 0; k < 2; k++)
      P.push(
        `<line x1="0" y1="${y + k * 10}" x2="${W}" y2="${y + k * 10 + a}" stroke="${C(2, muted ? 18 : 30, 35, 0.45)}" stroke-width="2.5"/>`,
      );
  }
  // a few accent dots.
  for (let k = 0; k < 4; k++)
    P.push(
      `<circle cx="${(r() * W) | 0}" cy="${(r() * H) | 0}" r="${(3 + r() * 4) | 0}" fill="${C(k, baseSat + 10, 46)}"/>`,
    );

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="h-full w-full">
    <defs><clipPath id="fc${uid}"><rect width="${W}" height="${H}"/></clipPath></defs>
    <g clip-path="url(#fc${uid})"><rect width="${W}" height="${H}" fill="${bg}"/>${P.join("")}</g>
  </svg>`;
}
