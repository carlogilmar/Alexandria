<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";

  type CommentData = {
    mapNodeId: number;
    content: string;
  };
  type Props = {
    id: string;
    data: CommentData;
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

  let displayContent = $derived(
    data.content.trim() ? data.content : "(comment — click to edit)",
  );
  let empty = $derived(!data.content.trim());
</script>

<div class="comment" class:comment-selected={selected}>
  <button
    type="button"
    class="comment-remove"
    aria-label="Remove comment"
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
      class="comment-edit"
      placeholder="Comment…"
    ></textarea>
  {:else}
    <div
      class="comment-display"
      class:comment-empty={empty}
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
  /* A comment is the "margin note" of the canvas — no card, no border,
     just unframed text on the background. Italics + subtle color set it
     apart from real nodes. */
  .comment {
    position: relative;
    padding: 4px 6px;
    min-width: 100px;
    max-width: 320px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    font-style: italic;
    color: rgb(80, 80, 80);
  }
  :global(html.dark) .comment {
    color: rgb(180, 180, 180);
  }
  .comment-selected {
    outline: 1px dashed rgba(60, 60, 60, 0.4);
    outline-offset: 2px;
    border-radius: 2px;
  }
  :global(html.dark) .comment-selected {
    outline-color: rgba(220, 220, 220, 0.4);
  }
  .comment-display {
    cursor: text;
    white-space: pre-wrap;
    word-break: break-word;
    outline: none;
  }
  .comment-empty {
    opacity: 0.55;
  }
  .comment-edit {
    width: 100%;
    min-height: 1.5em;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    font-style: inherit;
    line-height: inherit;
    resize: vertical;
    outline: none;
  }
  .comment-remove {
    position: absolute;
    top: -2px;
    right: -6px;
    width: 16px;
    height: 16px;
    line-height: 1;
    font-size: 14px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.45);
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms;
  }
  .comment:hover .comment-remove {
    opacity: 1;
  }
  .comment-remove:hover {
    color: rgb(190, 50, 50);
  }
  :global(html.dark) .comment-remove {
    color: rgba(255, 255, 255, 0.45);
  }
  :global(html.dark) .comment-remove:hover {
    color: rgb(248, 113, 113);
  }
</style>
