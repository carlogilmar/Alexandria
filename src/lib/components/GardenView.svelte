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
  import { theme } from "$lib/stores/theme.svelte";
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

  // Radial is the most useful default — it answers "how much of each kind
  // do I have?" at a glance. Force layout (organic clusters) and timeline
  // (chronological flow) are one click away.
  let layout = $state<Layout>("radial");
  let search = $state("");
  // Lists are "in-flight knowledge" (daily todos); the knowledge base lives
  // in notes/articles/workflows. Hide lists by default; user can opt in.
  let typeFilter = $state<Record<GardenKind, boolean>>({
    note: true,
    article: true,
    workflow: true,
    list: false,
  });
  let hoveredId = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let computing = $state(false);

  // Pan/zoom
  let zoomK = $state(1);
  let zoomX = $state(0);
  let zoomY = $state(0);

  // ----- graph state -----
  // Reactive shallow; positions inside are mutated by d3-force / drag,
  // then `commit()` replaces every node/edge with a fresh reference so
  // Svelte's keyed each re-evaluates per-item bindings (transform, line
  // coords, etc.). Reassigning the array alone is NOT enough — Svelte
  // skips bindings when the inner reference is unchanged.
  let nodes = $state.raw<GardenNode[]>([]);
  let edges = $state.raw<GardenEdge[]>([]);

  function commit() {
    const newNodes = nodes.map((n) => ({ ...n }));
    const idIndex = new Map(newNodes.map((n) => [n.id, n] as const));
    const newEdges: GardenEdge[] = [];
    for (const e of edges) {
      const sId = typeof e.source === "string" ? e.source : e.source.id;
      const tId = typeof e.target === "string" ? e.target : e.target.id;
      const s = idIndex.get(sId);
      const t = idIndex.get(tId);
      if (!s || !t) continue;
      newEdges.push({ source: s, target: t, kind: e.kind });
    }
    nodes = newNodes;
    edges = newEdges;
  }

  // ----- visual encodings -----
  // Each kind gets its own hue. Maturity modulates lightness + saturation:
  // seedling is pale (just sprouting), evergreen is deep, dormant fades to grey.
  const KIND_HUE: Record<GardenKind, number> = {
    note: 217,     // blue
    article: 268,  // violet
    workflow: 32,  // amber/orange
    list: 158,     // emerald
  };
  const MATURITY_MOD: Record<
    Maturity,
    { saturation: number; lightness: number }
  > = {
    seedling: { saturation: 70, lightness: 72 },
    budding: { saturation: 78, lightness: 55 },
    evergreen: { saturation: 70, lightness: 38 },
    dormant: { saturation: 12, lightness: 60 },
  };
  function nodeFill(n: GardenNode): string {
    const hue = KIND_HUE[n.kind];
    const { saturation, lightness } = MATURITY_MOD[n.maturity];
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }
  function kindSwatch(k: GardenKind): string {
    // Mid-maturity swatch for legend chips.
    return `hsl(${KIND_HUE[k]} 78% 55%)`;
  }
  function nodeRadius(n: GardenNode): number {
    return 7 + Math.min(n.degree, 12) * 1.2;
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
  let visibleEdges = $derived.by(() => {
    // Radial is "quantify by kind" — connections live in force/timeline,
    // here they'd just be visual noise crossing between buckets.
    if (layout === "radial") return [] as GardenEdge[];
    return edges.filter((e) => {
      const sId = typeof e.source === "string" ? e.source : e.source.id;
      const tId = typeof e.target === "string" ? e.target : e.target.id;
      return visibleIds.has(sId) && visibleIds.has(tId);
    });
  });
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
  // Count per kind among visible nodes — used for radial cluster labels.
  let kindCounts = $derived.by(() => {
    const c: Record<GardenKind, number> = { note: 0, article: 0, workflow: 0, list: 0 };
    for (const n of visibleNodes) c[n.kind]++;
    return c;
  });
  let radialCenters = $derived({
    note: { cx: width * 0.28, cy: height * 0.34 },
    article: { cx: width * 0.72, cy: height * 0.34 },
    workflow: { cx: width * 0.28, cy: height * 0.7 },
    list: { cx: width * 0.72, cy: height * 0.7 },
  } as Record<GardenKind, { cx: number; cy: number }>);

  // Timeline axes: tick marks + row labels.
  let timelineAxes = $derived.by(() => {
    if (layout !== "timeline") return null;
    const dates = visibleNodes
      .map((n) =>
        n.createdAt
          ? new Date(n.createdAt.replace(" ", "T") + "Z").getTime()
          : 0,
      )
      .filter((t) => t > 0);
    if (dates.length === 0) return null;
    const min = Math.min(...dates);
    const max = Math.max(...dates, Date.now());
    const span = Math.max(max - min, 1);
    const xForTime = (t: number) => 80 + ((t - min) / span) * (width - 160);

    // Choose granularity: weekly if span < 60 days, monthly if span < 3 years,
    // quarterly otherwise.
    const days = span / (24 * 60 * 60 * 1000);
    const granularity: "week" | "month" | "quarter" =
      days < 60 ? "week" : days < 365 * 3 ? "month" : "quarter";

    const markers: { x: number; label: string }[] = [];
    const start = new Date(min);
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    if (granularity === "week") {
      // Start at the most recent Monday on or before min.
      const dow = cursor.getDay() || 7;
      cursor.setDate(cursor.getDate() - (dow - 1));
    } else {
      cursor.setDate(1);
      if (granularity === "quarter") {
        cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3);
      }
    }

    let safety = 0;
    while (cursor.getTime() <= max + 24 * 60 * 60 * 1000 && safety++ < 400) {
      const t = cursor.getTime();
      const x = xForTime(t);
      let label: string;
      if (granularity === "week") {
        label = cursor.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      } else if (granularity === "month") {
        label = cursor.toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        });
      } else {
        const q = Math.floor(cursor.getMonth() / 3) + 1;
        label = `Q${q} ${String(cursor.getFullYear()).slice(2)}`;
      }
      markers.push({ x, label });
      if (granularity === "week") cursor.setDate(cursor.getDate() + 7);
      else if (granularity === "month") cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setMonth(cursor.getMonth() + 3);
    }

    const yByKind: Record<GardenKind, number> = {
      article: 0.2 * height,
      note: 0.4 * height,
      workflow: 0.6 * height,
      list: 0.8 * height,
    };
    return { markers, yByKind };
  });

  // Theme-aware text halo. The stroke acts as a paint-order outline behind
  // text labels so they remain readable when crossing over edges/nodes. In
  // dark mode a white halo would create a hard ring around light text.
  let haloStroke = $derived(
    theme.resolved === "dark" ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.9)",
  );

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

  // Orphan layouts: each mode places degree-0 nodes in a way that matches
  // the rest of the canvas, so switching layouts is visibly different even
  // when most nodes are unconnected.

  function placeOrphansGrid(
    orphans: GardenNode[],
    centerX: number,
    anchorY: number,
  ) {
    if (orphans.length === 0) return;
    const kindOrder: Record<GardenKind, number> = {
      note: 0,
      article: 1,
      workflow: 2,
      list: 3,
    };
    orphans.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9));

    const spacing = 38;
    const cols = Math.max(1, Math.ceil(Math.sqrt(orphans.length * 1.6)));
    const gridWidth = (cols - 1) * spacing;
    const startX = centerX - gridWidth / 2;

    orphans.forEach((node, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      node.x = startX + col * spacing;
      node.y = anchorY + row * spacing;
    });
  }

  // Radial layout: all nodes (connected + orphan) get packed into one
  // tight cluster per kind. Lays out the cluster center per kind in a
  // 2×2 quadrant grid; each cluster uses a sunflower / phyllotactic
  // packing for visual tightness. Returns the per-kind center map so
  // the template can draw labels above each cluster.
  function radialKindCenters(): Record<GardenKind, { cx: number; cy: number }> {
    return {
      note: { cx: width * 0.28, cy: height * 0.34 },
      article: { cx: width * 0.72, cy: height * 0.34 },
      workflow: { cx: width * 0.28, cy: height * 0.7 },
      list: { cx: width * 0.72, cy: height * 0.7 },
    };
  }

  function placeRadialKindClusters(allNodes: GardenNode[]) {
    if (allNodes.length === 0) return;
    const byKind = new Map<GardenKind, GardenNode[]>();
    for (const n of allNodes) {
      const arr = byKind.get(n.kind) ?? [];
      arr.push(n);
      byKind.set(n.kind, arr);
    }
    const centers = radialKindCenters();
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const baseRadius = 18;
    for (const [kind, group] of byKind) {
      const { cx, cy } = centers[kind];
      group.forEach((node, i) => {
        if (i === 0) {
          node.x = cx;
          node.y = cy;
        } else {
          const angle = i * goldenAngle;
          const r = Math.sqrt(i) * baseRadius;
          node.x = cx + Math.cos(angle) * r;
          node.y = cy + Math.sin(angle) * r;
        }
      });
    }
  }

  function placeOrphansTimeline(orphans: GardenNode[]) {
    if (orphans.length === 0) return;
    const yByKind: Record<GardenKind, number> = {
      article: 0.2,
      note: 0.4,
      workflow: 0.6,
      list: 0.8,
    };
    const dates = orphans
      .map((n) =>
        n.createdAt
          ? new Date(n.createdAt.replace(" ", "T") + "Z").getTime()
          : 0,
      )
      .filter((t) => t > 0);
    if (dates.length === 0) {
      // No createdAt info — fall back to grid spread along the row.
      orphans.forEach((node, i) => {
        node.x = 80 + (i / Math.max(1, orphans.length - 1)) * (width - 160);
        node.y = yByKind[node.kind] * height;
      });
      return;
    }
    const min = Math.min(...dates, Date.now());
    const max = Math.max(...dates, Date.now());
    const span = Math.max(max - min, 1);
    for (const n of orphans) {
      if (!n.createdAt) {
        n.x = width / 2;
        n.y = yByKind[n.kind] * height;
        continue;
      }
      const t = new Date(n.createdAt.replace(" ", "T") + "Z").getTime();
      n.x = 80 + ((t - min) / span) * (width - 160);
      n.y = yByKind[n.kind] * height;
    }
  }

  function computeLayout(rawNodes: GardenNode[], rawEdges: GardenEdge[], l: Layout) {
    // Radial mode is "quantify by kind": pack everything into 4 buckets
    // per kind. No force simulation — buckets stay clean even when there
    // are cross-kind links (which still render as lines between clusters).
    if (l === "radial") {
      placeRadialKindClusters(rawNodes);
      return;
    }

    // Split the graph: connected nodes get force-simulated together; orphans
    // get placed in a separate grouped grid so they don't push the connected
    // cluster outward through charge repulsion.
    const connected = rawNodes.filter((n) => n.degree > 0);
    const orphans = rawNodes.filter((n) => n.degree === 0);

    // ----- connected subgraph -----
    if (connected.length > 0) {
      const connectedIds = new Set(connected.map((n) => n.id));
      const connectedEdges = rawEdges.filter((e) => {
        const sId = typeof e.source === "string" ? e.source : e.source.id;
        const tId = typeof e.target === "string" ? e.target : e.target.id;
        return connectedIds.has(sId) && connectedIds.has(tId);
      });

      const chargeStrength = -70 - Math.min(connected.length, 200) * 1.2;
      const sim = forceSimulation<GardenNode>(connected)
        .force(
          "link",
          forceLink<GardenNode, GardenEdge>(connectedEdges)
            .id((d) => d.id)
            .distance((e) => (e.kind === "same-day" ? 70 : 50))
            .strength((e) => (e.kind === "same-day" ? 0.1 : 0.5)),
        )
        .force("charge", forceManyBody().strength(chargeStrength))
        .force(
          "collide",
          forceCollide<GardenNode>().radius((n) => nodeRadius(n) + 5),
        )
        .stop();

      // Only reserve vertical room for the orphan grid in force mode;
      // radial / timeline place orphans on the same coordinate system as
      // connected, so the connected cluster should use the full canvas.
      const orphanReserve =
        l === "force" && orphans.length > 0 ? 80 : 0;
      const centerY = height / 2 - orphanReserve / 2;

      if (l === "force") {
        sim.force("center", forceCenter(width / 2, centerY));
      } else {
        const yByKind: Record<GardenKind, number> = {
          article: 0.2,
          note: 0.4,
          workflow: 0.6,
          list: 0.8,
        };
        const dates = connected
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

      const iterations = Math.min(200, Math.max(60, connected.length * 3));
      for (let i = 0; i < iterations; i++) sim.tick();
    }

    // ----- orphans -----
    if (orphans.length > 0) {
      if (l === "force") {
        // Grid parked below the connected cluster.
        let anchorY = height / 2;
        let anchorX = width / 2;
        if (connected.length > 0) {
          let maxY = -Infinity;
          let sumX = 0;
          for (const n of connected) {
            if ((n.y ?? 0) > maxY) maxY = n.y as number;
            sumX += n.x ?? 0;
          }
          anchorY = maxY + 60;
          anchorX = sumX / connected.length;
        }
        placeOrphansGrid(orphans, anchorX, anchorY);
      } else {
        // Timeline: orphans use the same date/kind axes as connected.
        placeOrphansTimeline(orphans);
      }
    }
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
    // Let derived values settle, then frame the content.
    await tick();
    fitToView();
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
      commit();
      computing = false;
      await tick();
      fitToView();
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
    // WKWebView treats SVG content as selectable by default — suppress the
    // marquee/text-selection visual.
    e.preventDefault();
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
    // Two-step so the change is always visible. fitToView alone is a no-op
    // when the user is already at the fitted position (which is the
    // default after every layout compute) — so snap to canvas defaults
    // first, then on the next frame fit to the actual content. The user
    // always sees the view jump.
    zoomK = 1;
    zoomX = 0;
    zoomY = 0;
    requestAnimationFrame(() => fitToView());
  }

  // Center + scale the canvas so all visible nodes fit with a comfortable
  // margin. Critical UX for sparse graphs: otherwise the user has to
  // hunt-and-zoom to find their content.
  function fitToView() {
    const items = visibleNodes.filter(
      (n) => n.x !== undefined && n.y !== undefined,
    );
    if (items.length === 0) {
      zoomK = 1;
      zoomX = 0;
      zoomY = 0;
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of items) {
      const r = nodeRadius(n) + 12;
      if ((n.x as number) - r < minX) minX = (n.x as number) - r;
      if ((n.y as number) - r < minY) minY = (n.y as number) - r;
      if ((n.x as number) + r > maxX) maxX = (n.x as number) + r;
      if ((n.y as number) + r > maxY) maxY = (n.y as number) + r;
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const pad = 60;
    const kx = (width - pad * 2) / bw;
    const ky = (height - pad * 2) / bh;
    // Clamp: don't zoom past 1× (no weird pixel-level zooming when content
    // is tiny) and respect the user's overall scale range.
    const k = Math.max(0.3, Math.min(1.4, Math.min(kx, ky)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    zoomK = k;
    zoomX = width / 2 - cx * k;
    zoomY = height / 2 - cy * k;
  }

  // ----- node drag (no simulation involved) -----
  let dragId = $state<string | null>(null);
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  // Tracks whether the user actually moved during a drag. Used to suppress
  // the synthetic `click` that fires after pointerup so the inspector
  // doesn't pop open every time the user drags a node.
  let dragMoved = false;
  let suppressNextClick = false;

  function startNodeDrag(node: GardenNode, e: PointerEvent) {
    if (e.button !== 0) return;
    // Stop propagation to avoid kicking off a pan; preventDefault to avoid
    // WKWebView drawing a marquee selection rectangle over the SVG.
    e.stopPropagation();
    e.preventDefault();
    dragId = node.id;
    dragOffsetX = e.clientX;
    dragOffsetY = e.clientY;
    dragMoved = false;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }
  function moveNodeDrag(_node: GardenNode, e: PointerEvent) {
    if (dragId === null || !container) return;
    if (!dragMoved) {
      // Threshold so a tiny twitch doesn't disqualify a click.
      const dx = e.clientX - dragOffsetX;
      const dy = e.clientY - dragOffsetY;
      if (dx * dx + dy * dy > 16) dragMoved = true;
    }
    if (!dragMoved) return;
    // Look up the node by id each move — commit() replaces refs after
    // every render, so the captured `_node` may be stale.
    const target = nodes.find((n) => n.id === dragId);
    if (!target) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    target.x = (cx - zoomX) / zoomK;
    target.y = (cy - zoomY) / zoomK;
    commit();
  }
  function endNodeDrag(e: PointerEvent) {
    if (dragId === null) return;
    if (dragMoved) suppressNextClick = true;
    dragId = null;
    dragMoved = false;
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
    class="absolute inset-0 h-full w-full select-none"
    style="-webkit-user-select: none; touch-action: none;"
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
      <!-- Timeline axes (drawn below edges so they sit in the background). -->
      {#if layout === "timeline" && timelineAxes}
        <g>
          {#each timelineAxes.markers as m (m.x)}
            <line
              x1={m.x}
              y1="40"
              x2={m.x}
              y2={height - 20}
              stroke="currentColor"
              stroke-width="1"
              opacity="0.1"
              class="text-neutral-700 dark:text-neutral-300"
            />
            <text
              x={m.x}
              y="28"
              text-anchor="middle"
              font-size="11"
              fill="currentColor"
              class="pointer-events-none select-none text-neutral-500 dark:text-neutral-400"
              style="paint-order: stroke; stroke: {haloStroke}; stroke-width: 3px;"
            >
              {m.label}
            </text>
          {/each}
          {#each (["article", "note", "workflow", "list"] as GardenKind[]) as k}
            {#if typeFilter[k]}
              <text
                x="18"
                y={timelineAxes.yByKind[k] + 4}
                font-size="11"
                font-weight="600"
                fill="currentColor"
                class="pointer-events-none select-none text-neutral-500 dark:text-neutral-400"
                style="paint-order: stroke; stroke: {haloStroke}; stroke-width: 3px;"
              >
                {k}s
              </text>
            {/if}
          {/each}
        </g>
      {/if}

      <!-- Radial cluster labels. -->
      {#if layout === "radial"}
        <g>
          {#each (["note", "article", "workflow", "list"] as GardenKind[]) as k}
            {#if typeFilter[k] && kindCounts[k] > 0}
              {@const center = radialCenters[k]}
              {@const offset = Math.sqrt(kindCounts[k]) * 18 + 28}
              <text
                x={center.cx}
                y={center.cy - offset}
                text-anchor="middle"
                font-size="13"
                font-weight="600"
                fill="currentColor"
                class="pointer-events-none select-none text-neutral-700 dark:text-neutral-200"
                style="paint-order: stroke; stroke: {haloStroke}; stroke-width: 4px;"
              >
                {k}s
              </text>
              <text
                x={center.cx}
                y={center.cy - offset + 16}
                text-anchor="middle"
                font-size="11"
                fill="currentColor"
                class="pointer-events-none select-none text-neutral-400 dark:text-neutral-500"
                style="paint-order: stroke; stroke: {haloStroke}; stroke-width: 3px;"
              >
                {kindCounts[k]}
                {kindCounts[k] === 1 ? "item" : "items"}
              </text>
            {/if}
          {/each}
        </g>
      {/if}

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
                  if (suppressNextClick) {
                    suppressNextClick = false;
                    return;
                  }
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
                  style="paint-order: stroke; stroke: {haloStroke}; stroke-width: 3px;"
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
    <div class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/40 backdrop-blur-sm dark:bg-neutral-950/40">
      <div class="flex items-center gap-3 rounded-lg border border-neutral-200/70 bg-white/95 px-5 py-3 text-sm font-medium text-neutral-700 shadow-xl dark:border-neutral-700/70 dark:bg-neutral-900/95 dark:text-neutral-200">
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" fill="none" stroke-opacity="0.2" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
        </svg>
        <span>Computing <span class="font-semibold">{layout}</span> layout…</span>
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
          onclick={async () => {
            typeFilter[k] = !typeFilter[k];
            await tick();
            fitToView();
          }}
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
          class="inline-flex items-center gap-1.5 px-2.5 py-1"
          class:bg-emerald-600={layout === l}
          class:text-white={layout === l}
          class:hover:bg-emerald-700={layout === l}
          class:text-neutral-600={layout !== l}
          class:hover:bg-neutral-100={layout !== l}
          class:dark:text-neutral-300={layout !== l}
          class:dark:hover:bg-neutral-800={layout !== l}
          disabled={computing}
          onclick={() => (layout = l)}
        >
          {#if computing && layout === l}
            <svg viewBox="0 0 24 24" class="h-3 w-3 animate-spin" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" fill="none" stroke-opacity="0.3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
            </svg>
          {/if}
          {l}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="rounded-md border border-neutral-300/70 bg-white/85 px-2.5 py-1 text-xs text-neutral-600 shadow-sm backdrop-blur hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:text-neutral-300 dark:hover:bg-neutral-800"
      onclick={resetZoom}
      title="Frame all visible items"
    >
      Fit view
    </button>
  </div>

  <div class="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 rounded-md border border-neutral-300/70 bg-white/85 px-3 py-2 text-[11px] text-neutral-600 shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:text-neutral-300">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block h-3 w-3 rounded-full" style="background: {kindSwatch('note')};"></span>
        note
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block h-3 w-3 rounded-sm" style="background: {kindSwatch('article')};"></span>
        article
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block h-3 w-3 rotate-45" style="background: {kindSwatch('workflow')};"></span>
        workflow
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block h-3 w-3" style="background: {kindSwatch('list')}; clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);"></span>
        list
      </span>
    </div>
    <div class="flex items-center gap-3 opacity-80">
      <span class="uppercase tracking-widest text-neutral-400 dark:text-neutral-500">maturity:</span>
      <span>pale = seedling</span>
      <span aria-hidden="true">→</span>
      <span>deep = evergreen</span>
      <span aria-hidden="true">·</span>
      <span>grey = dormant</span>
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
