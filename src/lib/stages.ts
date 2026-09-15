// The ```stages block (Sprint 68) — an illustrated "tree of stages": ordered
// strata (bracket-free bands) with milestones as magnitude-sized bubbles that
// cluster at each stage's centre and gently jostle (a hand-rolled physics loop,
// like the sidebar canvas fx). Inspired by Haeckel's Pedigree of Man.
//
// markdownit.ts renders a placeholder host (header + a sr-only fallback list);
// hydrateStagesBlocks mounts a <canvas> + this sim after the HTML lands (the
// same hydrate-after-render pattern as mermaid / board embeds). Interactions:
// hover a bubble → its description; drag a bubble; click a stage → focus it.

const SERIF = 'ui-serif, "Iowan Old Style", Palatino, Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const STAGE_COLORS = [
  "#c65a3a", "#3f8f5f", "#3f6fb0", "#8a5cae", "#c99a3a", "#2c8f8a", "#b0417a",
];

export type StageItem = { name: string; w: number; desc: string };
export type Stage = {
  name: string;
  col: string;
  items: StageItem[];
  count: number;
  mag: number;
};
export type StagesData = {
  title: string;
  stages: Stage[];
  milestones: number;
};

// Parse `Title` / `# Stage` / `- Milestone *N: description`.
export function parseStages(src: string): StagesData {
  const lines = src.split("\n");
  let title = "";
  const stages: Stage[] = [];
  let cur: Stage | null = null;
  let started = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith("#")) {
      cur = {
        name: l.replace(/^#+/, "").trim(),
        col: STAGE_COLORS[stages.length % STAGE_COLORS.length],
        items: [],
        count: 0,
        mag: 0,
      };
      stages.push(cur);
      started = true;
    } else if (l.startsWith("-") || l.startsWith("*")) {
      if (!cur) continue;
      let t = l.slice(1).trim();
      const ci = t.indexOf(":");
      let desc = "";
      if (ci >= 0) {
        desc = t.slice(ci + 1).trim();
        t = t.slice(0, ci).trim();
      }
      let w = 1;
      const mm = /\*(\d+)\s*$/.exec(t);
      if (mm) {
        w = Math.max(1, Math.min(9, parseInt(mm[1], 10)));
        t = t.replace(/\*(\d+)\s*$/, "").trim();
      }
      if (t) cur.items.push({ name: t, w, desc });
    } else if (!started && !title) {
      title = l;
    }
  }
  for (const s of stages) {
    s.count = s.items.length;
    s.mag = s.items.reduce((a, it) => a + it.w, 0);
  }
  const milestones = stages.reduce((a, s) => a + s.count, 0);
  return { title, stages, milestones };
}

function radius(w: number): number {
  return 15 + w * 5;
}
function rgb(hex: string): [number, number, number] {
  const m = /#(..)(..)(..)/.exec(hex);
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [128, 128, 128];
}
function darken(hex: string, a: number): string {
  const c = rgb(hex);
  return `rgb(${Math.max(0, c[0] - a)},${Math.max(0, c[1] - a)},${Math.max(0, c[2] - a)})`;
}
// A color (hex or `rgb(...)`) at a given alpha.
function toRgba(color: string, a: number): string {
  if (color[0] === "#") {
    const c = rgb(color);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  const m = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : color;
}
function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type Bubble = {
  key: string; name: string; desc: string; w: number; r: number;
  col: string; stage: SBand; x: number; y: number; vx: number; vy: number;
};
type SBand = Stage & { yTop: number; yBot: number; cy: number; weight: number };

export interface StagesSim {
  exportPNG(btn?: HTMLElement | null): Promise<void>;
  destroy(): void;
}

// Mount the interactive canvas onto `canvas`. `tip` is a floating tooltip
// element (appended to <body> by the caller). Self-terminates when the canvas
// leaves the DOM (a note re-render replaces the host), and destroy() tears down.
export function mountStages(
  canvas: HTMLCanvasElement,
  tip: HTMLElement,
  data: StagesData,
): StagesSim {
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduce =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cvar = (n: string, fallback: string) =>
    getComputedStyle(canvas).getPropertyValue(n).trim() || fallback;
  const PLATE = () => cvar("--st-plate", "#faf7f1");
  const INK = () => cvar("--st-ink", "#3f3a30");
  const MUTED = () => cvar("--st-muted", "#8a8172");

  let W = 0, H = 0;
  const mT = 22, mB = 20, foL = 16;
  let foR = 0, cx = 0;
  const stages = data.stages.map((s) => ({ ...s })) as SBand[];
  let bubbles: Bubble[] = [];
  let selected: SBand | null = null;

  function layout() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    if (!W || !H) return;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    foR = W - 16; cx = (foL + foR) / 2;
    const Hpx = H - mT - mB;
    for (const s of stages)
      s.weight = s.items.reduce((a, it) => a + 2 * radius(it.w), 0) + 30;
    const sum = stages.reduce((a, s) => a + s.weight, 0) || 1;
    let cursor = H - mB;
    for (const s of stages) {
      const h = (s.weight / sum) * Hpx;
      s.yBot = cursor; s.yTop = cursor - h; s.cy = (s.yTop + s.yBot) / 2;
      cursor = s.yTop;
    }
    const old: Record<string, Bubble> = {};
    for (const b of bubbles) old[b.key] = b;
    bubbles = [];
    stages.forEach((s, si) => {
      s.items.forEach((it, ii) => {
        const key = si + ":" + ii;
        const o = old[key];
        bubbles.push({
          key, name: it.name, desc: it.desc, w: it.w, r: radius(it.w),
          col: s.col, stage: s,
          x: o ? o.x : cx + (Math.random() - 0.5) * 50,
          y: o ? o.y : s.cy + (Math.random() - 0.5) * 30,
          vx: 0, vy: 0,
        });
      });
    });
  }

  const ro =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(layout) : null;
  ro?.observe(canvas);

  // interaction
  type Drag = { b: Bubble; offx: number; offy: number; px: number; py: number; vx: number; vy: number };
  let drag: Drag | null = null;
  const cur = { x: 0, y: 0, in: false };
  let client = { x: 0, y: 0 };
  let hovered: Bubble | null = null;
  let downP: { x: number; y: number } | null = null;
  let moved = false;
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const stageAt = (y: number) =>
    stages.find((s) => y >= s.yTop && y <= s.yBot) ?? null;
  const onDown = (e: PointerEvent) => {
    const p = pos(e); downP = p; moved = false;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const bb = bubbles[i];
      if (Math.hypot(p.x - bb.x, p.y - bb.y) < bb.r) {
        drag = { b: bb, offx: p.x - bb.x, offy: p.y - bb.y, px: p.x, py: p.y, vx: 0, vy: 0 };
        canvas.style.cursor = "grabbing";
        canvas.setPointerCapture(e.pointerId);
        break;
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = pos(e);
    cur.x = p.x; cur.y = p.y; cur.in = true;
    client = { x: e.clientX, y: e.clientY };
    if (downP && Math.hypot(p.x - downP.x, p.y - downP.y) > 4) moved = true;
    if (drag) {
      drag.vx = p.x - drag.px; drag.vy = p.y - drag.py;
      drag.px = p.x; drag.py = p.y;
      drag.b.x = p.x - drag.offx; drag.b.y = p.y - drag.offy;
    }
  };
  const onUp = () => {
    if (!moved && downP) {
      const st = stageAt(downP.y);
      selected = selected === st ? null : st;
    }
    if (drag) { drag.b.vx = drag.vx * 0.7; drag.b.vy = drag.vy * 0.7; drag = null; canvas.style.cursor = "grab"; }
    downP = null;
  };
  const onLeave = () => { cur.in = false; };
  // Hover tracking via mousemove too — a belt-and-suspenders fallback in case
  // pointermove is swallowed; mouse hover is a mouse concept and this always
  // fires for a real mouse. Keeps `cur` fresh so the per-bubble hover works.
  const onHoverMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    cur.x = e.clientX - r.left; cur.y = e.clientY - r.top; cur.in = true;
    client = { x: e.clientX, y: e.clientY };
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("mousemove", onHoverMove);
  canvas.addEventListener("mouseleave", onLeave);

  // The physics tick (bubble motion). Skipped under reduce-motion so the bubbles
  // stay still — but hover/select/drag detection + redraw still run every frame.
  function physics() {
    for (const b of bubbles) {
      if (drag && drag.b === b) continue;
      b.vx += (cx - b.x) * 0.006; b.vy += (b.stage.cy - b.y) * 0.01;
      b.vx += (Math.random() - 0.5) * 0.1; b.vy += (Math.random() - 0.5) * 0.1;
      b.vx *= 0.9; b.vy *= 0.9;
      // Steady the hovered bubble so it doesn't slip out from under the cursor.
      if (hovered === b) { b.vx *= 0.35; b.vy *= 0.35; }
    }
    for (let i = 0; i < bubbles.length; i++)
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], c = bubbles[j];
        if (a.stage !== c.stage) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + c.r + 2;
        if (d < min) {
          const o = min - d, nx = dx / d, ny = dy / d;
          const ad = drag && drag.b === a, cd = drag && drag.b === c;
          if (ad) { c.x += nx * o; c.y += ny * o; }
          else if (cd) { a.x -= nx * o; a.y -= ny * o; }
          else { a.x -= (nx * o) / 2; a.y -= (ny * o) / 2; c.x += (nx * o) / 2; c.y += (ny * o) / 2; a.vx -= nx * 0.2; a.vy -= ny * 0.2; c.vx += nx * 0.2; c.vy += ny * 0.2; }
        }
      }
    for (const b of bubbles) {
      if (drag && drag.b === b) continue;
      b.x += b.vx; b.y += b.vy;
      if (b.x < foL + b.r) { b.x = foL + b.r; b.vx *= -0.4; }
      if (b.x > foR - b.r) { b.x = foR - b.r; b.vx *= -0.4; }
      if (b.y < b.stage.yTop + b.r) { b.y = b.stage.yTop + b.r; b.vy *= -0.4; }
      if (b.y > b.stage.yBot - b.r) { b.y = b.stage.yBot - b.r; b.vy *= -0.4; }
    }
  }
  function step() {
    if (!reduce) physics();
    // Hover detection runs EVERY frame (even under reduce-motion) so pointing at
    // a bubble always isolates it.
    hovered = null;
    if (cur.in && !drag) {
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (Math.hypot(cur.x - b.x, cur.y - b.y) < b.r) { hovered = b; break; }
      }
    }
  }

  function fitLabel(name: string, r: number) {
    let fs = Math.max(8, Math.min(13, r * 0.5));
    ctx.font = `600 ${fs}px ${SANS}`;
    while (ctx.measureText(name).width > r * 1.7 && fs > 7) {
      fs -= 0.5; ctx.font = `600 ${fs}px ${SANS}`;
    }
    let txt = name;
    if (ctx.measureText(txt).width > r * 1.7) {
      while (txt.length > 1 && ctx.measureText(txt + "…").width > r * 1.7)
        txt = txt.slice(0, -1);
      txt += "…";
    }
    return { txt, fs };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const plate = PLATE(), ink = INK(), muted = MUTED();
    for (const s of stages) {
      const sel = selected === s, h = s.yBot - s.yTop;
      ctx.fillStyle = s.col;
      ctx.globalAlpha = sel ? 0.13 : selected ? 0.03 : 0.05;
      ctx.fillRect(foL, s.yTop, foR - foL, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.14; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(foL, s.yTop); ctx.lineTo(foR, s.yTop); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = s.col; ctx.fillRect(foL, s.yTop + 3, sel ? 5 : 3, h - 6);
      if (sel) {
        ctx.strokeStyle = s.col; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
        rr(ctx, foL + 0.5, s.yTop + 0.5, foR - foL - 1, h - 1, 8); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const ty = s.yTop + 15;
      ctx.font = `700 12px ${SERIF}`;
      const name = s.name.toUpperCase(), tw = ctx.measureText(name).width;
      ctx.globalAlpha = sel ? 1 : 0.82; ctx.fillStyle = sel ? s.col : plate;
      rr(ctx, foL + 8, ty - 11, tw + 12, 17, 5); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = sel ? "#fff" : s.col; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(name, foL + 14, ty - 1);
      const sm = `${s.count} · Σ${s.mag}`;
      ctx.font = `600 11px ${SANS}`;
      const sw = ctx.measureText(sm).width;
      ctx.globalAlpha = 0.82; ctx.fillStyle = plate;
      rr(ctx, foR - sw - 16, ty - 11, sw + 12, 17, 5); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(sm, foR - 10, ty - 1);
    }
    // A bubble is EMPHASIZED when it's the hovered one (or, with no hover, in the
    // selected stage). Everything else becomes a muted GRAY GHOST — a clearly
    // different style, not just a dimmer version of the same bubble.
    for (const b of bubbles) {
      const isHover = hovered === b;
      const emph = hovered ? isHover : selected ? b.stage === selected : true;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832);
      if (emph) {
        ctx.fillStyle = b.col; ctx.fill();
        ctx.lineWidth = isHover ? 2.5 : selected === b.stage ? 1.6 : 1;
        ctx.strokeStyle = isHover ? "#ffffff" : darken(b.col, 35);
        ctx.stroke();
        const fl = fitLabel(b.name, b.r);
        ctx.font = `600 ${fl.fs}px ${SANS}`;
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = 2;
        ctx.fillText(fl.txt, b.x, b.y); ctx.shadowBlur = 0;
      } else {
        // Ghost: faint gray fill + gray ring + gray label — colour drained.
        ctx.fillStyle = toRgba(muted, 0.16); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = toRgba(muted, 0.5); ctx.stroke();
        const fl = fitLabel(b.name, b.r);
        ctx.font = `600 ${fl.fs}px ${SANS}`;
        ctx.fillStyle = toRgba(muted, 0.85); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(fl.txt, b.x, b.y);
      }
      ctx.globalAlpha = 1;
    }
    // tooltip (fixed, follows the cursor)
    if (hovered) {
      tip.innerHTML =
        `<b>${escText(hovered.name)}${hovered.w > 1 ? ` <span class="md-stages-tmag">×${hovered.w}</span>` : ""}</b>` +
        (hovered.desc ? escText(hovered.desc) : '<span class="md-stages-nod">no description</span>');
      tip.classList.remove("md-stages-hide");
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let lx = client.x + 14, ly = client.y + 14;
      if (lx + tw > window.innerWidth - 6) lx = client.x - tw - 14;
      if (ly + th > window.innerHeight - 6) ly = client.y - th - 14;
      tip.style.left = Math.max(6, lx) + "px";
      tip.style.top = Math.max(6, ly) + "px";
    } else {
      tip.classList.add("md-stages-hide");
    }
  }

  let raf = 0;
  let alive = true;
  function frame() {
    if (!alive) return;
    if (!canvas.isConnected) { cleanup(); return; }
    // Retry layout until the canvas has a real size. The detail modal's canvas
    // (position:absolute inset:0 inside a flex:1 body) isn't measurable at the
    // synchronous mount, and the ResizeObserver doesn't reliably fire for that
    // indirect flex sizing in WKWebView — so without this the modal stays empty.
    if (!W || !H) {
      layout();
      // Under reduce-motion the physics tick is off, so a late layout would leave
      // a random scatter — settle the pack once here (as the init burst does).
      if ((W || H) && reduce) for (let k = 0; k < 260; k++) physics();
    }
    step(); // physics is gated on reduce inside; hover/redraw always run
    draw();
    raf = requestAnimationFrame(frame);
  }
  function cleanup() {
    alive = false;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("mousemove", onHoverMove);
    canvas.removeEventListener("mouseleave", onLeave);
    tip.remove();
  }

  layout();
  // Under reduce-motion, settle the pack first (so it's not a random scatter),
  // then run the loop — physics stays off, but hover/select/drag redraw.
  if (reduce) for (let k = 0; k < 260; k++) physics();
  raf = requestAnimationFrame(frame);

  async function exportPNG(btn?: HTMLElement | null) {
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width; tmp.height = canvas.height;
    const t = tmp.getContext("2d")!;
    t.fillStyle = PLATE(); t.fillRect(0, 0, tmp.width, tmp.height);
    t.drawImage(canvas, 0, 0);
    const blob: Blob | null = await new Promise((res) => tmp.toBlob(res, "image/png"));
    if (!blob) return;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const { copyImageToClipboard } = await import("$lib/ipc");
      await copyImageToClipboard(Array.from(bytes));
    } catch {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } catch {
        /* clipboard unavailable */
      }
    }
    if (btn) { btn.classList.add("md-copied"); window.setTimeout(() => btn.classList.remove("md-copied"), 1400); }
  }

  return { exportPNG, destroy: cleanup };
}

function escText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}

// A floating tooltip element on <body>, shared per sim.
function makeTip(): HTMLElement {
  const t = document.createElement("div");
  t.className = "md-stages-tip md-stages-hide";
  document.body.appendChild(t);
  return t;
}

// Detail overlay: a large modal with a second sim over the same data.
function openStagesDetail(data: StagesData): void {
  const overlay = document.createElement("div");
  overlay.className = "md-stages-modal";
  overlay.innerHTML =
    `<div class="md-stages-modal-inner"><div class="md-stages-modal-head">` +
    `<span class="md-stages-modal-title">${escText(data.title || "Stages")} — detail</span>` +
    `<button class="md-stages-modal-close" aria-label="Close">✕</button></div>` +
    `<div class="md-stages-modal-body"></div></div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector(".md-stages-modal-body") as HTMLElement;
  const cv = document.createElement("canvas");
  cv.className = "md-stages-canvas";
  body.appendChild(cv);
  const sim = mountStages(cv, makeTip(), data);
  const close = () => { sim.destroy(); overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  overlay.querySelector(".md-stages-modal-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
}

// Mount the canvas + wire the header buttons for every un-hydrated ```stages
// host. Called after each markdown render (see MarkdownEditor's hydrate effect);
// guarded by data-rendered so it doesn't re-mount. Old canvases self-terminate
// when the re-render detaches them.
export function hydrateStagesBlocks(root: HTMLElement): void {
  const hosts = root.querySelectorAll<HTMLElement>(".md-stages:not([data-rendered])");
  hosts.forEach((host) => {
    host.setAttribute("data-rendered", "1");
    const src = host.getAttribute("data-src") ?? "";
    const data = parseStages(src);
    const bodyEl = host.querySelector(".md-stages-body") as HTMLElement | null;
    if (!bodyEl) return;
    // Belt-and-suspenders: never leave a stray second canvas drawing undimmed
    // bubbles behind the live one.
    bodyEl.querySelectorAll("canvas").forEach((c) => c.remove());
    const canvas = document.createElement("canvas");
    canvas.className = "md-stages-canvas";
    bodyEl.insertBefore(canvas, bodyEl.firstChild);
    const sim = mountStages(canvas, makeTip(), data);
    host.querySelector(".md-stages-copy")?.addEventListener("click", (e) => {
      e.stopPropagation(); e.preventDefault();
      void sim.exportPNG(e.currentTarget as HTMLElement);
    });
    host.querySelector(".md-stages-detail")?.addEventListener("click", (e) => {
      e.stopPropagation(); e.preventDefault();
      openStagesDetail(data);
    });
  });
}
