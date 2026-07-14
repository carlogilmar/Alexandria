<script lang="ts">
  import { NodeResizer, useSvelteFlow } from "@xyflow/svelte";

  // A frame is a labeled, resizable rectangle drawn BEHIND cards (low zIndex,
  // set in BlueprintEditor.toFlowNode) to group/section a diagram. It's purely
  // visual — moving it does NOT move the cards inside. The label persists via
  // the node's `content` field (onCommitContent), size via onResizeEnd.
  type FrameData = {
    nodeId: number;
    content: string;
    color: string | null;
    onCommitContent: (nodeId: number, content: string) => Promise<void> | void;
    onResizeEnd: (
      nodeId: number,
      width: number,
      height: number,
    ) => Promise<void> | void;
  };
  type Props = { id: string; data: FrameData; selected?: boolean };
  let { id, data, selected = false }: Props = $props();

  const { deleteElements } = useSvelteFlow();

  let editing = $state(false);
  let draft = $state("");
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (!editing) draft = data.content ?? "";
  });

  function startEdit(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    editing = true;
    queueMicrotask(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }
  async function commit() {
    editing = false;
    if (draft === (data.content ?? "")) return;
    await data.onCommitContent(data.nodeId, draft);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  }
  function removeNode(e: MouseEvent) {
    e.stopPropagation();
    void deleteElements({ nodes: [{ id }] });
  }

  let label = $derived(data.content?.trim() ? data.content : "Frame");
  let empty = $derived(!data.content?.trim());
</script>

<div class="bp-frame" class:bp-frame-selected={selected}>
  <NodeResizer
    minWidth={160}
    minHeight={120}
    isVisible={selected}
    lineClass="bp-frame-resize-line"
    handleClass="bp-frame-resize-handle"
    onResizeEnd={(_e, params) => {
      void data.onResizeEnd(data.nodeId, params.width, params.height);
    }}
  />
  <div class="bp-frame-bg"></div>
  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={draft}
      onblur={commit}
      onkeydown={onKey}
      class="bp-frame-input"
      placeholder="Frame name"
    />
  {:else}
    <button
      type="button"
      class="bp-frame-label"
      class:bp-frame-label-empty={empty}
      onclick={startEdit}
    >
      {label}
    </button>
  {/if}
  <button
    type="button"
    class="bp-frame-remove"
    aria-label="Remove frame"
    title="Remove frame"
    onclick={removeNode}
  >
    ×
  </button>
</div>

<style>
  .bp-frame {
    position: relative;
    width: 100%;
    height: 100%;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  /* The rectangle itself. A faint tinted fill + dashed border reads as a
     grouping region without competing with the cards on top. */
  .bp-frame-bg {
    position: absolute;
    inset: 0;
    border: 1.5px dashed hsl(215 18% 58% / 0.75);
    border-radius: 12px;
    background: hsl(215 30% 55% / 0.05);
  }
  :global(html.dark) .bp-frame-bg {
    border-color: hsl(215 20% 65% / 0.5);
    background: hsl(215 30% 70% / 0.05);
  }
  .bp-frame-selected .bp-frame-bg {
    border-style: solid;
    box-shadow: 0 0 0 2px hsl(215 40% 55% / 0.5);
  }

  .bp-frame-label,
  .bp-frame-input {
    position: absolute;
    top: 7px;
    left: 12px;
    max-width: calc(100% - 40px);
    padding: 1px 4px;
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: hsl(215 25% 38%);
    outline: none;
    cursor: text;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(html.dark) .bp-frame-label,
  :global(html.dark) .bp-frame-input {
    color: hsl(215 30% 75%);
  }
  .bp-frame-label-empty {
    opacity: 0.5;
    font-style: italic;
    font-weight: 600;
  }

  .bp-frame-remove {
    position: absolute;
    top: 3px;
    right: 6px;
    width: 20px;
    height: 20px;
    line-height: 1;
    font-size: 18px;
    font-weight: 700;
    color: hsl(215 15% 45% / 0.55);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms;
  }
  .bp-frame:hover .bp-frame-remove {
    opacity: 1;
  }
  .bp-frame-remove:hover {
    background: rgba(0, 0, 0, 0.06);
    color: rgb(190, 50, 50);
  }
  :global(html.dark) .bp-frame-remove:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgb(248, 113, 113);
  }

  :global(.bp-frame-resize-line) {
    border-color: hsl(215 40% 55% / 0.5);
  }
  :global(.bp-frame-resize-handle) {
    background: hsl(215 40% 55%);
    border: 1.5px solid white;
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
</style>
