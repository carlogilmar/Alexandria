<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";

  type TitleData = {
    mapNodeId: number;
    content: string;
  };
  type Props = {
    id: string;
    data: TitleData;
    selected?: boolean;
  };
  let { id, data, selected = false }: Props = $props();

  const { deleteElements } = useSvelteFlow();

  let editing = $state(false);
  let draft = $state("");
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (!editing) draft = data.content;
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
    if (draft === data.content) return;
    await app.updateMapNodeContent(data.mapNodeId, draft);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  }
  function removeNode(e: MouseEvent) {
    e.stopPropagation();
    void deleteElements({ nodes: [{ id }] });
  }

  let displayContent = $derived(
    data.content.trim() ? data.content : "Section title",
  );
  let empty = $derived(!data.content.trim());
</script>

<div class="title-node" class:title-selected={selected}>
  <button
    type="button"
    class="title-remove"
    aria-label="Remove title"
    title="Remove from map"
    onclick={removeNode}
  >
    ×
  </button>
  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={draft}
      onblur={commit}
      onkeydown={onKey}
      class="title-edit"
      placeholder="Section title"
    />
  {:else}
    <button
      type="button"
      class="title-display"
      class:title-empty={empty}
      aria-label="Edit section title"
      onclick={startEdit}
      onkeydown={(e) => {
        if (e.key === "Enter") startEdit(e);
      }}
    >
      <h2>{displayContent}</h2>
    </button>
  {/if}
  <span class="title-rule" aria-hidden="true"></span>
</div>

<style>
  /* A title is a section header: large, bold, no chrome, no handles. */
  .title-node {
    position: relative;
    padding: 4px 8px;
    min-width: 240px;
    max-width: 520px;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .title-display,
  .title-edit {
    margin: 0;
    padding: 0;
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: rgb(15, 23, 42);
    word-break: break-word;
    text-align: left;
  }
  .title-display h2,
  .title-edit {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  :global(html.dark) .title-display,
  :global(html.dark) .title-edit {
    color: rgb(241, 245, 249);
  }
  .title-empty h2 {
    color: rgba(15, 23, 42, 0.35);
    font-style: italic;
  }
  :global(html.dark) .title-empty h2 {
    color: rgba(241, 245, 249, 0.35);
  }
  .title-display {
    cursor: text;
  }
  .title-rule {
    display: block;
    margin-top: 6px;
    height: 2px;
    width: 64px;
    background: rgba(15, 23, 42, 0.6);
    border-radius: 1px;
  }
  :global(html.dark) .title-rule {
    background: rgba(241, 245, 249, 0.6);
  }
  .title-selected {
    outline: 1px dashed rgba(15, 23, 42, 0.35);
    outline-offset: 6px;
    border-radius: 2px;
  }
  :global(html.dark) .title-selected {
    outline-color: rgba(241, 245, 249, 0.35);
  }
  .title-remove {
    position: absolute;
    top: 0;
    right: 0;
    width: 20px;
    height: 20px;
    line-height: 1;
    font-size: 18px;
    font-weight: 700;
    color: rgba(15, 23, 42, 0.35);
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms;
  }
  .title-node:hover .title-remove {
    opacity: 1;
  }
  .title-remove:hover {
    color: rgb(190, 50, 50);
  }
  :global(html.dark) .title-remove {
    color: rgba(241, 245, 249, 0.35);
  }
  :global(html.dark) .title-remove:hover {
    color: rgb(248, 113, 113);
  }
</style>
