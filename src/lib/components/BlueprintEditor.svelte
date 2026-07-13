<script lang="ts">
  import {
    Background,
    ConnectionMode,
    Controls,
    SelectionMode,
    MiniMap,
    SvelteFlow,
    getNodesBounds,
    getViewportForBounds,
    useSvelteFlow,
    type Connection,
    type Edge,
    type Node,
    type NodeTypes,
  } from "@xyflow/svelte";
  import { toPng } from "html-to-image";
  import { save } from "@tauri-apps/plugin-dialog";
  import { app } from "$lib/stores/app.svelte";
  import {
    saveBinaryFile,
    saveImageFile,
    type BlueprintEdge,
    type BlueprintNode,
  } from "$lib/ipc";
  import BlueprintCardNode from "$lib/components/BlueprintCardNode.svelte";
  import IdChip from "$lib/components/IdChip.svelte";
  import MapTextNode from "$lib/components/MapTextNode.svelte";
  import MapCommentNode from "$lib/components/MapCommentNode.svelte";
  import MapTitleNode from "$lib/components/MapTitleNode.svelte";
  import { theme } from "$lib/stores/theme.svelte";

  // useSvelteFlow only works inside SvelteFlowProvider — BlueprintView wraps us.
  const flow = useSvelteFlow();

  let flowNodes = $state.raw<Node[]>([]);
  let flowEdges = $state.raw<Edge[]>([]);

  // Stable persistence callbacks handed to the shared decorative node
  // components (MapTextNode / MapCommentNode / MapTitleNode). Defined once so
  // node object identity comparisons stay meaningful across rebuilds.
  const commitNodeContent = (nodeId: number, content: string) =>
    app.updateBlueprintNodeContent(nodeId, content);
  const persistResize = (nodeId: number, width: number, height: number) =>
    app.resizeBlueprintNode(nodeId, width, height);

  function toFlowNode(n: BlueprintNode): Node {
    if (n.kind === "card") {
      return {
        id: String(n.id),
        type: "bpCard",
        position: { x: n.x, y: n.y },
        width: n.width ?? 240,
        // No default height: the card auto-sizes to its text. A persisted
        // height (after a manual NodeResizer drag) still wins.
        height: n.height ?? undefined,
        data: {
          nodeId: n.id,
          title: n.title,
          description: n.description,
          color: n.color,
          imageUrl: n.imageUrl,
        },
      };
    }
    if (n.kind === "text") {
      return {
        id: String(n.id),
        type: "textNote",
        position: { x: n.x, y: n.y },
        width: n.width ?? 220,
        height: n.height ?? 90,
        data: {
          mapNodeId: n.id,
          content: n.content ?? "",
          onCommitContent: commitNodeContent,
          onResizeEnd: persistResize,
        },
      };
    }
    if (n.kind === "comment") {
      return {
        id: String(n.id),
        type: "comment",
        position: { x: n.x, y: n.y },
        data: {
          mapNodeId: n.id,
          content: n.content ?? "",
          onCommitContent: commitNodeContent,
        },
      };
    }
    return {
      id: String(n.id),
      type: "title",
      position: { x: n.x, y: n.y },
      data: {
        mapNodeId: n.id,
        content: n.content ?? "",
        onCommitContent: commitNodeContent,
      },
    };
  }

  function toFlowEdge(e: BlueprintEdge): Edge {
    return {
      id: String(e.id),
      source: String(e.sourceId),
      target: String(e.targetId),
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      label: e.label ?? undefined,
      // Marching dotted line — reads as "flow" on a design canvas. No arrow
      // heads: the motion already conveys direction.
      animated: true,
      style: "stroke-dasharray: 6 4;",
    };
  }

  const nodeTypes: NodeTypes = {
    bpCard: BlueprintCardNode as unknown as NodeTypes[string],
    textNote: MapTextNode as unknown as NodeTypes[string],
    comment: MapCommentNode as unknown as NodeTypes[string],
    title: MapTitleNode as unknown as NodeTypes[string],
  };

  // Reactive sync from store → local flow arrays. Same discipline as
  // MapEditor (Sprint 12): nodes and edges are reassigned together in ONE
  // effect, and unchanged items keep their object identity via the caches so
  // xyflow's reconciler can short-circuit.
  const flowNodeCache = new Map<string, Node>();
  const flowEdgeCache = new Map<string, Edge>();

  function sameNode(a: Node, b: Node): boolean {
    if (a.id !== b.id) return false;
    if (a.type !== b.type) return false;
    if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;
    if (a.width !== b.width || a.height !== b.height) return false;
    const ad = a.data as Record<string, unknown>;
    const bd = b.data as Record<string, unknown>;
    if (ad.content !== bd.content) return false;
    if (ad.title !== bd.title) return false;
    if (ad.description !== bd.description) return false;
    if (ad.color !== bd.color) return false;
    if (ad.imageUrl !== bd.imageUrl) return false;
    return true;
  }
  function sameEdge(a: Edge, b: Edge): boolean {
    return (
      a.id === b.id &&
      a.source === b.source &&
      a.target === b.target &&
      a.sourceHandle === b.sourceHandle &&
      a.targetHandle === b.targetHandle &&
      a.label === b.label
    );
  }

  $effect(() => {
    if (!app.selectedBlueprint) return;

    const nextNodes: Node[] = [];
    const seenNodeIds = new Set<string>();
    for (const n of app.blueprintNodes) {
      const candidate = toFlowNode(n);
      const cached = flowNodeCache.get(candidate.id);
      const chosen = cached && sameNode(cached, candidate) ? cached : candidate;
      flowNodeCache.set(chosen.id, chosen);
      seenNodeIds.add(chosen.id);
      nextNodes.push(chosen);
    }
    for (const id of [...flowNodeCache.keys()]) {
      if (!seenNodeIds.has(id)) flowNodeCache.delete(id);
    }

    const nextEdges: Edge[] = [];
    const seenEdgeIds = new Set<string>();
    for (const e of app.blueprintEdges) {
      const candidate = toFlowEdge(e);
      const cached = flowEdgeCache.get(candidate.id);
      const chosen = cached && sameEdge(cached, candidate) ? cached : candidate;
      flowEdgeCache.set(chosen.id, chosen);
      seenEdgeIds.add(chosen.id);
      nextEdges.push(chosen);
    }
    for (const id of [...flowEdgeCache.keys()]) {
      if (!seenEdgeIds.has(id)) flowEdgeCache.delete(id);
    }

    flowNodes = nextNodes;
    flowEdges = nextEdges;
  });

  // ----- persistence -----
  function onNodeDragStop(args: { targetNode: Node | null; nodes: Node[] }) {
    // A drag can move a whole selection (shift+drag box, then drag any
    // member) — persist every dragged node, not just the one under the
    // cursor, or the rest snap back on reload.
    const moved = args.nodes.length > 0 ? args.nodes : args.targetNode ? [args.targetNode] : [];
    for (const n of moved) {
      const id = Number(n.id);
      if (!Number.isFinite(id)) continue;
      const stored = app.blueprintNodes.find((s) => s.id === id);
      if (stored && stored.x === n.position.x && stored.y === n.position.y) continue;
      void app.moveBlueprintNode(id, n.position.x, n.position.y);
    }
  }

  async function onConnect(connection: Connection) {
    const sourceId = Number(connection.source);
    const targetId = Number(connection.target);
    if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) return;
    if (sourceId === targetId) return;
    // The DB enforces UNIQUE(source, target) — skip duplicates regardless of
    // which handles were used.
    if (
      app.blueprintEdges.some(
        (e) => e.sourceId === sourceId && e.targetId === targetId,
      )
    ) {
      return;
    }
    await app.addBlueprintEdge(
      sourceId,
      targetId,
      connection.sourceHandle ?? null,
      connection.targetHandle ?? null,
    );
  }

  function onDelete(args: { nodes: Node[]; edges: Edge[] }) {
    for (const e of args.edges) {
      const id = Number(e.id);
      if (Number.isFinite(id)) void app.removeBlueprintEdge(id);
    }
    for (const n of args.nodes) {
      const id = Number(n.id);
      if (Number.isFinite(id)) void app.removeBlueprintNode(id);
    }
  }

  // ----- edge label editing (click an edge) -----
  let edgeLabelEdit = $state<{
    id: number;
    x: number;
    y: number;
    draft: string;
  } | null>(null);
  let edgeLabelInput: HTMLInputElement | undefined = $state();

  function onEdgeClick(args: { edge: Edge; event: MouseEvent | TouchEvent }) {
    const id = Number(args.edge.id);
    if (!Number.isFinite(id)) return;
    const ev = args.event as MouseEvent;
    const existing = app.blueprintEdges.find((e) => e.id === id);
    edgeLabelEdit = {
      id,
      x: ev.clientX,
      y: ev.clientY,
      draft: existing?.label ?? "",
    };
    queueMicrotask(() => {
      edgeLabelInput?.focus();
      edgeLabelInput?.select();
    });
  }
  async function commitEdgeLabel() {
    if (!edgeLabelEdit) return;
    const { id, draft } = edgeLabelEdit;
    edgeLabelEdit = null;
    const label = draft.trim();
    const existing = app.blueprintEdges.find((e) => e.id === id);
    if ((existing?.label ?? "") === label) return;
    await app.updateBlueprintEdgeLabel(id, label || null);
  }
  function onEdgeLabelKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitEdgeLabel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      edgeLabelEdit = null;
    }
  }
  async function deleteEditedEdge() {
    if (!edgeLabelEdit) return;
    const { id } = edgeLabelEdit;
    edgeLabelEdit = null;
    await app.removeBlueprintEdge(id);
  }

  // ----- adding nodes -----
  let svelteFlowEl: HTMLDivElement | undefined = $state();

  function screenToFlow(clientX: number, clientY: number): { x: number; y: number } {
    if (typeof flow.screenToFlowPosition === "function") {
      return flow.screenToFlowPosition({ x: clientX, y: clientY });
    }
    if (!svelteFlowEl) return { x: 0, y: 0 };
    const rect = svelteFlowEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  let cascadeIndex = 0;
  function nextCascadePosition(): { x: number; y: number } {
    if (!svelteFlowEl) return { x: 0, y: 0 };
    const rect = svelteFlowEl.getBoundingClientRect();
    const center = screenToFlow(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const step = 36;
    const i = cascadeIndex++;
    const angle = i * 0.9;
    const radius = step + Math.sqrt(i) * step * 0.7;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  }

  async function handleAddCard() {
    const pos = nextCascadePosition();
    await app.addBlueprintCard("New card", pos.x, pos.y);
  }
  async function handleAddDecorative(kind: "text" | "comment" | "title") {
    const pos = nextCascadePosition();
    await app.addBlueprintDecorative(kind, "", pos.x, pos.y);
  }

  // ----- paste images onto the canvas -----
  // Last cursor position over the canvas, so a pasted image lands where you're
  // pointing rather than always at center.
  let lastPointer: { x: number; y: number } | null = null;

  async function onCanvasPaste(e: ClipboardEvent) {
    if (!app.selectedBlueprint) return;
    // Don't hijack paste while editing a node's title/description or any input.
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable)
    ) {
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    try {
      const drop = lastPointer
        ? screenToFlow(lastPointer.x, lastPointer.y)
        : nextCascadePosition();
      for (let i = 0; i < files.length; i++) {
        const url = await saveImageFile(files[i]);
        // Display width from the image's natural size, clamped to a sane
        // range; height stays auto so the card matches the image's aspect.
        let width = 260;
        try {
          const img = await loadImage(url);
          width = Math.round(Math.min(360, Math.max(140, img.naturalWidth)));
        } catch {
          /* keep the default width */
        }
        await app.addBlueprintImageCard(
          url,
          drop.x + i * 24,
          drop.y + i * 24,
          width,
        );
      }
    } catch (err) {
      app.setFlash(`Couldn't paste image: ${err}`);
    }
  }

  // ----- PNG export (crop rectangle) -----
  let exportMode = $state(false);
  let exporting = $state(false);
  // Crop rect in container-relative screen pixels.
  let crop = $state({ x: 40, y: 40, w: 400, h: 300 });
  let dragState: {
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
  } | null = null;

  function enterExportMode() {
    if (!svelteFlowEl) return;
    const rect = svelteFlowEl.getBoundingClientRect();
    // Pre-fit the rectangle to the bounding box of all nodes — "export
    // everything" with zero drags; adjust only to export a section.
    if (flowNodes.length > 0 && typeof flow.flowToScreenPosition === "function") {
      const bounds = getNodesBounds(flowNodes);
      const tl = flow.flowToScreenPosition({ x: bounds.x, y: bounds.y });
      const br = flow.flowToScreenPosition({
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height,
      });
      const pad = 24;
      let x = tl.x - rect.left - pad;
      let y = tl.y - rect.top - pad;
      let w = br.x - tl.x + pad * 2;
      let h = br.y - tl.y + pad * 2;
      // Clamp into the visible container.
      x = Math.max(8, x);
      y = Math.max(8, y);
      w = Math.min(w, rect.width - x - 8);
      h = Math.min(h, rect.height - y - 8);
      if (w >= 60 && h >= 60) {
        crop = { x, y, w, h };
      } else {
        crop = {
          x: rect.width * 0.15,
          y: rect.height * 0.15,
          w: rect.width * 0.7,
          h: rect.height * 0.7,
        };
      }
    } else {
      crop = {
        x: rect.width * 0.15,
        y: rect.height * 0.15,
        w: rect.width * 0.7,
        h: rect.height * 0.7,
      };
    }
    exportMode = true;
  }

  function cropPointerDown(
    e: PointerEvent,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...crop },
    };
  }
  function cropPointerMove(e: PointerEvent) {
    if (!dragState || !svelteFlowEl) return;
    const rect = svelteFlowEl.getBoundingClientRect();
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const o = dragState.orig;
    const MIN = 60;
    if (dragState.mode === "move") {
      crop = {
        ...crop,
        x: Math.min(Math.max(0, o.x + dx), rect.width - o.w),
        y: Math.min(Math.max(0, o.y + dy), rect.height - o.h),
      };
      return;
    }
    let { x, y, w, h } = o;
    if (dragState.mode === "nw" || dragState.mode === "sw") {
      const nx = Math.min(Math.max(0, o.x + dx), o.x + o.w - MIN);
      w = o.w + (o.x - nx);
      x = nx;
    } else {
      w = Math.min(Math.max(MIN, o.w + dx), rect.width - o.x);
    }
    if (dragState.mode === "nw" || dragState.mode === "ne") {
      const ny = Math.min(Math.max(0, o.y + dy), o.y + o.h - MIN);
      h = o.h + (o.y - ny);
      y = ny;
    } else {
      h = Math.min(Math.max(MIN, o.h + dy), rect.height - o.y);
    }
    crop = { x, y, w, h };
  }
  function cropPointerUp() {
    dragState = null;
  }

  function safeName(raw: string): string {
    const cleaned = raw.trim().replace(/[^\w\d-]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned || "blueprint";
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("could not decode the rendered image"));
      img.src = src;
    });
  }

  // Pasted images render via the Tauri asset protocol (convertFileSrc). When
  // html-to-image re-fetches them inside its clone, a cross-origin/tainted
  // response would make the export canvas throw on toBlob. We pre-empt that:
  // fetch each image ourselves and swap its src for an inline data: URI for
  // the duration of the capture, then restore. Best-effort — a failed fetch
  // just leaves the original src (html-to-image then does its own attempt).
  async function inlineImagesForCapture(
    root: HTMLElement,
  ): Promise<() => void> {
    const imgs = Array.from(root.querySelectorAll("img"));
    const restores: Array<() => void> = [];
    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute("src");
        if (!src || src.startsWith("data:")) return;
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = () => reject(new Error("read failed"));
            fr.readAsDataURL(blob);
          });
          img.setAttribute("src", dataUrl);
          restores.push(() => img.setAttribute("src", src));
        } catch {
          /* leave the original src in place */
        }
      }),
    );
    return () => restores.forEach((r) => r());
  }

  // Edges are rendered by xyflow as zero-sized `overflow: visible` SVGs —
  // a pattern WKWebView clips when html-to-image re-renders it inside a
  // foreignObject, which silently dropped every connection from the export.
  // So we exclude them from the DOM capture and rebuild the edge layer
  // ourselves: read each edge path's `d` (already in flow coordinates) and
  // serialize a properly-sized SVG with a real viewBox.
  function buildEdgeLayerSvg(
    viewportEl: HTMLElement,
    bounds: { x: number; y: number; width: number; height: number },
    outW: number,
    outH: number,
  ): string | null {
    const paths = viewportEl.querySelectorAll<SVGPathElement>(
      "path.svelte-flow__edge-path",
    );
    if (paths.length === 0) return null;
    let stroke = "#b1b1b7";
    let inner = "";
    for (const p of paths) {
      const d = p.getAttribute("d");
      if (!d) continue;
      const cs = getComputedStyle(p);
      if (cs.stroke && cs.stroke !== "none") stroke = cs.stroke;
      const width = cs.strokeWidth || "1";
      const dash =
        cs.strokeDasharray && cs.strokeDasharray !== "none"
          ? cs.strokeDasharray
          : "6 4";
      inner += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}"/>`;
    }
    if (!inner) return null;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${outW * 2}" height="${outH * 2}" ` +
      `viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">${inner}</svg>`
    );
  }

  // Renders the crop region into the composed "card style" PNG and returns
  // the encoded blob. Shared by both Save (file dialog) and Copy (clipboard).
  async function composeCropPng(): Promise<Blob> {
    if (!svelteFlowEl) throw new Error("canvas not ready");
    const viewportEl = svelteFlowEl.querySelector(
      ".svelte-flow__viewport",
    ) as HTMLElement | null;
    if (!viewportEl) throw new Error("canvas not ready");
    const restoreImgs = await inlineImagesForCapture(viewportEl);
    try {
      const rect = svelteFlowEl.getBoundingClientRect();
      const tl = screenToFlow(rect.left + crop.x, rect.top + crop.y);
      const br = screenToFlow(rect.left + crop.x + crop.w, rect.top + crop.y + crop.h);
      const bounds = {
        x: tl.x,
        y: tl.y,
        width: Math.max(1, br.x - tl.x),
        height: Math.max(1, br.y - tl.y),
      };
      // Render at flow scale 1 regardless of the current zoom, 2× pixels.
      const outW = Math.max(1, Math.round(bounds.width));
      const outH = Math.max(1, Math.round(bounds.height));
      const viewport = getViewportForBounds(bounds, outW, outH, 0.05, 8, 0);
      // Transparent capture of just the nodes/edges — the "card" (background,
      // dot grid, margin, border, title) is composed below so the PNG looks
      // like the canvas, not a raw crop.
      const contentUrl = await toPng(viewportEl, {
        width: outW,
        height: outH,
        pixelRatio: 2,
        // The edge SVGs are excluded here and composed manually below —
        // see buildEdgeLayerSvg for why.
        filter: (node) =>
          !(
            node instanceof Element &&
            node.classList?.contains("svelte-flow__edges")
          ),
        style: {
          width: `${outW}px`,
          height: `${outH}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });
      const img = await loadImage(contentUrl);
      const edgeSvg = buildEdgeLayerSvg(viewportEl, bounds, outW, outH);
      const edgeImg = edgeSvg
        ? await loadImage(
            "data:image/svg+xml;charset=utf-8," + encodeURIComponent(edgeSvg),
          )
        : null;

      const dark = theme.resolved === "dark";
      const MARGIN = 48;
      const RADIUS = 18;
      const SCALE = 2;
      const W = outW + MARGIN * 2;
      const H = outH + MARGIN * 2;
      const canvas = document.createElement("canvas");
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.scale(SCALE, SCALE);

      // Card shape: rounded rect, transparent outside.
      const roundedRect = () => {
        ctx.beginPath();
        ctx.roundRect(0.5, 0.5, W - 1, H - 1, RADIUS);
      };
      roundedRect();
      ctx.save();
      ctx.clip();

      // Flat background + the canvas's dot grid, phase-aligned to the flow
      // coordinates so dots line up with where nodes sat on screen.
      ctx.fillStyle = dark ? "#0a0a0a" : "#fafafa";
      ctx.fillRect(0, 0, W, H);
      const GAP = 20;
      const phase = (v: number) => ((v % GAP) + GAP) % GAP;
      const px = phase(MARGIN - bounds.x);
      const py = phase(MARGIN - bounds.y);
      ctx.fillStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)";
      for (let x = px - GAP; x <= W + GAP; x += GAP) {
        for (let y = py - GAP; y <= H + GAP; y += GAP) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Edge layer first (under the nodes), then the captured nodes,
      // both inset by the margin.
      if (edgeImg) ctx.drawImage(edgeImg, MARGIN, MARGIN, outW, outH);
      ctx.drawImage(img, MARGIN, MARGIN, outW, outH);

      // Blueprint title, bottom-left corner of the card.
      const title = app.selectedBlueprint?.title ?? "";
      if (title) {
        ctx.font =
          "600 13px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
        ctx.fillStyle = dark ? "rgba(229,229,229,0.75)" : "rgba(64,64,64,0.75)";
        ctx.textBaseline = "middle";
        ctx.fillText(title, 20, H - MARGIN / 2);
      }
      ctx.restore();

      // Hairline border on the card edge.
      roundedRect();
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) throw new Error("PNG encoding failed");
      return blob;
    } finally {
      restoreImgs();
    }
  }

  async function doExport() {
    if (exporting) return;
    exporting = true;
    try {
      const blob = await composeCropPng();
      const path = await save({
        defaultPath: `${safeName(app.selectedBlueprint?.title ?? "blueprint")}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return; // user cancelled the dialog
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
      // WKWebView (modern macOS) supports async clipboard image writes. The
      // click on the Copy button is the required user gesture.
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      app.setFlash("PNG copied to clipboard");
      exportMode = false;
    } catch (e) {
      app.setFlash(`Couldn't copy PNG: ${e instanceof Error ? e.message : e}`);
    } finally {
      exporting = false;
    }
  }

  // ----- presenter view -----
  // A read-only-feeling "stage" mode for screen-sharing: authoring chrome
  // hides, the backdrop swaps to a stage gradient, and hovering any node
  // spotlights it (all others dim). Pure CSS off the `bp-presenting` class —
  // no node-data changes, so the identity caches stay intact.
  let presenting = $state(false);

  let stageBg = $derived(
    theme.resolved === "dark"
      ? "radial-gradient(circle at 50% -10%, #1b2540 0%, #0a0e1a 65%)"
      : "radial-gradient(circle at 50% -10%, #eef2fb 0%, #dde5f3 72%)",
  );

  function togglePresenting() {
    presenting = !presenting;
    if (presenting) exportMode = false;
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && presenting) presenting = false;
  }

  let colorMode = $derived<"light" | "dark">(
    theme.resolved === "dark" ? "dark" : "light",
  );

  // Icon-only toolbar buttons — the name lives in each button's `title`
  // tooltip. Square padding, no label text, so the cluster stays compact as
  // it grows.
  const addBtn =
    "inline-flex items-center justify-center rounded-md border border-neutral-300/70 bg-white/90 p-2 text-neutral-700 shadow-sm backdrop-blur hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/85 dark:text-neutral-200 dark:hover:bg-neutral-800";
</script>

<svelte:window onkeydown={onWindowKey} onpaste={onCanvasPaste} />

<div
  bind:this={svelteFlowEl}
  class="relative h-full w-full bg-neutral-50 dark:bg-neutral-950"
  class:bp-presenting={presenting}
  style={presenting ? `background: ${stageBg};` : ""}
  role="application"
  aria-label="Blueprint canvas"
  onpointermove={(e) => (lastPointer = { x: e.clientX, y: e.clientY })}
>
  {#if app.blueprintLoading}
    <div class="absolute inset-0 z-10 flex items-center justify-center">
      <p class="text-sm text-neutral-500">Loading the blueprint…</p>
    </div>
  {:else if app.blueprintNodes.length === 0}
    <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8 text-center">
      <div class="max-w-md rounded-xl border border-sky-200/60 bg-white/80 px-6 py-5 text-sm text-neutral-600 backdrop-blur dark:border-sky-900/40 dark:bg-neutral-900/80 dark:text-neutral-300">
        <p class="mb-2 text-base font-semibold text-sky-700 dark:text-sky-300">
          {app.selectedBlueprint?.title ?? "Blueprint"}
        </p>
        <p>
          Add a <strong>Card</strong> (top-right) for each part of your design,
          then drag from one card's edge to another to connect them. Cards
          connect from any side — flow left→right or top→bottom.
        </p>
      </div>
    </div>
  {/if}

  <SvelteFlow
    bind:nodes={flowNodes}
    bind:edges={flowEdges}
    {nodeTypes}
    fitView
    fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
    minZoom={0.3}
    maxZoom={1.5}
    colorMode={colorMode}
    connectionMode={ConnectionMode.Loose}
    selectionMode={SelectionMode.Partial}
    onnodedragstop={onNodeDragStop}
    onconnect={onConnect}
    ondelete={onDelete}
    onedgeclick={onEdgeClick}
    deleteKey={["Backspace", "Delete"]}
  >
    <Background />
    <Controls />
    <MiniMap pannable zoomable />
  </SvelteFlow>

  <!-- Blueprint title + copyable reference chip (top-left) -->
  <div class="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2">
    <span class="rounded-md border border-neutral-200/70 bg-white/85 px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/85 dark:text-neutral-200">
      {app.selectedBlueprint?.title ?? ""}
    </span>
    {#if app.selectedBlueprint}
      <span class="pointer-events-auto">
        <IdChip kind="blueprint" id={app.selectedBlueprint.id} />
      </span>
    {/if}
  </div>

  <!-- Add-affordance cluster (top-right) -->
  {#if !exportMode && !presenting}
    <div class="absolute right-4 top-4 z-20 flex items-start gap-2">
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md border border-sky-300/70 bg-sky-50/90 p-2 text-sky-800 shadow-sm backdrop-blur hover:bg-sky-100 dark:border-sky-800/70 dark:bg-sky-950/70 dark:text-sky-200 dark:hover:bg-sky-900"
        onclick={handleAddCard}
        title="Add a design card (title + description + color)"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
        </svg>
      </button>
      <button
        type="button"
        class={addBtn}
        onclick={() => handleAddDecorative("title")}
        title="Drop a section title"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path d="M4 3a1 1 0 011 1v5h10V4a1 1 0 112 0v12a1 1 0 11-2 0v-5H5v5a1 1 0 11-2 0V4a1 1 0 011-1z"/>
        </svg>
      </button>
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md border border-amber-300/70 bg-amber-50/90 p-2 text-amber-800 shadow-sm backdrop-blur hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-950/70 dark:text-amber-200 dark:hover:bg-amber-900"
        onclick={() => handleAddDecorative("text")}
        title="Drop a yellow sticky note"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path d="M4 4a2 2 0 012-2h10a2 2 0 012 2v9.586a1 1 0 01-.293.707l-3.414 3.414A1 1 0 0111.586 18H6a2 2 0 01-2-2V4zm10 11h2v-2h-2v2z" />
        </svg>
      </button>
      <button
        type="button"
        class={addBtn}
        onclick={() => handleAddDecorative("comment")}
        title="Drop a free-form comment"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M3 4a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-3.586l-2.707 2.707A1 1 0 017 16v-2H5a2 2 0 01-2-2V4zm4 4a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>
        </svg>
      </button>
      <span class="h-7 w-px self-center bg-neutral-200/80 dark:bg-neutral-700/80"></span>
      <button
        type="button"
        class={addBtn}
        onclick={enterExportMode}
        title="Export or copy a region of the canvas as a PNG"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
        </svg>
      </button>
      <span class="h-7 w-px self-center bg-neutral-200/80 dark:bg-neutral-700/80"></span>
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md border border-violet-300/70 bg-violet-50/90 p-2 text-violet-800 shadow-sm backdrop-blur hover:bg-violet-100 dark:border-violet-800/70 dark:bg-violet-950/70 dark:text-violet-200 dark:hover:bg-violet-900"
        onclick={togglePresenting}
        title="Presenter view — hover a box to spotlight it while screen-sharing"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2h-4v1h2a1 1 0 110 2H8a1 1 0 110-2h2v-1H6a2 2 0 01-2-2V5zm2 0v7h12V5H4z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  {/if}

  <!-- Presenter view: minimal exit control + hover hint -->
  {#if presenting}
    <div class="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-2">
      <span class="rounded-md bg-neutral-900/75 px-3 py-1.5 text-xs text-white backdrop-blur dark:bg-neutral-100/85 dark:text-neutral-900">
        Presenter view — hover a box to spotlight it
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-violet-300/70 bg-white/90 px-3 py-1.5 text-xs font-semibold text-violet-800 shadow-sm backdrop-blur hover:bg-violet-50 dark:border-violet-700/70 dark:bg-neutral-900/85 dark:text-violet-200 dark:hover:bg-neutral-800"
        onclick={togglePresenting}
        title="Exit presenter view (Esc)"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
        Exit
      </button>
    </div>
  {/if}

  <!-- Export mode: dimmed overlay with a movable / resizable crop rect. -->
  {#if exportMode}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute inset-0 z-30 overflow-hidden"
      onpointermove={cropPointerMove}
      onpointerup={cropPointerUp}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bp-crop"
        style="left: {crop.x}px; top: {crop.y}px; width: {crop.w}px; height: {crop.h}px;"
        onpointerdown={(e) => cropPointerDown(e, "move")}
      >
        {#each ["nw", "ne", "sw", "se"] as const as corner (corner)}
          <div
            class="bp-crop-handle bp-crop-{corner}"
            onpointerdown={(e) => cropPointerDown(e, corner)}
          ></div>
        {/each}
        <span class="bp-crop-size">{Math.round(crop.w)} × {Math.round(crop.h)}</span>
      </div>

      <div class="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-2">
        <span class="rounded-md bg-neutral-900/80 px-3 py-1.5 text-xs text-white backdrop-blur dark:bg-neutral-100/90 dark:text-neutral-900">
          Drag the frame around what you want to export
        </span>
        <button
          type="button"
          class="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          disabled={exporting}
          onclick={doExport}
        >
          {exporting ? "Working…" : "Save PNG"}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-sky-300/70 bg-white/90 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm backdrop-blur hover:bg-sky-50 disabled:opacity-60 dark:border-sky-700/70 dark:bg-neutral-900/85 dark:text-sky-200 dark:hover:bg-neutral-800"
          disabled={exporting}
          onclick={doCopy}
          title="Copy the framed region to the clipboard"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path d="M7 3a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V7.414A2 2 0 0014.414 6L12 3.586A2 2 0 0010.586 3H7z"/>
            <path d="M3 7a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          </svg>
          Copy
        </button>
        <button
          type="button"
          class="rounded-md border border-neutral-300/70 bg-white/90 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600/70 dark:bg-neutral-900/85 dark:text-neutral-200 dark:hover:bg-neutral-800"
          onclick={() => (exportMode = false)}
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <!-- Floating edge-label editor -->
  {#if edgeLabelEdit}
    <div
      class="fixed z-50 flex items-center gap-1"
      style="left: {edgeLabelEdit.x - 92}px; top: {edgeLabelEdit.y - 16}px;"
    >
      <input
        bind:this={edgeLabelInput}
        bind:value={edgeLabelEdit.draft}
        onblur={commitEdgeLabel}
        onkeydown={onEdgeLabelKey}
        class="w-40 rounded-md border border-sky-300 bg-white px-2 py-1 text-xs shadow-lg outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-sky-700 dark:bg-neutral-900 dark:text-neutral-100"
        placeholder="Edge label…"
      />
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-md border border-red-300/70 bg-white text-red-500 shadow-lg transition-colors hover:bg-red-50 dark:border-red-800/70 dark:bg-neutral-900 dark:hover:bg-red-950/40"
        title="Delete this connection"
        aria-label="Delete this connection"
        onmousedown={(e) => e.preventDefault()}
        onclick={deleteEditedEdge}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  /* Edge labels are absolutely-positioned divs with shrink-to-fit width —
     near the container's coordinate edge they get squeezed and wrap/clip.
     Force content-sized, single-line labels, styled as a small chip. */
  :global(.svelte-flow__edge-label) {
    width: max-content;
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 600;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
  :global(.svelte-flow.dark .svelte-flow__edge-label) {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
  }

  /* ----- presenter view spotlight -----
     Every node eases opacity/filter so dimming is smooth. The moment the
     cursor is over ANY node (`:has(...:hover)`), all nodes dim; the hovered
     one is exempted by the more-specific `:hover` rule and lifts with a
     drop-shadow (which follows the card's rounded shape — unlike a box-shadow
     on the rectangular node wrapper). No transform: xyflow owns the node's
     inline translate and a CSS scale would fight it. */
  :global(.bp-presenting .svelte-flow__node) {
    transition:
      opacity 180ms ease,
      filter 180ms ease;
  }
  :global(.bp-presenting:has(.svelte-flow__node:hover) .svelte-flow__node) {
    opacity: 0.22;
    filter: saturate(0.8);
  }
  :global(.bp-presenting .svelte-flow__node:hover) {
    opacity: 1 !important;
    filter: drop-shadow(0 10px 26px rgba(0, 0, 0, 0.3)) !important;
    z-index: 60 !important;
  }

  .bp-crop {
    position: absolute;
    border: 2px dashed rgb(14, 165, 233);
    border-radius: 4px;
    cursor: move;
    /* One huge shadow dims everything outside the frame. */
    box-shadow: 0 0 0 100000px rgba(0, 0, 0, 0.4);
    touch-action: none;
  }
  .bp-crop-handle {
    position: absolute;
    width: 14px;
    height: 14px;
    background: rgb(14, 165, 233);
    border: 2px solid white;
    border-radius: 3px;
    touch-action: none;
  }
  .bp-crop-nw { left: -8px; top: -8px; cursor: nwse-resize; }
  .bp-crop-ne { right: -8px; top: -8px; cursor: nesw-resize; }
  .bp-crop-sw { left: -8px; bottom: -8px; cursor: nesw-resize; }
  .bp-crop-se { right: -8px; bottom: -8px; cursor: nwse-resize; }
  .bp-crop-size {
    position: absolute;
    left: 4px;
    bottom: 4px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(14, 165, 233, 0.9);
    color: white;
    font-size: 10px;
    font-family: ui-monospace, monospace;
    pointer-events: none;
  }
</style>
