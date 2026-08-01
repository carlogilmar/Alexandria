<script lang="ts">
  import {
    Background,
    Controls,
    ConnectionMode,
    SvelteFlow,
    useSvelteFlow,
    getNodesBounds,
    getViewportForBounds,
    type Connection,
    type Edge,
    type Node,
    type NodeTypes,
  } from "@xyflow/svelte";
  import { toPng } from "html-to-image";
  import { save } from "@tauri-apps/plugin-dialog";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { saveBinaryFile, copyImageToClipboard, type StoryboardNode } from "$lib/ipc";
  import StoryBoxNode from "$lib/components/StoryBoxNode.svelte";
  import StoryIconNode from "$lib/components/StoryIconNode.svelte";
  import MapTitleNode from "$lib/components/MapTitleNode.svelte";
  import MapCommentNode from "$lib/components/MapCommentNode.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";
  import IdChip from "$lib/components/IdChip.svelte";

  const flow = useSvelteFlow();
  let canvasEl: HTMLDivElement | undefined = $state();

  // ----- current page -----
  let currentPage = $derived(
    app.storyboardPages.find((p) => p.id === app.currentPageId) ?? null,
  );
  let pageNodes = $derived(
    app.storyboardNodes.filter((n) => n.pageId === app.currentPageId),
  );
  let pageEdges = $derived(
    app.storyboardEdges.filter((e) => e.pageId === app.currentPageId),
  );
  let pageIndex = $derived(
    app.storyboardPages.findIndex((p) => p.id === app.currentPageId),
  );

  // ----- flow arrays (single combined effect) -----
  let flowNodes = $state.raw<Node[]>([]);
  let flowEdges = $state.raw<Edge[]>([]);
  const flowNodeCache = new Map<string, Node>();
  const flowEdgeCache = new Map<string, Edge>();

  const commitContent = (id: number, content: string) =>
    app.updateStoryboardNodeContent(id, content);

  // Which of a node's four handles (t/r/b/l) currently carry an edge — so the
  // node can keep those dots visible and hide the empty ones until hover.
  function handleConn(nodeId: number): Record<string, boolean> {
    const c: Record<string, boolean> = { t: false, r: false, b: false, l: false };
    for (const e of pageEdges) {
      if (e.sourceId === nodeId && e.sourceHandle) c[e.sourceHandle] = true;
      if (e.targetId === nodeId && e.targetHandle) c[e.targetHandle] = true;
    }
    return c;
  }

  function toFlowNode(n: StoryboardNode): Node {
    const base = { id: String(n.id), position: { x: n.x, y: n.y } };
    if (n.kind === "box")
      return { ...base, type: "storyBox", data: { nodeId: n.id, label: n.label, color: n.color, conn: handleConn(n.id) } };
    if (n.kind === "icon")
      return { ...base, type: "storyIcon", data: { nodeId: n.id, label: n.label, icon: n.icon, color: n.color, conn: handleConn(n.id) } };
    if (n.kind === "header")
      return { ...base, type: "title", data: { mapNodeId: n.id, content: n.content ?? "", onCommitContent: commitContent } };
    return { ...base, type: "comment", data: { mapNodeId: n.id, content: n.content ?? "", onCommitContent: commitContent } };
  }
  function toFlowEdge(e: (typeof pageEdges)[number]): Edge {
    return {
      id: String(e.id),
      source: String(e.sourceId),
      target: String(e.targetId),
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      label: e.label ?? undefined,
      animated: true,
      style: "stroke-dasharray: 6 4;",
    };
  }

  const nodeTypes = {
    storyBox: StoryBoxNode,
    storyIcon: StoryIconNode,
    title: MapTitleNode,
    comment: MapCommentNode,
  } as unknown as NodeTypes;

  function sameNode(a: Node, b: Node): boolean {
    return (
      a.type === b.type &&
      a.position.x === b.position.x &&
      a.position.y === b.position.y &&
      (a.data as any).label === (b.data as any).label &&
      (a.data as any).icon === (b.data as any).icon &&
      (a.data as any).color === (b.data as any).color &&
      (a.data as any).content === (b.data as any).content &&
      JSON.stringify((a.data as any).conn) === JSON.stringify((b.data as any).conn)
    );
  }
  function sameEdge(a: Edge, b: Edge): boolean {
    return (
      a.source === b.source &&
      a.target === b.target &&
      a.sourceHandle === b.sourceHandle &&
      a.targetHandle === b.targetHandle &&
      a.label === b.label
    );
  }

  $effect(() => {
    const seenN = new Set<string>();
    const nextNodes = pageNodes.map((n) => {
      const cand = toFlowNode(n);
      seenN.add(cand.id);
      const cached = flowNodeCache.get(cand.id);
      const use = cached && sameNode(cached, cand) ? cached : cand;
      flowNodeCache.set(cand.id, use);
      return use;
    });
    for (const k of flowNodeCache.keys()) if (!seenN.has(k)) flowNodeCache.delete(k);

    const seenE = new Set<string>();
    const nextEdges = pageEdges.map((e) => {
      const cand = toFlowEdge(e);
      seenE.add(cand.id);
      const cached = flowEdgeCache.get(cand.id);
      const use = cached && sameEdge(cached, cand) ? cached : cand;
      flowEdgeCache.set(cand.id, use);
      return use;
    });
    for (const k of flowEdgeCache.keys()) if (!seenE.has(k)) flowEdgeCache.delete(k);

    flowNodes = nextNodes;
    flowEdges = nextEdges;
  });

  let colorMode = $derived<"light" | "dark">(theme.resolved === "dark" ? "dark" : "light");

  function screenToFlow(cx: number, cy: number): { x: number; y: number } {
    if (typeof flow.screenToFlowPosition === "function")
      return flow.screenToFlowPosition({ x: cx, y: cy });
    return { x: 0, y: 0 };
  }

  // ----- interactions -----
  function onNodeDragStop(args: { targetNode: Node | null; nodes: Node[] }) {
    const moved = args.nodes.length > 0 ? args.nodes : args.targetNode ? [args.targetNode] : [];
    for (const n of moved) {
      const id = Number(n.id);
      if (!Number.isFinite(id)) continue;
      const stored = app.storyboardNodes.find((s) => s.id === id);
      if (stored && stored.x === n.position.x && stored.y === n.position.y) continue;
      void app.moveStoryboardNode(id, n.position.x, n.position.y);
    }
  }
  async function onConnect(conn: Connection) {
    const s = Number(conn.source);
    const t = Number(conn.target);
    if (!Number.isFinite(s) || !Number.isFinite(t) || s === t) return;
    const sn = app.storyboardNodes.find((n) => n.id === s);
    const tn = app.storyboardNodes.find((n) => n.id === t);
    const ok = (k?: string) => k === "box" || k === "icon";
    if (!ok(sn?.kind) || !ok(tn?.kind)) return;
    if (pageEdges.some((e) => e.sourceId === s && e.targetId === t)) return;
    if (app.currentPageId === null) return;
    await app.addStoryboardEdge(app.currentPageId, s, t, conn.sourceHandle ?? null, conn.targetHandle ?? null);
  }
  function onDelete(args: { nodes: Node[]; edges: Edge[] }) {
    for (const e of args.edges) {
      const id = Number(e.id);
      if (Number.isFinite(id)) void app.removeStoryboardEdge(id);
    }
    for (const n of args.nodes) {
      const id = Number(n.id);
      if (Number.isFinite(id)) void app.removeStoryboardNode(id);
    }
  }

  // ----- edge label editing -----
  let edgeLabelEdit = $state<{ id: number; x: number; y: number; draft: string } | null>(null);
  let edgeLabelInput: HTMLInputElement | undefined = $state();
  function onEdgeClick(args: { edge: Edge; event: MouseEvent | TouchEvent }) {
    const id = Number(args.edge.id);
    if (!Number.isFinite(id)) return;
    const ev = args.event as MouseEvent;
    const existing = app.storyboardEdges.find((e) => e.id === id);
    edgeLabelEdit = { id, x: ev.clientX, y: ev.clientY, draft: existing?.label ?? "" };
    queueMicrotask(() => { edgeLabelInput?.focus(); edgeLabelInput?.select(); });
  }
  async function commitEdgeLabel() {
    if (!edgeLabelEdit) return;
    const { id, draft } = edgeLabelEdit;
    edgeLabelEdit = null;
    await app.updateStoryboardEdgeLabel(id, draft.trim() || null);
  }
  async function deleteEditedEdge() {
    if (!edgeLabelEdit) return;
    const { id } = edgeLabelEdit;
    edgeLabelEdit = null;
    await app.removeStoryboardEdge(id);
  }

  // ----- adding nodes -----
  function centerFlow(): { x: number; y: number } {
    if (canvasEl) {
      const r = canvasEl.getBoundingClientRect();
      const j = () => (Math.random() - 0.5) * 60;
      return screenToFlow(r.left + r.width / 2 + j(), r.top + r.height / 2 + j());
    }
    return { x: 120, y: 80 };
  }
  async function addBox() {
    if (app.currentPageId === null) return;
    const p = centerFlow();
    await app.addStoryboardBox(app.currentPageId, "Box", p.x, p.y);
  }
  async function addIcon() {
    if (app.currentPageId === null) return;
    const p = centerFlow();
    await app.addStoryboardIcon(app.currentPageId, "box", "Label", p.x, p.y);
  }
  async function addHeader() {
    if (app.currentPageId === null) return;
    const p = centerFlow();
    await app.addStoryboardHeader(app.currentPageId, "Section", p.x, p.y);
  }
  async function addComment() {
    if (app.currentPageId === null) return;
    const p = centerFlow();
    await app.addStoryboardComment(app.currentPageId, "Comment", p.x, p.y);
  }

  // ----- title rename -----
  let editingTitle = $state(false);
  let titleDraft = $state("");
  function startTitle() {
    if (!app.selectedStoryboard) return;
    titleDraft = app.selectedStoryboard.title;
    editingTitle = true;
  }
  function commitTitle() {
    if (!app.selectedStoryboard || !editingTitle) return;
    editingTitle = false;
    const t = titleDraft.trim();
    if (t && t !== app.selectedStoryboard.title)
      void app.renameStoryboard(app.selectedStoryboard.id, t);
  }

  // ----- pages -----
  function movePage(dir: -1 | 1) {
    const ids = app.storyboardPages.map((p) => p.id);
    const i = pageIndex;
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void app.reorderStoryboardPages(ids);
  }

  // ----- canvas / note split (draggable divider + quick modes) -----
  type NoteMode = "diagram" | "split" | "note";
  const NOTE_HEADER = 34; // the divider/header bar
  const NOTE_MIN = NOTE_HEADER + 90; // smallest usable editor
  const CANVAS_MIN = 130; // never crush the canvas below this
  let noteMode = $state<NoteMode>("split");
  let bodyH = $state(0); // measured height of the canvas+note region
  let splitH = $state(260); // note height in "split" mode (persisted, draggable)
  if (typeof localStorage !== "undefined") {
    const v = Number(localStorage.getItem("sbNoteH"));
    if (Number.isFinite(v) && v > 0) splitH = v;
  }
  let noteRegionH = $derived.by(() => {
    if (noteMode === "diagram") return NOTE_HEADER;
    const maxNote = Math.max(NOTE_MIN, bodyH - CANVAS_MIN);
    if (bodyH === 0) return splitH;
    if (noteMode === "note") return maxNote;
    return Math.min(Math.max(splitH, NOTE_MIN), maxNote);
  });
  let noteDrag: { startY: number; startH: number } | null = null;
  function noteDragStart(e: PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    noteMode = "split";
    noteDrag = { startY: e.clientY, startH: noteRegionH };
  }
  function noteDragMove(e: PointerEvent) {
    if (!noteDrag) return;
    const maxNote = Math.max(NOTE_MIN, bodyH - CANVAS_MIN);
    splitH = Math.min(Math.max(noteDrag.startH + (noteDrag.startY - e.clientY), NOTE_MIN), maxNote);
  }
  function noteDragEnd() {
    if (!noteDrag) return;
    noteDrag = null;
    if (typeof localStorage !== "undefined") localStorage.setItem("sbNoteH", String(splitH));
  }

  // ----- PNG export (crop rectangle) — adapted from BlueprintEditor -----
  let exportMode = $state(false);
  let exporting = $state(false);
  let crop = $state({ x: 40, y: 40, w: 400, h: 300 });
  let dragState: {
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
  } | null = null;

  function enterExportMode() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    if (flowNodes.length > 0 && typeof flow.flowToScreenPosition === "function") {
      const bounds = getNodesBounds(flowNodes);
      const tl = flow.flowToScreenPosition({ x: bounds.x, y: bounds.y });
      const br = flow.flowToScreenPosition({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
      const pad = 24;
      let x = Math.max(8, tl.x - rect.left - pad);
      let y = Math.max(8, tl.y - rect.top - pad);
      let w = Math.min(br.x - tl.x + pad * 2, rect.width - x - 8);
      let h = Math.min(br.y - tl.y + pad * 2, rect.height - y - 8);
      crop = w >= 60 && h >= 60 ? { x, y, w, h } : { x: rect.width * 0.15, y: rect.height * 0.15, w: rect.width * 0.7, h: rect.height * 0.7 };
    } else {
      crop = { x: rect.width * 0.15, y: rect.height * 0.15, w: rect.width * 0.7, h: rect.height * 0.7 };
    }
    exportMode = true;
  }
  function cropPointerDown(e: PointerEvent, mode: "move" | "nw" | "ne" | "sw" | "se") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState = { mode, startX: e.clientX, startY: e.clientY, orig: { ...crop } };
  }
  function cropPointerMove(e: PointerEvent) {
    if (!dragState || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const o = dragState.orig;
    const MIN = 60;
    if (dragState.mode === "move") {
      crop = { ...crop, x: Math.min(Math.max(0, o.x + dx), rect.width - o.w), y: Math.min(Math.max(0, o.y + dy), rect.height - o.h) };
      return;
    }
    let { x, y, w, h } = o;
    if (dragState.mode === "nw" || dragState.mode === "sw") {
      const nx = Math.min(Math.max(0, o.x + dx), o.x + o.w - MIN);
      w = o.w + (o.x - nx);
      x = nx;
    } else w = Math.min(Math.max(MIN, o.w + dx), rect.width - o.x);
    if (dragState.mode === "nw" || dragState.mode === "ne") {
      const ny = Math.min(Math.max(0, o.y + dy), o.y + o.h - MIN);
      h = o.h + (o.y - ny);
      y = ny;
    } else h = Math.min(Math.max(MIN, o.h + dy), rect.height - o.y);
    crop = { x, y, w, h };
  }
  function cropPointerUp() { dragState = null; }

  function safeName(raw: string): string {
    const c = raw.trim().replace(/[^\w\d-]+/g, "-").replace(/^-+|-+$/g, "");
    return c || "storyboard";
  }
  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("could not decode image"));
      img.src = src;
    });
  }
  function buildEdgeLayerSvg(
    viewportEl: HTMLElement,
    bounds: { x: number; y: number; width: number; height: number },
    outW: number,
    outH: number,
  ): string | null {
    const paths = viewportEl.querySelectorAll<SVGPathElement>("path.svelte-flow__edge-path");
    if (paths.length === 0) return null;
    let stroke = "#b1b1b7";
    let inner = "";
    for (const p of paths) {
      const d = p.getAttribute("d");
      if (!d) continue;
      const cs = getComputedStyle(p);
      if (cs.stroke && cs.stroke !== "none") stroke = cs.stroke;
      const width = cs.strokeWidth || "1";
      const dash = cs.strokeDasharray && cs.strokeDasharray !== "none" ? cs.strokeDasharray : "6 4";
      inner += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}"/>`;
    }
    if (!inner) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${outW * 2}" height="${outH * 2}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">${inner}</svg>`;
  }
  async function composeCropPng(): Promise<Blob> {
    if (!canvasEl) throw new Error("canvas not ready");
    const viewportEl = canvasEl.querySelector(".svelte-flow__viewport") as HTMLElement | null;
    if (!viewportEl) throw new Error("canvas not ready");
    const rect = canvasEl.getBoundingClientRect();
    const tl = screenToFlow(rect.left + crop.x, rect.top + crop.y);
    const br = screenToFlow(rect.left + crop.x + crop.w, rect.top + crop.y + crop.h);
    const bounds = { x: tl.x, y: tl.y, width: Math.max(1, br.x - tl.x), height: Math.max(1, br.y - tl.y) };
    const outW = Math.max(1, Math.round(bounds.width));
    const outH = Math.max(1, Math.round(bounds.height));
    const viewport = getViewportForBounds(bounds, outW, outH, 0.05, 8, 0);
    const contentUrl = await toPng(viewportEl, {
      width: outW,
      height: outH,
      pixelRatio: 2,
      filter: (node) => !(node instanceof Element && node.classList?.contains("svelte-flow__edges")),
      style: {
        width: `${outW}px`,
        height: `${outH}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });
    const img = await loadImage(contentUrl);
    const edgeSvg = buildEdgeLayerSvg(viewportEl, bounds, outW, outH);
    const edgeImg = edgeSvg ? await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(edgeSvg)) : null;

    const dark = theme.resolved === "dark";
    const MARGIN = 48, RADIUS = 18, SCALE = 2;
    const W = outW + MARGIN * 2, H = outH + MARGIN * 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.scale(SCALE, SCALE);
    const roundedRect = () => { ctx.beginPath(); ctx.roundRect(0.5, 0.5, W - 1, H - 1, RADIUS); };
    roundedRect();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = dark ? "#0a0a0a" : "#fafafa";
    ctx.fillRect(0, 0, W, H);
    const GAP = 20;
    const phase = (v: number) => ((v % GAP) + GAP) % GAP;
    const px = phase(MARGIN - bounds.x), py = phase(MARGIN - bounds.y);
    ctx.fillStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)";
    for (let x = px - GAP; x <= W + GAP; x += GAP)
      for (let y = py - GAP; y <= H + GAP; y += GAP) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
    if (edgeImg) ctx.drawImage(edgeImg, MARGIN, MARGIN, outW, outH);
    ctx.drawImage(img, MARGIN, MARGIN, outW, outH);
    const title = app.selectedStoryboard?.title ?? "";
    if (title) {
      ctx.font = "600 13px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillStyle = dark ? "rgba(229,229,229,0.75)" : "rgba(64,64,64,0.75)";
      ctx.textBaseline = "middle";
      ctx.fillText(title, 20, H - MARGIN / 2);
    }
    ctx.restore();
    roundedRect();
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
    if (!blob) throw new Error("PNG encoding failed");
    return blob;
  }
  async function doExport() {
    if (exporting) return;
    exporting = true;
    try {
      const blob = await composeCropPng();
      const path = await save({
        defaultPath: `${safeName(app.selectedStoryboard?.title ?? "storyboard")}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await saveBinaryFile(path, bytes);
      app.setFlash("PNG exported");
      exportMode = false;
    } catch (e) {
      app.setFlash(`Couldn't export PNG: ${e instanceof Error ? e.message : e}`);
    } finally {
      exporting = false;
    }
  }
  async function doCopy() {
    if (exporting) return;
    exporting = true;
    try {
      const blob = await composeCropPng();
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await copyImageToClipboard(bytes);
      app.setFlash("PNG copied to clipboard");
      exportMode = false;
    } catch (e) {
      app.setFlash(`Couldn't copy PNG: ${e instanceof Error ? e.message : e}`);
    } finally {
      exporting = false;
    }
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && exportMode) exportMode = false;
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="flex h-full flex-col bg-neutral-50 dark:bg-neutral-950">
  <!-- toolbar -->
  <header class="flex items-center gap-3 border-b border-neutral-200/70 px-4 py-2.5 dark:border-neutral-700/70">
    {#if editingTitle}
      <input
        bind:value={titleDraft}
        onblur={commitTitle}
        onkeydown={(e) => { if (e.key === "Enter") commitTitle(); else if (e.key === "Escape") editingTitle = false; }}
        class="rounded border-none bg-transparent px-1 text-lg font-semibold outline-none ring-2 ring-blue-500/40"
      />
    {:else}
      <button type="button" class="text-lg font-semibold tracking-tight text-neutral-900 hover:opacity-70 dark:text-neutral-100" onclick={startTitle}>
        {app.selectedStoryboard?.title ?? "Storyboard"}
      </button>
    {/if}
    {#if app.selectedStoryboard}<IdChip kind="storyboard" id={app.selectedStoryboard.id} />{/if}

    <div class="flex items-center gap-1">
      <button type="button" class="story-add" title="Add box" onclick={addBox}>▢ Box</button>
      <button type="button" class="story-add" title="Add icon" onclick={addIcon}>◉ Icon</button>
      <button type="button" class="story-add" title="Add header" onclick={addHeader}>H Header</button>
      <button type="button" class="story-add" title="Add comment" onclick={addComment}>💬 Comment</button>
    </div>

    <span class="flex-1"></span>
    <span class="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs tabular-nums text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      Page {pageIndex + 1} / {app.storyboardPages.length}
    </span>
    <button type="button" class="story-btn accent" onclick={enterExportMode}>
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M10 3a1 1 0 011 1v7.6l2.3-2.3a1 1 0 011.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L9 11.6V4a1 1 0 011-1zM4 15a1 1 0 011 1h10a1 1 0 112 0 2 2 0 01-2 2H5a2 2 0 01-2-2 1 1 0 011-1z"/></svg>
      Export image
    </button>
  </header>

  <!-- canvas + note share this flexible region (between toolbar and filmstrip) -->
  <div class="flex min-h-0 flex-1 flex-col" bind:clientHeight={bodyH}>
  <!-- canvas -->
  <div class="relative min-h-0 flex-1" bind:this={canvasEl}>
    <SvelteFlow
      bind:nodes={flowNodes}
      bind:edges={flowEdges}
      {nodeTypes}
      {colorMode}
      fitView
      fitViewOptions={{ maxZoom: 1.2, padding: 0.28 }}
      minZoom={0.3}
      maxZoom={1.6}
      connectionMode={ConnectionMode.Loose}
      deleteKey={["Backspace", "Delete"]}
      onnodedragstop={onNodeDragStop}
      onconnect={onConnect}
      ondelete={onDelete}
      onedgeclick={exportMode ? undefined : onEdgeClick}
    >
      <Background />
      {#if !exportMode}<Controls />{/if}
    </SvelteFlow>

    {#if pageNodes.length === 0 && !exportMode}
      <div class="pointer-events-none absolute inset-0 grid place-items-center">
        <p class="text-sm text-neutral-400 dark:text-neutral-500">Empty page — add a box, icon, header or comment above.</p>
      </div>
    {/if}

    <!-- export crop overlay -->
    {#if exportMode}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="absolute inset-0 z-30 overflow-hidden" onpointermove={cropPointerMove} onpointerup={cropPointerUp}>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="sb-crop" style="left: {crop.x}px; top: {crop.y}px; width: {crop.w}px; height: {crop.h}px;" onpointerdown={(e) => cropPointerDown(e, "move")}>
          {#each ["nw", "ne", "sw", "se"] as const as corner (corner)}
            <div class="sb-crop-handle sb-crop-{corner}" onpointerdown={(e) => cropPointerDown(e, corner)}></div>
          {/each}
          <span class="sb-crop-size">{Math.round(crop.w)} × {Math.round(crop.h)}</span>
        </div>
        <div class="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-2">
          <span class="rounded-md bg-neutral-900/80 px-3 py-1.5 text-xs text-white backdrop-blur dark:bg-neutral-100/90 dark:text-neutral-900">Drag the frame around what you want to export</span>
          <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60" disabled={exporting} onclick={doExport}>{exporting ? "Working…" : "Save PNG"}</button>
          <button type="button" class="rounded-md border border-blue-300/70 bg-white/90 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50 disabled:opacity-60 dark:border-blue-700/70 dark:bg-neutral-900/85 dark:text-blue-200" disabled={exporting} onclick={doCopy}>Copy</button>
          <button type="button" class="rounded-md border border-neutral-300/70 bg-white/90 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600/70 dark:bg-neutral-900/85 dark:text-neutral-200" onclick={() => (exportMode = false)}>Cancel</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- note (resizable) -->
  <div
    class="flex shrink-0 flex-col border-t border-neutral-200/70 bg-white dark:border-neutral-700/70 dark:bg-neutral-900"
    style="height: {noteRegionH}px"
  >
    <!-- divider / header: drag to resize, quick modes on the right -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="note-divider"
      onpointerdown={noteDragStart}
      onpointermove={noteDragMove}
      onpointerup={noteDragEnd}
    >
      <span class="note-grip"></span>
      <span class="text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Note</span>
      <span class="flex-1"></span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="note-modes" onpointerdown={(e) => e.stopPropagation()}>
        {#each [["diagram", "Diagram"], ["split", "Split"], ["note", "Note"]] as const as [m, label] (m)}
          <button type="button" class:active={noteMode === m} onclick={() => (noteMode = m)}>{label}</button>
        {/each}
      </div>
    </div>
    {#if noteRegionH > NOTE_HEADER + 8}
      {#key currentPage?.id}
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto max-w-3xl px-6 py-3">
            {#if currentPage}
              <MarkdownEditor
                value={currentPage.note}
                placeholder="Note for this page — supports the full powered markdown."
                minHeight="5rem"
                onCommit={(next) => app.updateStoryboardPageNote(currentPage.id, next)}
              />
            {/if}
          </div>
        </div>
      {/key}
    {/if}
  </div>
  </div>

  <!-- filmstrip -->
  <div class="shrink-0 border-t border-neutral-200/70 bg-neutral-100/60 px-4 pb-2.5 pt-2 dark:border-neutral-700/70 dark:bg-neutral-900/40">
    <div class="flex items-center gap-2 overflow-x-auto pb-1">
      {#each app.storyboardPages as p, i (p.id)}
        {@const active = p.id === app.currentPageId}
        <div
          class="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border transition-colors"
          class:border-blue-500={active}
          class:ring-2={active}
          class:ring-blue-500={active}
          class:border-neutral-200={!active}
          class:dark:border-neutral-700={!active}
          style="background: var(--sb-thumb, #fff);"
        >
          <button
            type="button"
            class="absolute inset-0 flex flex-col justify-between p-2 text-left"
            aria-label="Go to page {i + 1}"
            onclick={() => app.selectStoryboardPage(p.id)}
          >
            <span class="text-[11px] font-bold text-neutral-400 tabular-nums">{i + 1}</span>
            {#if !active}
              <span class="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                {app.storyboardNodes.filter((n) => n.pageId === p.id).length} nodes
              </span>
            {/if}
          </button>
          {#if active}
            <div class="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1.5 bg-black/60 py-1">
              <button type="button" title="Move left" aria-label="Move page left" class="thumb-ctl" onclick={() => movePage(-1)}>‹</button>
              <button type="button" title="Move right" aria-label="Move page right" class="thumb-ctl" onclick={() => movePage(1)}>›</button>
              <button type="button" title="Delete page" aria-label="Delete page" class="thumb-ctl del" onclick={() => app.deleteStoryboardPage(p.id)}>×</button>
            </div>
          {/if}
        </div>
      {/each}
      <button type="button" class="flex h-16 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-neutral-600" onclick={() => app.addStoryboardPage()}>
        <span class="text-lg leading-none">+</span>
        <span class="text-[10px]">Add page</span>
      </button>
    </div>
  </div>
</div>

<!-- floating edge-label input -->
{#if edgeLabelEdit}
  <button type="button" class="fixed inset-0 z-30 cursor-default" aria-label="Close" onclick={() => (edgeLabelEdit = null)}></button>
  <div class="fixed z-40 flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900" style="left: {edgeLabelEdit.x}px; top: {edgeLabelEdit.y}px;">
    <input
      bind:this={edgeLabelInput}
      bind:value={edgeLabelEdit.draft}
      onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commitEdgeLabel(); } else if (e.key === "Escape") edgeLabelEdit = null; }}
      placeholder="edge label"
      class="w-32 rounded border-none bg-transparent px-1.5 py-0.5 text-sm outline-none"
    />
    <button type="button" class="rounded px-1.5 py-0.5 text-xs text-blue-600" onclick={() => void commitEdgeLabel()}>Save</button>
    <button type="button" class="rounded px-1.5 py-0.5 text-xs text-red-500" onclick={() => void deleteEditedEdge()}>Del</button>
  </div>
{/if}

<style>
  :root { --sb-thumb: #fff; }
  :global(html.dark) { --sb-thumb: #1b2027; }
  .story-add {
    font-size: 12px; padding: 4px 8px; border-radius: 7px;
    border: 1px solid #e4e8ec; color: #333; background: transparent; cursor: pointer;
  }
  .story-add:hover { background: rgba(120,120,120,.1); }
  :global(html.dark) .story-add { border-color: #333c46; color: #dfe3e8; }
  .story-btn {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid transparent;
  }
  .story-btn.accent { background: #2563eb; color: #fff; }
  /* draggable divider / note header */
  .note-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    cursor: row-resize;
    border-bottom: 1px solid var(--border, #eceff2);
    background: color-mix(in srgb, currentColor 4%, transparent);
    touch-action: none;
    user-select: none;
    flex: 0 0 auto;
  }
  :global(html.dark) .note-divider { border-bottom-color: #262d35; }
  .note-grip {
    width: 30px;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 22%, transparent);
    flex: 0 0 auto;
  }
  .note-modes {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    cursor: default;
  }
  .note-modes button {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--dim, #6b7280);
    cursor: pointer;
  }
  .note-modes button.active {
    background: #2563eb;
    color: #fff;
  }
  .thumb-ctl {
    width: 20px; height: 18px; border-radius: 5px; border: none; background: rgba(255,255,255,.22);
    color: #fff; font-size: 14px; line-height: 1; cursor: pointer; display: grid; place-items: center;
  }
  .thumb-ctl:hover { background: rgba(255,255,255,.38); }
  .thumb-ctl.del:hover { background: #ef4444; }
  /* crop rectangle */
  .sb-crop {
    position: absolute;
    border: 2px dashed rgb(37, 99, 235);
    border-radius: 4px;
    cursor: move;
    box-shadow: 0 0 0 100000px rgba(0, 0, 0, 0.4);
    touch-action: none;
  }
  .sb-crop-handle {
    position: absolute; width: 14px; height: 14px;
    background: rgb(37, 99, 235); border: 2px solid white; border-radius: 3px; touch-action: none;
  }
  .sb-crop-nw { left: -8px; top: -8px; cursor: nwse-resize; }
  .sb-crop-ne { right: -8px; top: -8px; cursor: nesw-resize; }
  .sb-crop-sw { left: -8px; bottom: -8px; cursor: nesw-resize; }
  .sb-crop-se { right: -8px; bottom: -8px; cursor: nwse-resize; }
  .sb-crop-size {
    position: absolute; left: 4px; bottom: 4px; padding: 1px 6px; border-radius: 4px;
    background: rgba(37, 99, 235, 0.9); color: white; font-size: 10px;
    font-family: ui-monospace, monospace; pointer-events: none;
  }
</style>
