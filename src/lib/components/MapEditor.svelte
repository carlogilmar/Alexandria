<script lang="ts">
  import { onMount } from "svelte";
  import {
    Background,
    Controls,
    MiniMap,
    SvelteFlow,
    useSvelteFlow,
    type Connection,
    type Edge,
    type Node,
    type NodeTypes,
  } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import type { MapEdge, MapEntityKind, MapNode } from "$lib/ipc";
  import MapNodeCard from "$lib/components/MapNodeCard.svelte";
  import MapTextNode from "$lib/components/MapTextNode.svelte";
  import AddToMapPalette from "$lib/components/AddToMapPalette.svelte";
  import { theme } from "$lib/stores/theme.svelte";

  // useSvelteFlow only works inside SvelteFlowProvider — MapView wraps us.
  const flow = useSvelteFlow();

  // ----- nodes/edges in xyflow's format -----
  let flowNodes = $state.raw<Node[]>([]);
  let flowEdges = $state.raw<Edge[]>([]);

  function toFlowNode(n: MapNode): Node {
    if (n.kind === "text") {
      return {
        id: String(n.id),
        type: "textNote",
        position: { x: n.x, y: n.y },
        data: { mapNodeId: n.id, content: n.content ?? "" },
      };
    }
    return {
      id: String(n.id),
      type: "mapCard",
      position: { x: n.x, y: n.y },
      data: {
        mapNodeId: n.id,
        kind: n.kind as MapEntityKind,
        entityId: n.entityId,
      },
    };
  }
  function toFlowEdge(e: MapEdge): Edge {
    return {
      id: String(e.id),
      source: String(e.sourceId),
      target: String(e.targetId),
      label: e.label ?? undefined,
    };
  }

  const nodeTypes: NodeTypes = {
    mapCard: MapNodeCard as unknown as NodeTypes[string],
    textNote: MapTextNode as unknown as NodeTypes[string],
  };

  // Reactive sync from store → local flow arrays. Runs whenever the store
  // changes (add/move/remove/content-edit), so the canvas always reflects
  // the persisted state. Crucially, we no longer append to flowNodes
  // manually after a mutation — the effect does it, which avoids the
  // duplicate-id race we hit before.
  $effect(() => {
    if (!app.mapLoaded) return;
    flowNodes = app.mapNodes.map(toFlowNode);
  });
  $effect(() => {
    if (!app.mapLoaded) return;
    flowEdges = app.mapEdges.map(toFlowEdge);
  });

  // ----- persistence -----
  function onNodeDragStop(args: { targetNode: Node | null }) {
    const target = args.targetNode;
    if (!target) return;
    const id = Number(target.id);
    if (!Number.isFinite(id)) return;
    void app.moveMapNode(id, target.position.x, target.position.y);
  }

  async function onConnect(connection: Connection) {
    const sourceId = Number(connection.source);
    const targetId = Number(connection.target);
    if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) return;
    if (sourceId === targetId) return;
    // Don't connect to/from text nodes — they're decorative.
    const sourceNode = app.mapNodes.find((n) => n.id === sourceId);
    const targetNode = app.mapNodes.find((n) => n.id === targetId);
    if (!sourceNode || !targetNode) return;
    if (sourceNode.kind === "text" || targetNode.kind === "text") return;
    // No-op if a backend edge already exists for this pair.
    if (
      app.mapEdges.some(
        (e) => e.sourceId === sourceId && e.targetId === targetId,
      )
    ) {
      return;
    }
    // Store update → reactive sync replaces flowEdges via the $effect above.
    await app.addMapEdge(sourceId, targetId, null);
  }

  function onDelete(args: { nodes: Node[]; edges: Edge[] }) {
    for (const e of args.edges) {
      const id = Number(e.id);
      if (Number.isFinite(id)) void app.removeMapEdge(id);
    }
    for (const n of args.nodes) {
      const id = Number(n.id);
      if (Number.isFinite(id)) void app.removeMapNode(id);
    }
  }

  // ----- adding from the palette / + buttons -----
  let svelteFlowEl: HTMLDivElement | undefined = $state();

  // Returns flow coordinates for a screen pixel using xyflow's helper if
  // available, or a fallback that respects current viewport transform.
  function screenToFlow(clientX: number, clientY: number): { x: number; y: number } {
    if (typeof flow.screenToFlowPosition === "function") {
      return flow.screenToFlowPosition({ x: clientX, y: clientY });
    }
    if (!svelteFlowEl) return { x: 0, y: 0 };
    const rect = svelteFlowEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // For the palette's "+" button (no drop coords): drop near the viewport
  // center plus a cascading offset so successive adds don't stack.
  let cascadeIndex = 0;
  function viewportCenterFlow(): { x: number; y: number } {
    if (!svelteFlowEl) return { x: 0, y: 0 };
    const rect = svelteFlowEl.getBoundingClientRect();
    return screenToFlow(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  function nextCascadePosition(): { x: number; y: number } {
    const center = viewportCenterFlow();
    // Spiral the offset out so 8 adds stay close to center, then drift.
    const step = 36;
    const i = cascadeIndex++;
    const angle = i * 0.9;
    const radius = step + Math.sqrt(i) * step * 0.7;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  }

  async function handleAddEntity(
    kind: MapEntityKind,
    entityId: number,
    clientX: number | null,
    clientY: number | null,
  ) {
    const pos =
      clientX !== null && clientY !== null
        ? screenToFlow(clientX, clientY)
        : nextCascadePosition();
    // Store update → reactive sync adds it to flowNodes via the $effect.
    await app.addMapNode(kind, entityId, pos.x, pos.y);
  }

  async function handleAddText() {
    const pos = nextCascadePosition();
    await app.addMapText("New text", pos.x, pos.y);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer?.getData("application/x-bigpicture-map-item");
    if (!raw) return;
    try {
      const { kind, entityId } = JSON.parse(raw) as {
        kind: MapEntityKind;
        entityId: number;
      };
      void handleAddEntity(kind, entityId, e.clientX, e.clientY);
    } catch {
      // ignore
    }
  }

  onMount(() => {
    void app.openMap();
  });

  let colorMode = $derived<"light" | "dark">(
    theme.resolved === "dark" ? "dark" : "light",
  );
</script>

<div
  bind:this={svelteFlowEl}
  class="relative h-screen w-full bg-neutral-50 dark:bg-neutral-950"
  ondragover={onDragOver}
  ondrop={onDrop}
  role="application"
  aria-label="Master map — drag entities here to place them"
>
  {#if app.mapLoading && !app.mapLoaded}
    <div class="absolute inset-0 z-10 flex items-center justify-center">
      <p class="text-sm text-neutral-500">Loading the map…</p>
    </div>
  {/if}

  <SvelteFlow
    bind:nodes={flowNodes}
    bind:edges={flowEdges}
    {nodeTypes}
    fitView
    fitViewOptions={{ maxZoom: 1.1, padding: 0.25 }}
    minZoom={0.2}
    maxZoom={2}
    colorMode={colorMode}
    onnodedragstop={onNodeDragStop}
    onconnect={onConnect}
    ondelete={onDelete}
    deleteKey={["Backspace", "Delete"]}
  >
    <Background />
    <Controls />
    <MiniMap pannable zoomable />
  </SvelteFlow>

  <!-- Floating "Add text" button, top-left so it's out of the palette's way. -->
  <button
    type="button"
    class="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-md border border-neutral-300/70 bg-white/90 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm backdrop-blur hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/85 dark:text-neutral-200 dark:hover:bg-neutral-800"
    onclick={handleAddText}
    title="Drop a free-text note on the canvas"
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
      <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v3a1 1 0 11-2 0V4H6v12h4a1 1 0 110 2H6a2 2 0 01-2-2V4zm10 6a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
    </svg>
    + Add text
  </button>

  <AddToMapPalette
    onAddEntity={(kind, entityId, x, y) => handleAddEntity(kind, entityId, x, y)}
  />
</div>
