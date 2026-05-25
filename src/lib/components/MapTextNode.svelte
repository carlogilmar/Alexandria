<script lang="ts">
  import { NodeResizer, useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";

  type TextData = {
    mapNodeId: number;
    content: string;
  };
  type Props = {
    id: string;
    data: TextData;
    selected?: boolean;
  };
  let { id, data, selected = false }: Props = $props();

  const { deleteElements } = useSvelteFlow();

  let editing = $state(false);
  let draft = $state("");
  let textareaEl: HTMLTextAreaElement | undefined = $state();

  // Mirror upstream content into our local draft whenever it changes — but
  // not while we're actively editing (we don't want to clobber user input).
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
    const next = draft;
    if (next === data.content) return;
    await app.updateMapNodeContent(data.mapNodeId, next);
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

  let displayContent = $derived(
    data.content.trim() ? data.content : "(empty text — click to edit)",
  );
  let empty = $derived(!data.content.trim());
</script>

<div class="text-note" class:text-note-selected={selected}>
  <!-- Drag corners to resize manually. Auto-grow still works while typing
       (autoGrow updates the textarea height on each input). -->
  <NodeResizer
    minWidth={120}
    minHeight={48}
    isVisible={selected}
    lineClass="text-note-resize-line"
    handleClass="text-note-resize-handle"
  />
  <button
    type="button"
    class="text-note-remove"
    aria-label="Remove text"
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
      class="text-note-edit"
      placeholder="Write here…"
    ></textarea>
  {:else}
    <div
      class="text-note-display"
      class:text-note-empty={empty}
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
  .text-note {
    position: relative;
    /* Fill the xyflow node container so NodeResizer-driven dimensions take
       effect. Initial sizing comes from the Node's width/height in
       toFlowNode; the user drags corners to grow/shrink. */
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 10px 14px;
    background: rgba(254, 252, 232, 0.95);
    border-radius: 6px;
    box-shadow:
      0 1px 0 rgba(0, 0, 0, 0.06),
      0 0 0 1px rgba(202, 138, 4, 0.2);
    color: rgb(41, 37, 36);
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    /* IMPORTANT: NO overflow: hidden here — NodeResizer renders its
       resize handles slightly outside the node bounds, and clipping
       them makes resizing invisible/unreachable. The inner display
       and textarea elements handle their own overflow. */
  }
  :global(html.dark) .text-note {
    background: rgba(50, 45, 25, 0.95);
    border-color: rgba(202, 138, 4, 0.35);
    color: rgb(245, 245, 244);
  }
  .text-note-selected {
    box-shadow: 0 0 0 2px rgb(202, 138, 4);
  }
  .text-note-display {
    cursor: text;
    white-space: pre-wrap;
    word-break: break-word;
    outline: none;
    width: 100%;
    height: 100%;
    overflow: auto;
  }
  .text-note-empty {
    color: rgba(0, 0, 0, 0.4);
    font-style: italic;
  }
  :global(html.dark) .text-note-empty {
    color: rgba(255, 255, 255, 0.4);
  }
  .text-note-edit {
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    /* Drag the node's corner handle (via NodeResizer) to size the note —
       the textarea fills the container and scrolls when text overflows. */
    resize: none;
    overflow: auto;
    outline: none;
  }
  /* NodeResizer cosmetics. */
  :global(.text-note-resize-line) {
    border-color: rgba(202, 138, 4, 0.45);
  }
  :global(.text-note-resize-handle) {
    background: rgb(202, 138, 4);
    border: 1.5px solid white;
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .text-note-remove {
    position: absolute;
    top: 2px;
    right: 4px;
    width: 18px;
    height: 18px;
    line-height: 1;
    font-size: 16px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.35);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms;
  }
  .text-note:hover .text-note-remove {
    opacity: 1;
  }
  .text-note-remove:hover {
    background: rgba(0, 0, 0, 0.08);
    color: rgb(190, 50, 50);
  }
  :global(html.dark) .text-note-remove {
    color: rgba(255, 255, 255, 0.4);
  }
  :global(html.dark) .text-note-remove:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgb(248, 113, 113);
  }
</style>
