<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import {
    forceCenter,
    forceCollide,
    forceLink,
    forceManyBody,
    forceRadial,
    forceSimulation,
    forceX,
    forceY,
  } from "d3-force";
  import { app } from "$lib/stores/app.svelte";
  import type {
    GardenEdge,
    GardenEdgeKind,
    GardenKind,
    GardenNode,
    Maturity,
  } from "$lib/garden";

  type Layout = "force" | "radial" | "timeline";

  // ----- canvas / view state -----
  let container: HTMLDivElement | undefined = $state();
  let width = $state(800);
  let height = $state(600);

  let layout = $state<Layout>("force");
  let search = $state("");
  let typeFilter = $state<Record<GardenKind, boolean>>({
    note: true,
    article: true,
    workflow: true,
    list: true,
  });
  let hoveredId = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let computing = $state(false);

  // Pan/zoom
  let zoomK = $state(1);
  let zoomX = $state(0);
  let zoomY = $state(0);

  // ----- graph state -----
  // Reactive shallow; positions inside are mutated then we reassign to trigger render.
  let nodes = $state.raw<GardenNode[]>([]);
  let edges = $state.raw<GardenEdge[]>([]);

  // ----- visual encodings -----
  const MATURITY_COLOR: Record<Maturity, string> = {
    seedling: "#a7f3d0",
    budding: "#34d399",
    evergreen: "#047857",
    dormant: "#a8a29e",
  };
  function nodeRadius(n: GardenNode): number {
    return 7 + Math.min(n.degree, 12) * 1.2;
  }
  function nodeFill(n: GardenNode): string {
    return MATURITY_COLOR[n.maturity];
  }
  function nodeShape(n: GardenNode): string {
    const r = nodeRadius(n);
    if (n.kind === "note") {
      return `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    if (n.kind === "article") {
      const k = r;
      const rad = r / 3;
      return `M ${-k + rad} ${-k} L ${k - rad} ${-k} Q ${k} ${-k} ${k} ${-k + rad} L ${k} ${k - rad} Q ${k} ${k} ${k - rad} ${k} L ${-k + rad} ${k} Q ${-k} ${k} ${-k} ${k - rad} L ${-k} ${-k + rad} Q ${-k} ${-k} ${-k + rad} ${-k} Z`;
    }
    if (n.kind === "workflow") {
      return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
    }
    const sides = 6;
    let d = "";
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      d += (i === 0 ? "M " : "L ") + Math.cos(a) * r + " " + Math.sin(a) * r + " ";
    }
    return d + "Z";
  }
  const EDGE_STYLE: Record<
    GardenEdgeKind,
    { stroke: string; dasharray: string; opacity: number; width: number }
  > = {
    embed: { stroke: "#10b981", dasharray: "", opacity: 0.55, width: 1.4 },
    reference: { stroke: "#34d399", dasharray: "4 3", opacity: 0.5, width: 1.2 },
    "same-day": { stroke: "#f59e0b", dasharray: "", opacity: 0.18, width: 1 },
  };
  function edgeKey(e: GardenEdge): string {
    const s = typeof e.source === "string" ? e.source : e.source.id;
    const t = typeof e.target === "string" ? e.target : e.target.id;
    return `${s}->${t}:${e.kind}`;
  }

  // ----- derived view -----
  let visibleNodes = $derived(nodes.filter((n) => typeFilter[n.kind]));
  let visibleIds = $derived(new Set(visibleNodes.map((n) => n.id)));
  let visibleEdges = $derived(
    edges.filter((e) => {
      const sId = typeof e.source === "string" ? e.source : e.source.id;
      const tId = typeof e.target === "string" ? e.target : e.target.id;
      return visibleIds.has(sId) && visibleIds.has(tId);
    }),
  );
  let neighborIds = $derived.by(() => {
    if (!hoveredId) return null;
    const out = new Set<string>([hoveredId]);
    for (const e of visibleEdges) {
      const sId = typeof e.source === "string" ? e.source : e.source.id;
      const tId = typeof e.target === "string" ? e.target : e.target.id;
      if (sId === hoveredId) out.add(tId);
      if (tId === hoveredId) out.add(sId);
    }
    return out;
  });
  let searchTrim = $derived(search.trim().toLowerCase());
  function matchesSearch(n: GardenNode): boolean {
    if (!searchTrim) return true;
    return n.title.toLowerCase().includes(searchTrim);
  }
  function nodeOpacity(n: GardenNode): number {
    if (neighborIds && !neighborIds.has(n.id)) return 0.15;
    if (searchTrim && !matchesSearch(n)) return 0.18;
    return 1;
  }
  function edgeOpacity(e: GardenEdge, base: number): number {
    if (!neighborIds) return base;
    const sId = typeof e.source === "string" ? e.source : e.source.id;
    const tId = typeof e.target === "string" ? e.target : e.target.id;
    if (sId === hoveredId || tId === hoveredId) return Math.min(base + 0.3, 1);
    return base * 0.2;
  }

  // ----- layout (synchronous, one-shot) -----
  function seedPositions(src: GardenNode[]): GardenNode[] {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.3;
    return src.map((n, i) => {
      const angle = (i / Math.max(1, src.length)) * Math.PI * 2;
      return {
        ...n,
        x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 30,
        y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 30,
      };
    });
  }

  function computeLayout(rawNodes: GardenNode[], rawEdges: GardenEdge[], l: Layout) {
    const sim = forceSimulation<GardenNode>(rawNodes)
      .force(
        "link",
        forceLink<GardenNode, GardenEdge>(rawEdges)
          .id((d) => d.id)
          .distance((e) => (e.kind === "same-day" ? 100 : 70))
          .strength((e) => (e.kind === "same-day" ? 0.1 : 0.4)),
      )
      .force("charge", forceManyBody().strength(-260))
      .force(
        "collide",
        forceCollide<GardenNode>().radius((n) => nodeRadius(n) + 5),
      )
      .stop(); // disable autoplay — we'll tick manually below

    if (l === "force") {
      sim.force("center", forceCenter(width / 2, height / 2));
    } else if (l === "radial") {
      const orbits: Record<GardenKind, number> = {
        article: 80,
        note: 170,
        list: 260,
        workflow: 220,
      };
      sim.force(
        "radial",
        forceRadial<GardenNode>(
          (n) => orbits[n.kind],
          width / 2,
          height / 2,
        ).strength(0.9),
      );
    } else {
      const yByKind: Record<GardenKind, number> = {
        article: 0.2,
        note: 0.4,
        workflow: 0.6,
        list: 0.8,
      };
      const dates = rawNodes
        .map((n) =>
          n.createdAt
            ? new Date(n.createdAt.replace(" ", "T") + "Z").getTime()
            : 0,
        )
        .filter((t) => t > 0);
      const min = Math.min(...dates, Date.now());
      const max = Math.max(...dates, Date.now());
      const span = Math.max(max - min, 1);
      sim.force(
        "xLayout",
        forceX<GardenNode>((n) => {
          if (!n.createdAt) return width / 2;
          const t = new Date(n.createdAt.replace(" ", "T") + "Z").getTime();
          return 80 + ((t - min) / span) * (width - 160);
        }).strength(0.6),
      );
      sim.force(
        "yLayout",
        forceY<GardenNode>((n) => yByKind[n.kind] * height).strength(0.6),
      );
    }

    // Synchronous tick burst — no callbacks, no rAF, no continuous updates.
    const iterations = Math.min(200, Math.max(60, rawNodes.length * 3));
    for (let i = 0; i < iterations; i++) sim.tick();
  }

  async function rebuild(g: NonNullable<typeof app.gardenGraph>) {
    computing = true;
    await tick(); // let the overlay paint

    const newNodes = seedPositions(g.nodes);
    const idIndex = new Map(newNodes.map((n) => [n.id, n] as const));
    const newEdges: GardenEdge[] = [];
    for (const e of g.edges) {
      const sId = typeof e.source === "string" ? e.source : e.source.id;
      const tId = typeof e.target === "string" ? e.target : e.target.id;
      const s = idIndex.get(sId);
      const t = idIndex.get(tId);
      if (!s || !t) continue;
      newEdges.push({ source: s, target: t, kind: e.kind });
    }

    // Yield to the event loop so the "Computing layout…" overlay is visible.
    await new Promise((r) => setTimeout(r, 0));

    computeLayout(newNodes, newEdges, layout);

    nodes = newNodes;
    edges = newEdges;
    computing = false;
  }

  // ----- effects -----
  $effect(() => {
    const g = app.gardenGraph;
    if (!g) return;
    void rebuild(g);
  });

  // Recompute when user switches layout (but only after the initial load).
  let lastLayout: Layout | null = null;
  $effect(() => {
    const current = layout;
    if (lastLayout === null) {
      lastLayout = current;
      return;
    }
    if (lastLayout === current) return;
    lastLayout = current;
    if (nodes.length === 0) return;
    // Re-run layout with the current nodes/edges.
    void (async () => {
      computing = true;
      await tick();
      await new Promise((r) => setTimeout(r, 0));
      computeLayout(nodes, edges, current);
      nodes = nodes.slice();
      computing = false;
    })();
  });

  // ----- manual pan/zoom -----
  let panning = $state(false);
  let panStartX = 0;
  let panStartY = 0;
  let panInitX = 0;
  let panInitY = 0;

  function onBackgroundPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    panning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panInitX = zoomX;
    panInitY = zoomY;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }
  function onBackgroundPointerMove(e: PointerEvent) {
    if (!panning) return;
    zoomX = panInitX + (e.clientX - panStartX);
    zoomY = panInitY + (e.clientY - panStartY);
  }
  function onBackgroundPointerUp(e: PointerEvent) {
    if (!panning) return;
    panning = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }
  function onBackgroundClick() {
    selectedId = null;
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const scaleBy = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newK = Math.max(0.2, Math.min(4, zoomK * scaleBy));
    if (newK === zoomK) return;
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const px = (cx - zoomX) / zoomK;
    const py = (cy - zoomY) / zoomK;
    zoomK = newK;
    zoomX = cx - px * newK;
    zoomY = cy - py * newK;
  }
  function resetZoom() {
    zoomK = 1;
    zoomX = 0;
    zoomY = 0;
  }

  // ----- node drag (no simulation involved) -----
  let dragId = $state<string | null>(null);
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function startNodeDrag(node: GardenNode, e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragId = node.id;
    dragOffsetX = e.clientX;
    dragOffsetY = e.clientY;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }
  function moveNodeDrag(node: GardenNode, e: PointerEvent) {
    if (dragId !== node.id || !container) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    node.x = (cx - zoomX) / zoomK;
    node.y = (cy - zoomY) / zoomK;
    // Trigger re-render of just this node's position by reassigning array.
    nodes = nodes.slice();
  }
  function endNodeDrag(e: PointerEvent) {
    if (dragId === null) return;
    dragId = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  // ----- navigation -----
  function openNode(n: GardenNode) {
    if (n.kind === "note") app.selectNote(n.entityId);
    else if (n.kind === "article") app.selectArticle(n.entityId);
    else if (n.kind === "workflow") app.selectWorkflow(n.entityId);
    else if (n.kind === "list") app.select(n.entityId);
  }
  function selectedNode(): GardenNode | null {
    if (!selectedId) return null;
    return nodes.find((n) => n.id === selectedId) ?? null;
  }
  function neighborsOf(id: string) {
    const incoming: GardenNode[] = [];
    const outgoing: GardenNode[] = [];
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    for (const e of edges) {
      const sId = typeof e.source === "string" ? e.source : e.source.id;
      const tId = typeof e.target === "string" ? e.target : e.target.id;
      if (sId === id) {
        const n = byId.get(tId);
        if (n) outgoing.push(n);
      } else if (tId === id) {
        const n = byId.get(sId);
        if (n) incoming.push(n);
      }
    }
    return { incoming, outgoing };
  }
  const MATURITY_LABEL: Record<Maturity, string> = {
    seedling: "🌱 Seedling",
    budding: "🌿 Budding",
    evergreen: "🌳 Evergreen",
    dormant: "🍂 Dormant",
  };
  function formatDate(raw: string): string {
    if (!raw) return "—";
    const d = new Date(raw.replace(" ", "T") + "Z");
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // ----- mount -----
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    if (container) {
      width = container.clientWidth;
      height = container.clientHeight;
      resizeObserver = new ResizeObserver(() => {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === width && h === height) return;
        width = w;
        height = h;
      });
      resizeObserver.observe(container);
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });

  let sel = $derived(selectedNode());
  let selNeighbors = $derived(sel ? neighborsOf(sel.id) : null);
</script>

<div
  bind:this={container}
  class="relative h-screen w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950"
>
  <!-- dotted background -->
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.12]"
    style="background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 20px 20px;"
  ></div>

  <svg
    {width}
    {height}
    viewBox={`0 0 ${width} ${height}`}
    preserveAspectRatio="xMidYMid meet"
    aria-label="Knowledge garden — interactive graph"
    class="absolute inset-0 h-full w-full"
    onwheel={onWheel}
  >
    <rect
      x="0"
      y="0"
      {width}
      {height}
      fill="transparent"
      role="button"
      tabindex="-1"
      aria-label="Pan or click to clear selection"
      class:cursor-grabbing={panning}
      class:cursor-grab={!panning}
      onclick={onBackgroundClick}
      onpointerdown={onBackgroundPointerDown}
      onpointermove={onBackgroundPointerMove}
      onpointerup={onBackgroundPointerUp}
      onpointercancel={onBackgroundPointerUp}
      onkeydown={(e) => {
        if (e.key === "Escape") selectedId = null;
      }}
    />

    <g transform={`translate(${zoomX},${zoomY}) scale(${zoomK})`}>
      <g>
        {#each visibleEdges as e (edgeKey(e))}
          {@const s = typeof e.source === "string" ? null : e.source}
          {@const t = typeof e.target === "string" ? null : e.target}
          {#if s && t && s.x !== undefined && t.x !== undefined}
            <line
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={EDGE_STYLE[e.kind].stroke}
              stroke-width={EDGE_STYLE[e.kind].width}
              stroke-dasharray={EDGE_STYLE[e.kind].dasharray}
              opacity={edgeOpacity(e, EDGE_STYLE[e.kind].opacity)}
            />
          {/if}
        {/each}
      </g>

      <g>
        {#each visibleNodes as n (n.id)}
          {#if n.x !== undefined && n.y !== undefined}
            <g
              transform={`translate(${n.x},${n.y})`}
              opacity={nodeOpacity(n)}
            >
              {#if n.pinned}
                <circle
                  cx="0"
                  cy="0"
                  r={nodeRadius(n) + 3}
                  fill="none"
                  stroke="#f59e0b"
                  stroke-width="1.5"
                  opacity="0.85"
                />
              {/if}
              <path
                d={nodeShape(n)}
                fill={nodeFill(n)}
                stroke={hoveredId === n.id || selectedId === n.id
                  ? "#0f172a"
                  : "rgba(0,0,0,0.25)"}
                stroke-width={hoveredId === n.id || selectedId === n.id ? 1.5 : 0.8}
                class={dragId === n.id ? "cursor-grabbing" : "cursor-pointer"}
                role="button"
                tabindex="0"
                aria-label={`${n.kind}: ${n.title}`}
                onpointerdown={(e) => startNodeDrag(n, e)}
                onpointermove={(e) => moveNodeDrag(n, e)}
                onpointerup={(e) => endNodeDrag(e)}
                onpointercancel={(e) => endNodeDrag(e)}
                onpointerenter={() => (hoveredId = n.id)}
                onpointerleave={() => (hoveredId = null)}
                onclick={(e) => {
                  e.stopPropagation();
                  selectedId = n.id;
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectedId = n.id;
                  } else if (e.key === "o") {
                    openNode(n);
                  }
                }}
                ondblclick={(e) => {
                  e.stopPropagation();
                  openNode(n);
                }}
              />
              {#if hoveredId === n.id || selectedId === n.id || (searchTrim && matchesSearch(n))}
                <text
                  x={nodeRadius(n) + 6}
                  y="4"
                  font-size="11"
                  font-family="ui-sans-serif, system-ui, sans-serif"
                  fill="currentColor"
                  class="pointer-events-none select-none text-neutral-800 dark:text-neutral-100"
                  style="paint-order: stroke; stroke: rgba(255,255,255,0.85); stroke-width: 3px;"
                >
                  {n.title}
                </text>
              {/if}
            </g>
          {/if}
        {/each}
      </g>
    </g>
  </svg>

  {#if computing}
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div class="rounded-md bg-white/90 px-4 py-2 text-sm text-neutral-600 shadow-sm dark:bg-neutral-900/90 dark:text-neutral-300">
        Computing layout…
      </div>
    </div>
  {:else if app.gardenLoading}
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
      Growing your garden…
    </div>
  {:else if visibleNodes.length === 0}
    <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <div class="pointer-events-auto max-w-md rounded-xl border border-emerald-200/60 bg-white/80 px-6 py-5 text-sm text-neutral-600 backdrop-blur dark:border-emerald-900/40 dark:bg-neutral-900/80 dark:text-neutral-300">
        <p class="mb-2 text-base font-semibold text-emerald-700 dark:text-emerald-300">
          Your garden is just sprouting.
        </p>
        <p>
          Create a few notes, articles, or workflows — and embed them in each other with
          <code class="rounded bg-neutral-200/60 px-1 dark:bg-neutral-700/40">{`{{kind:id}}`}</code>
          — then come back to watch the map grow.
        </p>
      </div>
    </div>
  {/if}

  <div class="absolute left-4 top-4 z-20 flex flex-col gap-2">
    <input
      type="search"
      bind:value={search}
      placeholder="Search the garden…"
      class="w-60 rounded-md border border-neutral-300/70 bg-white/85 px-3 py-1.5 text-xs shadow-sm outline-none backdrop-blur placeholder:text-neutral-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:text-neutral-100"
    />
    <div class="flex flex-wrap gap-1.5">
      {#each (["note", "article", "workflow", "list"] as GardenKind[]) as k}
        <button
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
          class:bg-emerald-600={typeFilter[k]}
          class:text-white={typeFilter[k]}
          class:border-emerald-600={typeFilter[k]}
          class:bg-white={!typeFilter[k]}
          class:text-neutral-500={!typeFilter[k]}
          class:border-neutral-300={!typeFilter[k]}
          class:dark:bg-emerald-700={typeFilter[k]}
          class:dark:border-emerald-700={typeFilter[k]}
          class:dark:bg-neutral-900={!typeFilter[k]}
          class:dark:border-neutral-700={!typeFilter[k]}
          class:dark:text-neutral-400={!typeFilter[k]}
          onclick={() => (typeFilter[k] = !typeFilter[k])}
        >
          {k}s
        </button>
      {/each}
    </div>
  </div>

  <div class="absolute right-4 top-4 z-20 flex items-center gap-2">
    <div class="overflow-hidden rounded-md border border-neutral-300/70 bg-white/85 text-xs shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/80">
      {#each (["force", "radial", "timeline"] as Layout[]) as l}
        <button
          type="button"
          class="px-2.5 py-1"
          class:bg-emerald-600={layout === l}
          class:text-white={layout === l}
          class:hover:bg-emerald-700={layout === l}
          class:text-neutral-600={layout !== l}
          class:hover:bg-neutral-100={layout !== l}
          class:dark:text-neutral-300={layout !== l}
          class:dark:hover:bg-neutral-800={layout !== l}
          onclick={() => (layout = l)}
        >
          {l}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="rounded-md border border-neutral-300/70 bg-white/85 px-2.5 py-1 text-xs text-neutral-600 shadow-sm backdrop-blur hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:text-neutral-300 dark:hover:bg-neutral-800"
      onclick={resetZoom}
    >
      Reset
    </button>
  </div>

  <div class="absolute bottom-4 left-4 z-20 flex flex-col gap-2 rounded-md border border-neutral-300/70 bg-white/85 px-3 py-2 text-[11px] text-neutral-600 shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:text-neutral-300">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-3 w-3 rounded-full" style="background: {MATURITY_COLOR.seedling};"></span>
        seedling
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-3 w-3 rounded-full" style="background: {MATURITY_COLOR.budding};"></span>
        budding
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-3 w-3 rounded-full" style="background: {MATURITY_COLOR.evergreen};"></span>
        evergreen
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-3 w-3 rounded-full" style="background: {MATURITY_COLOR.dormant};"></span>
        dormant
      </span>
    </div>
    <div class="flex items-center gap-3">
      <span>● note</span>
      <span>■ article</span>
      <span>◆ workflow</span>
      <span>⬢ list</span>
    </div>
  </div>

  {#if sel}
    <aside
      class="absolute right-4 top-20 z-20 w-72 rounded-lg border border-neutral-200/80 bg-white/95 p-4 text-sm shadow-lg backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-900/95"
    >
      <header class="mb-3 flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            {sel.kind}
          </p>
          <h3 class="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {sel.title}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          onclick={() => (selectedId = null)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </header>

      <dl class="mb-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <dt class="text-neutral-400">Maturity</dt>
        <dd class="text-neutral-700 dark:text-neutral-200">{MATURITY_LABEL[sel.maturity]}</dd>
        <dt class="text-neutral-400">Updated</dt>
        <dd class="text-neutral-700 dark:text-neutral-200">{formatDate(sel.updatedAt)}</dd>
        {#if sel.pinned}
          <dt class="text-neutral-400">Pinned</dt>
          <dd class="text-amber-600 dark:text-amber-400">yes</dd>
        {/if}
        <dt class="text-neutral-400">Degree</dt>
        <dd class="text-neutral-700 dark:text-neutral-200">{sel.degree}</dd>
      </dl>

      {#if selNeighbors}
        {#if selNeighbors.outgoing.length > 0}
          <p class="mb-1 text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            Links to
          </p>
          <ul class="mb-2 flex flex-wrap gap-1.5">
            {#each selNeighbors.outgoing as n (n.id)}
              <li>
                <button
                  type="button"
                  class="rounded-full border border-neutral-200/80 bg-neutral-100/70 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-200/60 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200"
                  onclick={() => (selectedId = n.id)}
                >
                  {n.title}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if selNeighbors.incoming.length > 0}
          <p class="mb-1 text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            Referenced by
          </p>
          <ul class="mb-3 flex flex-wrap gap-1.5">
            {#each selNeighbors.incoming as n (n.id)}
              <li>
                <button
                  type="button"
                  class="rounded-full border border-neutral-200/80 bg-neutral-100/70 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-200/60 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200"
                  onclick={() => (selectedId = n.id)}
                >
                  {n.title}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}

      <button
        type="button"
        class="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        onclick={() => sel && openNode(sel)}
      >
        Open {sel.kind} →
      </button>
    </aside>
  {/if}
</div>
