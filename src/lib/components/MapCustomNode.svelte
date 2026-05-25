<script lang="ts">
  import { Handle, NodeResizer, Position, useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";

  type CustomData = {
    mapNodeId: number;
    content: string;
  };
  type Props = {
    id: string;
    data: CustomData;
    selected?: boolean;
  };
  let { id, data, selected = false }: Props = $props();

  const { deleteElements } = useSvelteFlow();

  let editing = $state(false);
  let draft = $state("");
  let textareaEl: HTMLTextAreaElement | undefined = $state();

  $effect(() => {
    if (!editing) draft = data.content;
  });

  function startEdit(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    editing = true;
    queueMicrotask(() => textareaEl?.focus());
  }

  async function commit() {
    editing = false;
    if (draft === data.content) return;
    await app.updateMapNodeContent(data.mapNodeId, draft);
  }

  function onTextareaKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  }

  function removeNode(e: MouseEvent) {
    e.stopPropagation();
    void deleteElements({ nodes: [{ id }] });
  }

  let isDark = $derived(theme.resolved === "dark");
  // Custom nodes use a neutral grey palette so they're visually distinct
  // from blue/violet/amber entity cards.
  let accent = $derived("hsl(220 8% 45%)");
  let bg = $derived(isDark ? "hsl(220 8% 18%)" : "hsl(220 12% 96%)");
  let stroke = $derived(isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)");
  let titleColor = $derived(isDark ? "rgb(229,229,229)" : "rgb(23,23,23)");

  let displayContent = $derived(
    data.content.trim() ? data.content : "(custom — click to edit)",
  );
  let empty = $derived(!data.content.trim());
</script>

<div class="custom-card" style="background: {bg}; color: {titleColor}; --stroke: {stroke};" class:custom-card-selected={selected}>
  <Handle type="target" position={Position.Left} style="background: {accent};" />
  <Handle type="source" position={Position.Right} style="background: {accent};" />

  <NodeResizer
    minWidth={140}
    minHeight={60}
    isVisible={selected}
    lineClass="custom-resize-line"
    handleClass="custom-resize-handle"
  />

  <span class="custom-kind" style="color: {accent};">CUSTOM</span>

  <button
    type="button"
    class="custom-remove"
    aria-label="Remove"
    title="Remove from map"
    onclick={removeNode}
  >
    ×
  </button>

  {#if editing}
    <textarea
      bind:this={textareaEl}
      bind:value={draft}
      onblur={commit}
      onkeydown={onTextareaKey}
      class="custom-edit"
      placeholder="Custom node content…"
    ></textarea>
  {:else}
    <div
      class="custom-display"
      class:custom-empty={empty}
      role="textbox"
      tabindex="0"
      onclick={startEdit}
      onkeydown={(e) => {
        if (e.key === "Enter") startEdit(e);
      }}
    >
      {displayContent}
    </div>
  {/if}
</div>

<style>
  .custom-card {
    position: relative;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 10px 12px 10px 14px;
    border-radius: 8px;
    border-left: 4px solid hsl(220 8% 45%);
    box-shadow:
      0 1px 0 rgba(0, 0, 0, 0.06),
      0 0 0 1px var(--stroke);
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.45;
  }
  .custom-card-selected {
    box-shadow:
      0 0 0 2px hsl(220 12% 55%),
      0 1px 0 rgba(0, 0, 0, 0.06);
  }
  .custom-kind {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .custom-display {
    cursor: text;
    white-space: pre-wrap;
    word-break: break-word;
    outline: none;
    height: calc(100% - 18px);
    overflow: auto;
  }
  .custom-empty {
    opacity: 0.5;
    font-style: italic;
  }
  .custom-edit {
    width: 100%;
    height: calc(100% - 18px);
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    resize: none;
    overflow: auto;
    outline: none;
  }
  .custom-remove {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 18px;
    height: 18px;
    line-height: 1;
    font-size: 16px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.35);
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms;
  }
  .custom-card:hover .custom-remove {
    opacity: 1;
  }
  .custom-remove:hover {
    background: rgba(0, 0, 0, 0.08);
    color: rgb(190, 50, 50);
  }
  :global(html.dark) .custom-remove {
    color: rgba(255, 255, 255, 0.4);
  }
  :global(html.dark) .custom-remove:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgb(248, 113, 113);
  }
  :global(.custom-resize-line) {
    border-color: rgba(120, 120, 120, 0.45);
  }
  :global(.custom-resize-handle) {
    background: rgb(120, 120, 120);
    border: 1.5px solid white;
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
</style>
