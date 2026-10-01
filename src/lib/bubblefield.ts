// A full-width "task field" — a hand-rolled canvas physics sim (same family as
// $lib/stages.ts): every task is a bubble sized by tracked time, colored by
// status using the theme accent, drifting/colliding gently, with hover tooltip,
// drag, and click-to-open. No chart lib; CSP/offline-clean; reduced-motion safe.
import type { TodoStatus } from "$lib/ipc";

export type BubbleTask = {
  id: number;
  text: string;
  status: TodoStatus;
  workSeconds: number;
};

type Opts = { onOpen: (id: number) => void; tipHtml: (t: BubbleTask) => string };
export type BubbleField = { destroy: () => void; zoomBy: (f: number) => void; reset: () => void };

type RGB = { r: number; g: number; b: number };
function parseColor(s: string): RGB {
  s = s.trim();
  if (s[0] === "#") {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = s.match(/[\d.]+/g);
  if (m && m.length >= 3) return { r: +m[0], g: +m[1], b: +m[2] };
  return { r: 79, g: 70, b: 229 };
}
const rgba = (c: RGB, a: number) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});
const WHITE: RGB = { r: 255, g: 255, b: 255 };

export function mountBubbleField(
  canvas: HTMLCanvasElement,
  tasks: BubbleTask[],
  opts: Opts,
): BubbleField {
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduce =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Resolve --accent to rgb() via the browser (it may be hex, rgb OR hsl — parsing
  // the raw token directly would misread hsl numbers as rgb and turn accent red).
  const prevColor = canvas.style.color;
  canvas.style.color = "var(--accent, #4f46e5)";
  const accent = parseColor(getComputedStyle(canvas).color);
  canvas.style.color = prevColor;
  const wipFill = mix(accent, WHITE, 0.42); // a lighter accent shade
  const dark = document.documentElement.classList.contains("dark");
  const muted: RGB = dark ? { r: 107, g: 116, b: 128 } : { r: 148, g: 156, b: 171 };
  const ink: RGB = dark ? { r: 231, g: 236, b: 243 } : { r: 31, g: 36, b: 48 };
  const openFill = dark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.03)";

  const maxWork = Math.max(1, ...tasks.map((t) => t.workSeconds));
  const R0 = 15, RMAX = 54;
  const radius = (t: BubbleTask) =>
    t.workSeconds <= 0
      ? R0
      : Math.max(R0, R0 + (Math.sqrt(t.workSeconds) / Math.sqrt(maxWork)) * (RMAX - R0));

  type B = { t: BubbleTask; r: number; x: number; y: number; vx: number; vy: number };
  let W = 0, H = 0, bubbles: B[] = [];
  // Camera (zoom + pan). World coords are the [0,W]×[0,H] physics space.
  let scale = 1, panX = 0, panY = 0;
  const clampScale = (s: number) => Math.min(4, Math.max(1, s));
  function clampPan() {
    panX = Math.min(0, Math.max(W * (1 - scale), panX));
    panY = Math.min(0, Math.max(H * (1 - scale), panY));
  }
  function layout() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const old: Record<number, B> = {};
    for (const b of bubbles) old[b.t.id] = b;
    bubbles = tasks.map((t) => {
      const o = old[t.id], rr = radius(t);
      return {
        t, r: rr,
        x: o ? o.x : R0 + Math.random() * Math.max(1, W - 2 * R0),
        y: o ? o.y : R0 + Math.random() * Math.max(1, H - 2 * R0),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
      };
    });
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(layout) : null;
  ro?.observe(canvas);

  // tooltip (reuses the stages tooltip styling on <body>)
  const tip = document.createElement("div");
  tip.className = "md-stages-tip md-stages-hide";
  document.body.appendChild(tip);

  // interaction
  type Drag = { b: B; ox: number; oy: number; px: number; py: number; vx: number; vy: number };
  let drag: Drag | null = null, downP: { x: number; y: number } | null = null, moved = false;
  let panning: { sx: number; sy: number; px: number; py: number } | null = null;
  const cur = { x: 0, y: 0, in: false };
  let client = { x: 0, y: 0 }, hovered: B | null = null;
  // Screen (canvas-local) point.
  const screen = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // World point (accounts for zoom/pan) — used for hit-testing + dragging.
  const pos = (e: PointerEvent) => {
    const s = screen(e);
    return { x: (s.x - panX) / scale, y: (s.y - panY) / scale };
  };
  const hit = (p: { x: number; y: number }) => {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r) return b;
    }
    return null;
  };
  const onDown = (e: PointerEvent) => {
    const p = pos(e); downP = p; moved = false;
    const b = hit(p);
    if (b) {
      drag = { b, ox: p.x - b.x, oy: p.y - b.y, px: p.x, py: p.y, vx: 0, vy: 0 };
      canvas.setPointerCapture(e.pointerId);
    } else if (scale > 1) {
      const s = screen(e);
      panning = { sx: s.x, sy: s.y, px: panX, py: panY };
      canvas.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = pos(e);
    cur.x = p.x; cur.y = p.y; cur.in = true;
    client = { x: e.clientX, y: e.clientY };
    if (downP && Math.hypot(p.x - downP.x, p.y - downP.y) * scale > 4) moved = true;
    if (drag) {
      drag.vx = p.x - drag.px; drag.vy = p.y - drag.py;
      drag.px = p.x; drag.py = p.y;
      drag.b.x = p.x - drag.ox; drag.b.y = p.y - drag.oy;
    } else if (panning) {
      const s = screen(e);
      panX = panning.px + (s.x - panning.sx);
      panY = panning.py + (s.y - panning.sy);
      clampPan();
    }
  };
  const onUp = () => {
    if (drag) {
      if (!moved) opts.onOpen(drag.b.t.id);
      else { drag.b.vx = drag.vx * 0.5; drag.b.vy = drag.vy * 0.5; }
      drag = null;
    } else if (!moved && downP) {
      const b = hit(downP);
      if (b) opts.onOpen(b.t.id);
    }
    panning = null;
    downP = null;
  };
  const onLeave = () => { cur.in = false; tip.classList.add("md-stages-hide"); };
  const onWheel = (e: WheelEvent) => {
    // Only zoom when a modifier is held (⌘/Ctrl) or the gesture is a pinch
    // (trackpad pinch arrives as ctrl+wheel). Plain scroll passes through so the
    // page can scroll past the field.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const wx = (sx - panX) / scale, wy = (sy - panY) / scale;
    scale = clampScale(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    panX = sx - wx * scale; panY = sy - wy * scale; clampPan();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function physics() {
    const cx = W / 2, cy = H / 2;
    for (const b of bubbles) {
      if (drag && drag.b === b) continue;
      b.vx += (cx - b.x) * 0.0007; b.vy += (cy - b.y) * 0.0007;
      b.vx += (Math.random() - 0.5) * 0.05; b.vy += (Math.random() - 0.5) * 0.05;
      b.vx *= 0.97; b.vy *= 0.97;
      if (hovered === b) { b.vx *= 0.3; b.vy *= 0.3; }
    }
    for (let i = 0; i < bubbles.length; i++)
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], c = bubbles[j];
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + c.r + 2;
        if (d < min) {
          const o = (min - d) / 2, nx = dx / d, ny = dy / d;
          const ad = drag && drag.b === a, cd = drag && drag.b === c;
          if (ad) { c.x += nx * o * 2; c.y += ny * o * 2; }
          else if (cd) { a.x -= nx * o * 2; a.y -= ny * o * 2; }
          else { a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o; }
        }
      }
    for (const b of bubbles) {
      if (drag && drag.b === b) continue;
      b.x += b.vx; b.y += b.vy;
      if (b.x < b.r) { b.x = b.r; b.vx *= -0.5; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx *= -0.5; }
      if (b.y < b.r) { b.y = b.r; b.vy *= -0.5; }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy *= -0.5; }
    }
  }
  function step() {
    if (!reduce) physics();
    hovered = cur.in && !drag ? hit(cur) : null;
    canvas.style.cursor = hovered ? "pointer" : "grab";
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * panX, dpr * panY);
    const now = performance.now();
    for (const b of bubbles) {
      const hv = hovered === b, s = b.t.status;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832);
      if (s === "done") {
        ctx.fillStyle = rgba(accent, hv ? 1 : 0.92); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, b.r * 0.13);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(b.x - b.r * 0.34, b.y + b.r * 0.02);
        ctx.lineTo(b.x - b.r * 0.06, b.y + b.r * 0.28);
        ctx.lineTo(b.x + b.r * 0.36, b.y - b.r * 0.26);
        ctx.stroke();
      } else if (s === "wip") {
        const pulse = reduce ? 0 : (Math.sin(now / 560) + 1) / 2;
        ctx.fillStyle = rgba(wipFill, hv ? 1 : 0.92); ctx.fill();
        ctx.strokeStyle = rgba(accent, 0.4 * (1 - pulse * 0.7)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2 + pulse * 6, 0, 6.2832); ctx.stroke();
      } else {
        ctx.fillStyle = openFill; ctx.fill();
        ctx.strokeStyle = rgba(muted, 1); ctx.lineWidth = 1.6;
        ctx.setLineDash(b.t.workSeconds <= 0 ? [3, 3] : []);
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (hv) {
        ctx.strokeStyle = rgba(ink, 1); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.stroke();
      }
    }
    if (hovered) {
      tip.innerHTML = opts.tipHtml(hovered.t);
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

  let raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    if (!canvas.isConnected) { destroy(); return; }
    if (!W || !H) layout();
    step(); draw();
    raf = requestAnimationFrame(frame);
  }
  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onWheel);
    tip.remove();
  }
  // Zoom around the viewport centre (for the +/- buttons).
  function zoomBy(f: number) {
    const sx = W / 2, sy = H / 2;
    const wx = (sx - panX) / scale, wy = (sy - panY) / scale;
    scale = clampScale(scale * f);
    panX = sx - wx * scale; panY = sy - wy * scale; clampPan();
  }
  function reset() { scale = 1; panX = 0; panY = 0; }

  layout();
  if (reduce) for (let k = 0; k < 220; k++) physics();
  raf = requestAnimationFrame(frame);
  return { destroy, zoomBy, reset };
}
