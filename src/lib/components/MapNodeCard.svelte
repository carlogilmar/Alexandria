<script lang="ts">
  import { Handle, Position, useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import type { MapEntityKind } from "$lib/ipc";

  // SvelteFlow passes the standard NodeProps shape. We only care about `data`.
  type CardData = {
    mapNodeId: number;
    kind: MapEntityKind;
    entityId: number;
  };
  type Props = {
    id: string;
    data: CardData;
    selected?: boolean;
  };
  let { id, data, selected = false }: Props = $props();

  // Pull the deleteElements helper so the X button removes the node from
  // the flow (which then fires ondelete, which persists via the store).
  const { deleteElements } = useSvelteFlow();

  const KIND_META: Record<
    MapEntityKind,
    { label: string; hue: number }
  > = {
    note: { label: "Note", hue: 217 },
    article: { label: "Article", hue: 268 },
    workflow: { label: "Workflow", hue: 32 },
  };

  let title = $derived.by(() => {
    if (data.kind === "note") {
      return app.notes.find((n) => n.id === data.entityId)?.title ?? null;
    }
    if (data.kind === "article") {
      return app.articles.find((a) => a.id === data.entityId)?.title ?? null;
    }
    return app.workflows.find((w) => w.id === data.entityId)?.title ?? null;
  });

  let pinned = $derived.by(() => {
    if (data.kind === "note") {
      return app.notes.find((n) => n.id === data.entityId)?.pinned ?? false;
    }
    if (data.kind === "article") {
      return app.articles.find((a) => a.id === data.entityId)?.pinned ?? false;
    }
    return app.workflows.find((w) => w.id === data.entityId)?.pinned ?? false;
  });

  let missing = $derived(title === null);
  let displayTitle = $derived(title ?? `Missing ${data.kind}`);
  let meta = $derived(KIND_META[data.kind]);
  let borderColor = $derived(`hsl(${meta.hue} 78% 55%)`);
  let bgColor = $derived(`hsl(${meta.hue} 80% 96%)`);
  let bgColorDark = $derived(`hsl(${meta.hue} 35% 18%)`);

  function openEntity(e: MouseEvent) {
    e.stopPropagation();
    if (missing) return;
    if (data.kind === "note") app.selectNote(data.entityId);
    else if (data.kind === "article") app.selectArticle(data.entityId);
    else app.selectWorkflow(data.entityId);
  }

  function removeFromMap(e: MouseEvent) {
    e.stopPropagation();
    // Removes from flowNodes via bind and triggers the ondelete handler in
    // MapEditor — which calls app.removeMapNode to persist.
    void deleteElements({ nodes: [{ id }] });
  }
</script>

<div
  class="map-card"
  class:map-card-selected={selected}
  class:map-card-missing={missing}
  style="--accent: {borderColor}; --bg: {bgColor}; --bg-dark: {bgColorDark};"
>
  <Handle type="target" position={Position.Left} />
  <Handle type="source" position={Position.Right} />

  <div class="map-card-header">
    <span class="map-card-kind">{meta.label}</span>
    {#if pinned}
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 text-amber-500" aria-label="pinned">
        <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
      </svg>
    {/if}
  </div>

  <h3 class="map-card-title" class:line-through={missing}>{displayTitle}</h3>

  <div class="map-card-actions">
    <button
      type="button"
      class="map-card-btn"
      onclick={openEntity}
      disabled={missing}
      title="Open {data.kind}"
    >
      Open →
    </button>
    <button
      type="button"
      class="map-card-btn map-card-btn-danger"
      onclick={removeFromMap}
      title="Remove from map (entity is preserved)"
    >
      ×
    </button>
  </div>
</div>

<style>
  .map-card {
    min-width: 180px;
    max-width: 240px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--bg);
    border-left: 4px solid var(--accent);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.06);
    font-family: ui-sans-serif, system-ui, sans-serif;
    color: rgb(23, 23, 23);
    /* GPU compositing hints — let the browser keep the card on its own
       layer so CSS transforms during zoom are GPU-accelerated and text
       stays sharp. */
    will-change: transform;
    backface-visibility: hidden;
    transform: translateZ(0);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
  }
  :global(html.dark) .map-card {
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
  :global(html.dark) .map-card {
    background: var(--bg-dark);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgb(229, 229, 229);
  }
  .map-card-selected {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .map-card-missing {
    opacity: 0.55;
  }
  .map-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 4px;
  }
  .map-card-kind {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .map-card-title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
    margin: 0 0 8px;
    overflow-wrap: anywhere;
  }
  .line-through {
    text-decoration: line-through;
  }
  .map-card-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .map-card-btn {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.6);
    color: inherit;
    cursor: pointer;
    line-height: 1.2;
  }
  .map-card-btn:hover {
    background: rgba(255, 255, 255, 0.95);
  }
  .map-card-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  :global(html.dark) .map-card-btn {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }
  :global(html.dark) .map-card-btn:hover {
    background: rgba(255, 255, 255, 0.18);
  }
  .map-card-btn-danger {
    color: rgb(190, 50, 50);
    padding: 2px 6px;
    font-weight: 700;
  }
  :global(html.dark) .map-card-btn-danger {
    color: rgb(248, 113, 113);
  }
</style>
