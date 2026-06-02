<script lang="ts">
  import { Handle, Position, useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import type { MapEntityKind } from "$lib/ipc";

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

  const { deleteElements } = useSvelteFlow();

  // Card dimensions stay fixed so xyflow can lay them out predictably.
  // Slightly larger than v1 — larger natural size lets the user keep
  // zoom <= 1 (no upscaling) and still read titles comfortably.
  const W = 244;
  const H = 104;

  const KIND_META: Record<
    MapEntityKind,
    { label: string; hue: number }
  > = {
    note: { label: "NOTE", hue: 217 },
    article: { label: "ARTICLE", hue: 268 },
    workflow: { label: "WORKFLOW", hue: 32 },
    feedback_board: { label: "BOARD", hue: 350 },
  };

  let title = $derived.by(() => {
    if (data.kind === "note") {
      return app.notes.find((n) => n.id === data.entityId)?.title ?? null;
    }
    if (data.kind === "article") {
      return app.articles.find((a) => a.id === data.entityId)?.title ?? null;
    }
    if (data.kind === "feedback_board") {
      return (
        app.feedbackBoards.find((b) => b.id === data.entityId)?.title ?? null
      );
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
    if (data.kind === "feedback_board") {
      return (
        app.feedbackBoards.find((b) => b.id === data.entityId)?.pinned ?? false
      );
    }
    return app.workflows.find((w) => w.id === data.entityId)?.pinned ?? false;
  });
  let missing = $derived(title === null);
  let rawTitle = $derived(title ?? `Missing ${data.kind}`);
  // SVG <text> has no auto-wrap; truncate so it doesn't overflow the card.
  let displayTitle = $derived(
    rawTitle.length > 24 ? rawTitle.slice(0, 22).trimEnd() + "…" : rawTitle,
  );
  let meta = $derived(KIND_META[data.kind]);

  let isDark = $derived(theme.resolved === "dark");
  let accent = $derived(`hsl(${meta.hue} 70% 50%)`);
  let bg = $derived(
    isDark
      ? `hsl(${meta.hue} 32% 16%)`
      : `hsl(${meta.hue} 78% 96%)`,
  );
  let stroke = $derived(
    isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
  );
  let titleColor = $derived(
    isDark ? "rgb(229, 229, 229)" : "rgb(23, 23, 23)",
  );
  let btnBg = $derived(
    isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.85)",
  );
  let btnStroke = $derived(
    isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)",
  );
  let dangerColor = $derived(isDark ? "rgb(248, 113, 113)" : "rgb(190, 50, 50)");
  let selectionStroke = $derived(accent);

  function openEntity() {
    if (missing) return;
    if (data.kind === "note") app.selectNote(data.entityId);
    else if (data.kind === "article") app.selectArticle(data.entityId);
    else if (data.kind === "feedback_board")
      app.openFeedbackBoard(data.entityId);
    else app.selectWorkflow(data.entityId);
  }
  function onOpenKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openEntity();
    }
  }
  function removeFromMap() {
    // deleteElements removes the node from flowNodes via bind, which fires
    // ondelete in MapEditor — that persists via app.removeMapNode.
    void deleteElements({ nodes: [{ id }] });
  }
  function onRemoveKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      removeFromMap();
    }
  }
</script>

<div class="map-card" style="width: {W}px; height: {H}px;">
  <Handle type="target" position={Position.Left} style="background: {accent};" />
  <Handle type="source" position={Position.Right} style="background: {accent};" />

  <svg
    width={W}
    height={H}
    viewBox={`0 0 ${W} ${H}`}
    xmlns="http://www.w3.org/2000/svg"
    class="map-card-svg"
    shape-rendering="geometricPrecision"
    text-rendering="geometricPrecision"
  >
    <!-- Background + outline (one rect, no separate border-left to avoid
         aliasing at fractional zooms) -->
    <rect
      x="0.5"
      y="0.5"
      width={W - 1}
      height={H - 1}
      rx="8"
      ry="8"
      fill={bg}
      stroke={selected ? selectionStroke : stroke}
      stroke-width={selected ? 2 : 1}
    />
    <!-- Accent stripe (vector, sharp) -->
    <rect x="0" y="0" width="4" height={H} fill={accent} rx="2" />

    <!-- Kind label -->
    <text
      x="14"
      y="22"
      font-size="11"
      font-weight="700"
      fill={accent}
      font-family="ui-sans-serif, system-ui, -apple-system, sans-serif"
      letter-spacing="1.2"
    >
      {meta.label}
    </text>

    <!-- Pin badge (top-right) -->
    {#if pinned}
      <g transform={`translate(${W - 22}, 8)`}>
        <path
          d="M7 0 L7 2 L9 4 L9 6 L4 6 L4 9 L3.5 9 L3.5 6 L-1 6 L-1 4 L1 2 L1 0 Z"
          transform="translate(2, 2)"
          fill="#f59e0b"
          opacity="0.95"
        />
      </g>
    {/if}

    <!-- Title -->
    <text
      x="14"
      y="52"
      font-size="15"
      font-weight="600"
      fill={titleColor}
      font-family="ui-sans-serif, system-ui, -apple-system, sans-serif"
      text-decoration={missing ? "line-through" : "none"}
      opacity={missing ? 0.55 : 1}
    >
      {displayTitle}
    </text>

    <!-- Open button -->
    <g
      class="svg-btn"
      onclick={openEntity}
      onkeydown={onOpenKey}
      role="button"
      tabindex="0"
      aria-label="Open {data.kind}"
      style={missing ? "opacity: 0.4; cursor: not-allowed;" : "cursor: pointer;"}
    >
      <rect
        x="14"
        y="72"
        width="64"
        height="22"
        rx="4"
        fill={btnBg}
        stroke={btnStroke}
      />
      <text
        x="20"
        y="87"
        font-size="12"
        font-weight="500"
        fill={titleColor}
        font-family="ui-sans-serif, system-ui, -apple-system, sans-serif"
        pointer-events="none"
      >
        Open →
      </text>
    </g>

    <!-- Remove button -->
    <g
      class="svg-btn"
      onclick={removeFromMap}
      onkeydown={onRemoveKey}
      role="button"
      tabindex="0"
      aria-label="Remove from map"
      style="cursor: pointer;"
    >
      <rect
        x={W - 36}
        y="72"
        width="22"
        height="22"
        rx="4"
        fill={btnBg}
        stroke={btnStroke}
      />
      <text
        x={W - 25}
        y="89"
        font-size="17"
        font-weight="700"
        fill={dangerColor}
        font-family="ui-sans-serif, system-ui, -apple-system, sans-serif"
        text-anchor="middle"
        pointer-events="none"
      >
        ×
      </text>
    </g>
  </svg>
</div>

<style>
  .map-card {
    position: relative;
  }
  .map-card-svg {
    display: block;
  }
  /* Inline hover: brighten the button background a touch. SVG :hover works
     in all modern browsers including WKWebView. */
  :global(.map-card .svg-btn rect:hover),
  :global(.map-card .svg-btn:hover rect) {
    fill: rgba(255, 255, 255, 1);
  }
  :global(html.dark) :global(.map-card .svg-btn:hover rect) {
    fill: rgba(255, 255, 255, 0.18);
  }
</style>
