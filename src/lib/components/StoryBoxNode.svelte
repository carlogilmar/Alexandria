<script lang="ts">
  import { untrack } from "svelte";
  import { Handle, Position, useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import { CARD_COLORS, cardAccent } from "$lib/cardColors";

  type Data = {
    nodeId: number;
    label: string;
    color: string | null;
    conn?: Record<string, boolean>;
  };
  let {
    id,
    data,
    selected = false,
  }: { id: string; data: Data; selected?: boolean } = $props();

  const { deleteElements } = useSvelteFlow();

  let editing = $state(false);
  let draft = $state(untrack(() => data.label));
  let inputEl: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (!editing) draft = data.label;
  });

  function start() {
    draft = data.label;
    editing = true;
    queueMicrotask(() => inputEl?.select());
  }
  function commit() {
    if (!editing) return;
    editing = false;
    if (draft.trim() !== data.label)
      void app.updateStoryboardNodeLabel(data.nodeId, draft.trim());
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      editing = false;
    }
  }

  let accent = $derived(cardAccent(data.color));
  const handle =
    "width:6px;height:6px;background:var(--sb-accent, #94a3b8);border:1px solid #fff;";
</script>

<div
  class="sb-box"
  class:selected
  class:conn-t={data.conn?.t}
  class:conn-r={data.conn?.r}
  class:conn-b={data.conn?.b}
  class:conn-l={data.conn?.l}
  style={accent ? `--sb-accent:${accent};` : ""}
>
  <Handle id="t" type="source" position={Position.Top} style={handle} />
  <Handle id="r" type="source" position={Position.Right} style={handle} />
  <Handle id="b" type="source" position={Position.Bottom} style={handle} />
  <Handle id="l" type="source" position={Position.Left} style={handle} />

  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={draft}
      onblur={commit}
      onkeydown={onKey}
      class="sb-input"
    />
  {:else}
    <button type="button" class="sb-label" ondblclick={start} onclick={start}>
      {data.label || "box"}
    </button>
  {/if}

  {#if selected}
    <div class="sb-colors">
      {#each CARD_COLORS as c (c.name)}
        <button
          type="button"
          class="sb-swatch"
          style="background:{cardAccent(c.name)}"
          aria-label={c.name}
          onclick={() =>
            app.setStoryboardNodeColor(
              data.nodeId,
              data.color === c.name ? null : c.name,
            )}
        ></button>
      {/each}
    </div>
    <button
      type="button"
      class="sb-remove"
      aria-label="Delete"
      onclick={() => deleteElements({ nodes: [{ id }] })}>×</button
    >
  {/if}
</div>

<style>
  /* Connection dots: hidden by default; a handle that carries an edge stays
     visible; empty ones appear on hover (to drag a new link) or while a
     connection is in progress (to drop onto it). */
  .sb-box :global(.svelte-flow__handle) {
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .sb-box.conn-t :global(.svelte-flow__handle-top),
  .sb-box.conn-r :global(.svelte-flow__handle-right),
  .sb-box.conn-b :global(.svelte-flow__handle-bottom),
  .sb-box.conn-l :global(.svelte-flow__handle-left) {
    opacity: 1;
  }
  .sb-box:hover :global(.svelte-flow__handle),
  :global(.svelte-flow.connecting) .sb-box :global(.svelte-flow__handle) {
    opacity: 1;
  }
  .sb-box {
    position: relative;
    min-width: 56px;
    max-width: 220px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1.5px solid var(--sb-accent, #cbd5e1);
    background: var(--panel, #fff);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    font-size: 13px;
    text-align: center;
  }
  :global(html.dark) .sb-box {
    background: #1b2027;
    border-color: var(--sb-accent, #3a424d);
  }
  .sb-box.selected {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--sb-accent, #3b82f6) 60%, transparent);
  }
  .sb-label {
    all: unset;
    display: block;
    cursor: text;
    font-weight: 500;
    color: inherit;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 196px;
  }
  .sb-input {
    all: unset;
    text-align: center;
    font-weight: 500;
    width: 140px;
  }
  .sb-colors {
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 3px;
    padding: 3px 5px;
    border-radius: 8px;
    background: #1f2430;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }
  .sb-swatch {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
  }
  .sb-remove {
    position: absolute;
    top: -9px;
    right: -9px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: #ef4444;
    color: #fff;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }
</style>
