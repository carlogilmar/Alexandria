<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import type { MirrorKind, MirrorList, MirrorPoint } from "$lib/ipc";

  // Bar magnitude ramps (task-count low -> high). One is picked at RANDOM each
  // time the view opens, so the Mirror greets you with a different mood; a
  // shuffle button in the panel re-rolls it.
  const PALETTES = [
    { name: "Magma", stops: ["#1b1035", "#b63679", "#fca636", "#fcfdbf"] },
    { name: "Ember", stops: ["#7c2d12", "#ea580c", "#facc15"] },
    { name: "Sunset", stops: ["#4c1d95", "#db2777", "#fb923c"] },
    { name: "Ocean", stops: ["#0c4a6e", "#0ea5e9", "#a5f3fc"] },
    { name: "Viridis", stops: ["#440154", "#21918c", "#5ec962", "#fde725"] },
    { name: "Forest", stops: ["#14532d", "#16a34a", "#bef264"] },
  ];
  let palIdx = $state(Math.floor(Math.random() * PALETTES.length));
  function shufflePalette() {
    if (PALETTES.length < 2) return;
    let i = palIdx;
    while (i === palIdx) i = Math.floor(Math.random() * PALETTES.length);
    palIdx = i;
  }

  // The info panel collapses so it never blocks the visualization; it starts
  // collapsed (just the "Legend" pill) so the view is unobstructed by default.
  let panelOpen = $state(false);

  const reduce =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TYPES: { key: MirrorKind; label: string }[] = [
    { key: "note", label: "Notes" },
    { key: "article", label: "Articles" },
    { key: "blueprint", label: "Blueprints" },
    { key: "board", label: "Boards" },
    { key: "storyboard", label: "Storyboards" },
  ];
  const TYPE_ORDER: MirrorKind[] = ["note", "article", "blueprint", "board", "storyboard"];
  // Orb colours are derived as a COMPLEMENT of the active bar palette (opposite
  // hue), spread into five coordinated tones — so a shuffle re-themes the whole
  // scene at once. Recomputed when the palette or light/dark changes.
  function computeOrbColors(pi: number, dark: boolean): string[] {
    const stops = PALETTES[pi].stops.map(hexToHsl);
    let base = stops[0];
    for (const s of stops) if (s.l > 18 && s.l < 82 && s.s > base.s) base = s; // most vivid stop
    const comp = (base.h + 180) % 360;
    const offs = [-52, -26, 0, 26, 52];
    const S = dark ? 72 : 66;
    const Lp = dark ? 64 : 46;
    return offs.map((o) => hslToHex((comp + o + 360) % 360, S, Lp));
  }
  let orbColors = $derived(computeOrbColors(palIdx, theme.resolved === "dark"));
  const typeColor = (k: MirrorKind) => orbColors[TYPE_ORDER.indexOf(k)];

  // ---------- color helpers ----------
  const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const lerp = (a: number[], b: number[], t: number) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
  const lighten = (rgb: number[], amt: number) => lerp(rgb, [255, 255, 255], amt);
  const rgba = (rgb: number[], a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const hexA = (hex: string, a: number) => rgba(hexToRgb(hex), a);
  function sampleRamp(stops: string[], t: number) {
    t = clamp01(t);
    const n = stops.length - 1;
    const f = t * n;
    const i = Math.min(n - 1, Math.floor(f));
    return lerp(hexToRgb(stops[i]), hexToRgb(stops[i + 1]), f - i);
  }
  function hexToHsl(hex: string) {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h, s: s * 100, l: l * 100 };
  }
  function hslToHex(h: number, s: number, l: number) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const hx = (v: number) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${hx(r)}${hx(g)}${hx(b)}`;
  }

  // ---------- geometry ----------
  const BAR_W = 8,
    MARGIN = 44,
    MAX_BAR_H = 150,
    HALF = MAX_BAR_H / 2,
    NOTE_GAP = 22,
    OTHER_GAP = 22,
    R_MIN = 3,
    R_MAX = 13;

  type LNode = { ref: MirrorList; x: number; h: number };
  type PNode = { ref: MirrorPoint; kind: MirrorKind; x: number; r: number; y: number; by: number };
  let L: LNode[] = [];
  let P: PNode[] = [];
  let WORLD_W = 800,
    worldMinY = -100,
    worldMaxY = 100,
    maxTasks = 1;

  const toMs = (raw: string) => {
    // "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
    if (raw.length <= 10) return new Date(raw + "T00:00:00Z").getTime();
    return new Date(raw.replace(" ", "T") + "Z").getTime();
  };

  function buildLayout() {
    const data = app.mirror;
    L = [];
    P = [];
    if (!data) return;

    const lists = data.lists; // already sorted ASC by date
    maxTasks = Math.max(1, ...lists.map((l) => l.tasks));
    const listMs = lists.map((l) => toMs(l.date));
    const N = lists.length;
    WORLD_W = N * BAR_W + MARGIN * 2;

    for (let i = 0; i < N; i++) {
      L.push({
        ref: lists[i],
        x: MARGIN + i * BAR_W + BAR_W / 2,
        h: (lists[i].tasks / maxTasks) * MAX_BAR_H,
      });
    }

    // Map a timestamp to a fractional list-index -> x (keeps orbs aligned to
    // the contiguous terrain even though lists aren't evenly dated).
    function xForMs(ms: number): number {
      if (N === 0) return MARGIN;
      if (ms <= listMs[0]) return MARGIN + BAR_W / 2;
      if (ms >= listMs[N - 1]) return MARGIN + (N - 1) * BAR_W + BAR_W / 2;
      let k = 0;
      while (k < N - 1 && listMs[k + 1] <= ms) k++;
      const span = listMs[k + 1] - listMs[k] || 1;
      const frac = k + (ms - listMs[k]) / span;
      return MARGIN + frac * BAR_W + BAR_W / 2;
    }

    // Global magnitude normalisation: log(1+mass) across ALL points, so a big
    // article outweighs a small note across types without one type dominating.
    const scores = data.points.map((p) => Math.log(1 + Math.max(0, p.mass)));
    const sMin = Math.min(...scores, 0);
    const sMax = Math.max(...scores, 1);
    const radius = (score: number) =>
      R_MIN + Math.sqrt(clamp01((score - sMin) / (sMax - sMin || 1))) * (R_MAX - R_MIN);

    const pts: PNode[] = data.points.map((p, i) => ({
      ref: p,
      kind: p.kind,
      x: N > 0 ? xForMs(toMs(p.createdAt)) : MARGIN + (i / Math.max(1, data.points.length)) * 600,
      r: radius(scores[i]),
      y: 0,
      by: 0,
    }));

    const notes = pts.filter((p) => p.kind === "note").sort((a, b) => a.x - b.x);
    const others = pts.filter((p) => p.kind !== "note").sort((a, b) => a.x - b.x);
    beeswarm(notes, -HALF - NOTE_GAP, -1);
    beeswarm(others, HALF + OTHER_GAP, 1);
    P = pts;

    worldMinY = Math.min(-HALF, ...notes.map((a) => a.y - a.r)) - MARGIN;
    worldMaxY = Math.max(HALF, ...others.map((a) => a.y + a.r)) + MARGIN;
    fitView();
  }

  function beeswarm(items: PNode[], edge: number, dir: number) {
    const placed: PNode[] = [];
    for (const a of items) {
      let y = edge + dir * (a.r + 2);
      for (let moved = true, g = 0; moved && g < 700; g++) {
        moved = false;
        for (const p of placed) {
          if (Math.abs(a.x - p.x) < a.r + p.r + 3) {
            const need = a.r + p.r + 3;
            if (Math.abs(y - p.y) < need) {
              y = p.y + dir * need;
              moved = true;
            }
          }
        }
      }
      a.y = y;
      placed.push(a);
    }
  }

  // ---------- camera ----------
  let canvas: HTMLCanvasElement | undefined = $state();
  let host: HTMLDivElement | undefined = $state();
  let W = 800,
    H = 600,
    dpr = 1,
    k = 1,
    ox = 0,
    oy = 0;

  function fitView() {
    const worldH = worldMaxY - worldMinY;
    k = Math.min((W * 0.9) / WORLD_W, (H * 0.82) / worldH);
    if (!isFinite(k) || k <= 0) k = 1;
    ox = (W - WORLD_W * k) / 2;
    oy = (H - worldH * k) / 2 - worldMinY * k;
  }
  function measure() {
    if (!canvas || !host) return;
    const rect = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const wxOf = (mx: number) => (mx - ox) / k;
  const wyOf = (my: number) => (my - oy) / k;

  // ---------- animation ----------
  const BAR_STAGGER = reduce ? 0 : 7,
    BAR_DUR = reduce ? 0 : 520,
    ORB_DUR = reduce ? 0 : 620;
  let startT = 0;
  let raf = 0;
  const replay = () => {
    shufflePalette(); // a replay re-themes the scene too
    startT = performance.now();
  };
  const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
  const easeOutBack = (x: number) => {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };
  const barP = (i: number, el: number) =>
    reduce ? 1 : easeOut(clamp01((el - i * BAR_STAGGER) / BAR_DUR));
  function orbDelay(a: PNode) {
    const buildSpan = L.length * BAR_STAGGER;
    const frac = WORLD_W > 0 ? (a.x - MARGIN) / (WORLD_W - 2 * MARGIN || 1) : 0;
    return frac * buildSpan + 360;
  }
  const orbP = (a: PNode, el: number) =>
    reduce ? 1 : easeOutBack(clamp01((el - orbDelay(a)) / ORB_DUR));

  // ---------- hover / tooltip ----------
  type Hover = { kind: "orb"; ref: PNode } | { kind: "bar"; ref: LNode } | null;
  let hover: Hover = null;
  let tip = $state<{
    show: boolean;
    x: number;
    y: number;
    title: string;
    sub: string;
    dot: string;
    meta: string;
  }>({ show: false, x: 0, y: 0, title: "", sub: "", dot: "", meta: "" });

  const MASSLABEL: Record<MirrorKind, (m: number) => string> = {
    note: (m) => `${m.toLocaleString()} chars`,
    article: (m) => `${m.toLocaleString()} chars`,
    blueprint: (m) => `${m} nodes + edges`,
    board: (m) => `${m} cards + comments`,
    storyboard: (m) => `${m} nodes + pages`,
  };
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDate(raw: string) {
    const d = new Date(toMs(raw));
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function hitTest(mx: number, my: number): Hover {
    const wx = wxOf(mx),
      wy = wyOf(my);
    let best: PNode | null = null,
      bd = Infinity;
    for (const a of P) {
      const d = Math.hypot(wx - a.x, wy - a.by);
      if (d <= a.r + 3 && d < bd) {
        bd = d;
        best = a;
      }
    }
    if (best) return { kind: "orb", ref: best };
    for (const l of L) {
      if (wx >= l.x - BAR_W / 2 - 1 && wx <= l.x + BAR_W / 2 + 1 && Math.abs(wy) <= l.h / 2 + 1)
        return { kind: "bar", ref: l };
    }
    return null;
  }
  function updateTip(mx: number, my: number) {
    if (!hover) {
      tip = { ...tip, show: false };
      return;
    }
    if (hover.kind === "orb") {
      const a = hover.ref;
      const meta = TYPES.find((t) => t.key === a.kind)!;
      tip = {
        show: true,
        x: mx,
        y: my,
        title: a.ref.title || `(untitled ${meta.label.replace(/s$/, "").toLowerCase()})`,
        sub: `${meta.label.replace(/s$/, "")} · ${fmtDate(a.ref.createdAt)}`,
        dot: typeColor(a.kind),
        meta: MASSLABEL[a.kind](a.ref.mass),
      };
    } else {
      const l = hover.ref.ref;
      const bc = sampleRamp(PALETTES[palIdx].stops, l.tasks / maxTasks);
      tip = {
        show: true,
        x: mx,
        y: my,
        title: `${fmtDate(l.date)} · list`,
        sub: `${l.done}/${l.tasks} tasks done`,
        dot: `rgb(${bc.join(",")})`,
        meta: `${Math.round((100 * l.done) / Math.max(1, l.tasks))}% complete`,
      };
    }
  }

  function navigate(h: Hover) {
    if (!h) return;
    if (h.kind === "bar") {
      app.select(h.ref.ref.id);
      return;
    }
    const p = h.ref.ref;
    switch (p.kind) {
      case "note": app.selectNote(p.id); break;
      case "article": app.selectArticle(p.id); break;
      case "blueprint": app.openBlueprint(p.id); break;
      case "board": app.openFeedbackBoard(p.id); break;
      case "storyboard": app.openStoryboard(p.id); break;
    }
  }

  // ---------- draw ----------
  function draw(nowT: number) {
    raf = requestAnimationFrame(draw);
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const el = nowT - startT;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, ox * dpr, oy * dpr);

    const stops = PALETTES[palIdx].stops;

    // centered contiguous bars — colour = task magnitude
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      const p = barP(i, el);
      if (p <= 0) continue;
      const h = l.h * p,
        norm = l.ref.tasks / maxTasks;
      const col = sampleRamp(stops, norm);
      const isHover = hover?.kind === "bar" && hover.ref === l;
      const edgeA = isHover ? 1 : 0.9,
        midCol = lighten(col, isHover ? 0.32 : 0.2);
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, rgba(col, edgeA));
      g.addColorStop(0.5, rgba(midCol, 1));
      g.addColorStop(1, rgba(col, edgeA));
      ctx.fillStyle = g;
      ctx.fillRect(l.x - BAR_W / 2, -h / 2, BAR_W + 0.6, h);
    }
    if (L.length) {
      ctx.strokeStyle = rgba(sampleRamp(stops, 1), 0.3);
      ctx.lineWidth = 1 / k;
      ctx.beginPath();
      ctx.moveTo(MARGIN, 0);
      ctx.lineTo(WORLD_W - MARGIN, 0);
      ctx.stroke();
    }

    // orbs — notes above, other work below
    for (const a of P) {
      const p = orbP(a, el);
      if (p <= 0) continue;
      const col = typeColor(a.kind);
      const settled = el > orbDelay(a) + ORB_DUR;
      const bob = reduce || !settled ? 0 : Math.sin(nowT / 950 + a.x) * 2.0;
      const y = a.y + bob,
        r = a.r * (reduce ? 1 : p);
      a.by = y;
      const isHover = hover?.kind === "orb" && hover.ref === a;
      const alpha = 0.58 + 0.42 * timeNorm(a);

      // stem: a hairline from the orb all the way to the centre spine
      ctx.strokeStyle = hexA(col, isHover ? 0.45 : 0.14);
      ctx.lineWidth = 1 / k;
      ctx.beginPath();
      ctx.moveTo(a.x, y + (a.kind === "note" ? r : -r));
      ctx.lineTo(a.x, 0);
      ctx.stroke();

      const bg = ctx.createRadialGradient(a.x - r * 0.32, y - r * 0.36, r * 0.1, a.x, y, r);
      bg.addColorStop(0, hexA(col, Math.min(1, alpha + 0.18)));
      bg.addColorStop(1, hexA(col, alpha));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(a.x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA("#ffffff", 0.22 + (isHover ? 0.4 : 0));
      ctx.lineWidth = 1 / k;
      ctx.beginPath();
      ctx.arc(a.x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // recency 0..1 by x position along the timeline (newer = brighter)
  const timeNorm = (a: PNode) =>
    WORLD_W > 0 ? clamp01((a.x - MARGIN) / (WORLD_W - 2 * MARGIN || 1)) : 0.5;

  // ---------- interaction ----------
  let dragging = false,
    moved = false,
    sxStart = 0,
    syStart = 0,
    oxStart = 0,
    oyStart = 0;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    moved = false;
    sxStart = e.clientX;
    syStart = e.clientY;
    oxStart = ox;
    oyStart = oy;
    canvas?.setPointerCapture(e.pointerId);
    tip = { ...tip, show: false };
    cursorStyle = "grabbing";
  }
  function onPointerMove(e: PointerEvent) {
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    if (dragging) {
      const dx = e.clientX - sxStart,
        dy = e.clientY - syStart;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      ox = oxStart + dx;
      oy = oyStart + dy;
      return;
    }
    hover = hitTest(mx, my);
    updateTip(mx, my);
    cursorStyle = hover ? "pointer" : "grab";
  }
  function onPointerUp(e: PointerEvent) {
    const wasDrag = moved;
    dragging = false;
    canvas?.releasePointerCapture?.(e.pointerId);
    cursorStyle = hover ? "pointer" : "grab";
    if (!wasDrag && hover) navigate(hover);
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    const wx = wxOf(mx),
      wy = wyOf(my);
    const nk = Math.max(0.3, Math.min(5, k * Math.exp(-e.deltaY * 0.0016)));
    ox = mx - wx * nk;
    oy = my - wy * nk;
    k = nk;
  }

  // ---------- lifecycle ----------
  onMount(() => {
    measure();
    buildLayout();
    replay();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => {
      const pk = k;
      measure();
      // keep zoom, just re-center margins if content smaller than viewport
      k = pk;
    });
    if (host) ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  // Rebuild when data arrives / changes.
  $effect(() => {
    void app.mirror;
    if (canvas) buildLayout();
  });

  let cursorStyle = $state("grab");
</script>

<div class="mirror" bind:this={host}>
  <canvas
    bind:this={canvas}
    style="cursor:{cursorStyle}"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={() => {
      dragging = false;
      cursorStyle = "grab";
    }}
    onpointerleave={() => {
      hover = null;
      tip = { ...tip, show: false };
      cursorStyle = "grab";
    }}
    onwheel={onWheel}
  ></canvas>

  {#if app.mirrorLoading && !app.mirror}
    <div class="center-note">Reflecting your library…</div>
  {:else if app.mirror && app.mirror.points.length === 0 && app.mirror.lists.length === 0}
    <div class="center-note">
      Nothing to mirror yet. Create some notes, articles, blueprints, boards or storyboards.
    </div>
  {/if}

  <div class="hud">
    <div class="title-block">
      <p class="eyebrow">Alexandria</p>
      <h1 class="title">The Mirror</h1>
      <p class="caption">
        Your daily work as terrain — one bar per list, height &amp; colour = tasks. Above float your
        <b>notes</b>; below, the <b>articles, blueprints, boards &amp; storyboards</b>, sized by
        weight. Click any orb to open it.
      </p>
    </div>

    {#if panelOpen}
      <div class="panel">
        <button class="panel-toggle" title="Hide panel" aria-label="Hide panel" onclick={() => (panelOpen = false)}>⌃</button>
        <div class="legend">
          {#each TYPES as t (t.key)}
            <div class="legend-row">
              <span class="swatch" style="background:{typeColor(t.key)}"></span>{t.label}
              <span class="n">{app.mirror?.points.filter((p) => p.kind === t.key).length ?? 0}</span>
            </div>
          {/each}
        </div>
        <p class="band-note">notes float above · other work below</p>
        <div class="divider"></div>
        <div class="controls">
          <button onclick={replay} title="Replay the build">▶ Replay</button>
          <button onclick={fitView} title="Reset zoom &amp; pan">⤢ Fit</button>
          <button onclick={shufflePalette} title="Shuffle colours">🎨 {PALETTES[palIdx].name}</button>
        </div>
      </div>
    {:else}
      <button class="panel-show" title="Show panel" onclick={() => (panelOpen = true)}>Legend ⌄</button>
    {/if}

    <div class="foot">scroll to zoom · drag to pan · click an orb to open it · ← older · newer →</div>
  </div>

  {#if tip.show}
    <div class="tip" style="left:{tip.x}px; top:{tip.y - 8}px">
      <div class="tt">{tip.title}</div>
      <div class="ts"><span class="tdot" style="background:{tip.dot}"></span>{tip.sub}</div>
      <div class="tm">{tip.meta}</div>
    </div>
  {/if}
</div>

<style>
  .mirror {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: radial-gradient(120% 90% at 50% 42%, rgba(148, 163, 184, 0.10), transparent 72%);
  }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }

  .center-note {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 2rem;
    text-align: center;
    font-size: 0.9rem;
    color: rgb(120 130 150);
    pointer-events: none;
  }

  .hud { position: absolute; inset: 0; pointer-events: none; }
  .hud > * { pointer-events: auto; }

  .title-block { position: absolute; left: clamp(12px, 2.4vw, 28px); top: clamp(12px, 2vw, 22px); max-width: 42ch; }
  .eyebrow { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: rgb(130 140 160); margin: 0 0 5px; }
  .title { font-size: clamp(20px, 2.6vw, 30px); font-weight: 650; margin: 0; line-height: 1.05; letter-spacing: -0.01em; }
  .caption { margin: 8px 0 0; font-size: 12px; color: rgb(120 130 150); line-height: 1.5; }
  .caption b { color: inherit; font-weight: 600; filter: brightness(1.25); }

  .panel {
    position: absolute; right: clamp(12px, 2.4vw, 28px); top: clamp(12px, 2vw, 22px);
    background: color-mix(in srgb, canvas 55%, transparent);
    border: 1px solid rgba(128, 140, 165, 0.22); border-radius: 14px; padding: 11px 13px;
    backdrop-filter: blur(8px); min-width: 178px;
  }
  .panel-toggle {
    position: absolute; top: 8px; right: 9px; width: 20px; height: 20px; padding: 0;
    display: grid; place-items: center; border: none; background: transparent; cursor: pointer;
    color: rgb(130 140 160); font-size: 13px; line-height: 1; border-radius: 6px;
  }
  .panel-toggle:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
  .panel-show {
    position: absolute; right: clamp(12px, 2.4vw, 28px); top: clamp(12px, 2vw, 22px);
    background: color-mix(in srgb, canvas 55%, transparent);
    border: 1px solid rgba(128, 140, 165, 0.22); border-radius: 10px;
    padding: 7px 11px; backdrop-filter: blur(8px); cursor: pointer;
    font: 600 11.5px/1 ui-sans-serif, system-ui, sans-serif; color: inherit;
  }
  .panel-show:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .legend { display: grid; gap: 6px; padding-right: 16px; }
  .legend-row { display: flex; align-items: center; gap: 9px; font-size: 12px; }
  .swatch { width: 11px; height: 11px; border-radius: 50%; flex: none; }
  .legend-row .n { margin-left: auto; font: 500 11px/1 ui-monospace, Menlo, monospace; color: rgb(130 140 160); font-variant-numeric: tabular-nums; }
  .band-note { font-size: 10px; color: rgb(130 140 160); margin: 8px 0 0; }
  .divider { height: 1px; background: rgba(128, 140, 165, 0.22); margin: 10px 0; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .controls button {
    font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; color: inherit; background: transparent;
    border: 1px solid rgba(128, 140, 165, 0.25); border-radius: 9px; padding: 7px 10px; cursor: pointer;
  }
  .controls button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }

  .foot { position: absolute; left: clamp(12px, 2.4vw, 28px); bottom: 12px; font-size: 10.5px; color: rgb(130 140 160); }

  .tip {
    position: absolute; z-index: 10; pointer-events: none;
    transform: translate(-50%, -114%);
    background: color-mix(in srgb, canvas 62%, transparent);
    border: 1px solid rgba(128, 140, 165, 0.25); backdrop-filter: blur(8px);
    border-radius: 10px; padding: 8px 11px; min-width: 128px; max-width: 240px;
  }
  .tip .tt { font-size: 12.5px; font-weight: 600; line-height: 1.25; }
  .tip .ts { font-size: 11px; color: rgb(130 140 160); margin-top: 3px; display: flex; align-items: center; gap: 6px; }
  .tip .tdot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .tip .tm { font: 500 11px/1 ui-monospace, Menlo, monospace; margin-top: 6px; color: rgb(130 140 160); font-variant-numeric: tabular-nums; }
</style>
