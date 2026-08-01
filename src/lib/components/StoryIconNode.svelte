<script lang="ts">
  import { untrack } from "svelte";
  import { Handle, Position, useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import { CARD_COLORS, cardAccent } from "$lib/cardColors";
  import { STORY_ICONS, STORY_ICON_MAP, type StoryIconKind } from "$lib/storyIcons";

  type Data = {
    nodeId: number;
    label: string;
    icon: string | null;
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

  function startLabel() {
    draft = data.label;
    editing = true;
    queueMicrotask(() => inputEl?.select());
  }
  function commitLabel() {
    if (!editing) return;
    editing = false;
    if (draft.trim() !== data.label)
      void app.updateStoryboardNodeLabel(data.nodeId, draft.trim());
  }

  // ----- icon picker -----
  let pickerOpen = $state(false);
  let tab = $state<StoryIconKind>("concept");
  let query = $state("");
  let iconEntry = $derived(STORY_ICON_MAP.get(data.icon ?? ""));
  let filtered = $derived(
    STORY_ICONS.filter(
      (i) =>
        i.kind === tab &&
        (query.trim() === "" ||
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.key.toLowerCase().includes(query.toLowerCase())),
    ),
  );
  function choose(key: string | null) {
    void app.setStoryboardNodeIcon(data.nodeId, key);
    pickerOpen = false;
    query = "";
  }
  let emojiDraft = $state("");
  function chooseEmoji() {
    const v = emojiDraft.trim();
    if (v) choose(v);
  }

  let accent = $derived(cardAccent(data.color) ?? "#64748b");
  // Anchor each dot to a compass point ON the circle (the node box is taller
  // than the circle because of the label, so we can't rely on auto-placement).
  const hBase =
    "width:6px;height:6px;background:var(--si-accent,#94a3b8);border:1px solid #fff;right:auto;bottom:auto;";
  const hT = hBase + "top:0;left:50%;transform:translate(-50%,-50%);";
  const hR = hBase + "top:50%;left:100%;transform:translate(-50%,-50%);";
  const hB = hBase + "top:100%;left:50%;transform:translate(-50%,-50%);";
  const hL = hBase + "top:50%;left:0;transform:translate(-50%,-50%);";
</script>

<div
  class="si"
  class:selected
  class:conn-t={data.conn?.t}
  class:conn-r={data.conn?.r}
  class:conn-b={data.conn?.b}
  class:conn-l={data.conn?.l}
  style="--si-accent:{accent};"
>
  <div class="si-circle-wrap">
    <Handle id="t" type="source" position={Position.Top} style={hT} />
    <Handle id="r" type="source" position={Position.Right} style={hR} />
    <Handle id="b" type="source" position={Position.Bottom} style={hB} />
    <Handle id="l" type="source" position={Position.Left} style={hL} />
    <button
      type="button"
      class="si-circle"
      onclick={() => (pickerOpen = !pickerOpen)}
      title="Click to change icon"
    >
      {#if iconEntry}
        {#if iconEntry.kind === "concept"}
          <span class="si-glyph" style="color:{accent}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html iconEntry.body}</svg>
          </span>
        {:else}
          <span class="si-glyph brand">{@html iconEntry.body}</span>
        {/if}
      {:else}
        <span class="si-emoji">{data.icon || "◆"}</span>
      {/if}
    </button>
  </div>

  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={draft}
      onblur={commitLabel}
      onkeydown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitLabel(); }
        else if (e.key === "Escape") editing = false;
      }}
      class="si-labelinput"
    />
  {:else}
    <button type="button" class="si-label" ondblclick={startLabel} onclick={startLabel}>
      {data.label || "label"}
    </button>
  {/if}

  {#if selected}
    <div class="si-colors">
      {#each CARD_COLORS as c (c.name)}
        <button
          type="button"
          class="si-swatch"
          style="background:{cardAccent(c.name)}"
          aria-label={c.name}
          onclick={() =>
            app.setStoryboardNodeColor(data.nodeId, data.color === c.name ? null : c.name)}
        ></button>
      {/each}
    </div>
    <button type="button" class="si-remove" aria-label="Delete"
      onclick={() => deleteElements({ nodes: [{ id }] })}>×</button>
  {/if}

  <!-- icon picker popover -->
  {#if pickerOpen}
    <button type="button" class="si-picker-backdrop" aria-label="Close" onclick={() => (pickerOpen = false)}></button>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="si-picker nodrag nowheel" onpointerdown={(e) => e.stopPropagation()}>
      <div class="si-tabs">
        <button type="button" class:active={tab === "concept"} onclick={() => (tab = "concept")}>Concepts</button>
        <button type="button" class:active={tab === "brand"} onclick={() => (tab = "brand")}>Logos</button>
        <input bind:value={query} placeholder="Search…" class="si-search" />
      </div>
      <div class="si-grid nowheel">
        {#each filtered as ic (ic.key)}
          <button type="button" class="si-grid-btn" title={ic.label} onclick={() => choose(ic.key)}>
            {#if ic.kind === "concept"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html ic.body}</svg>
            {:else}
              {@html ic.body}
            {/if}
          </button>
        {/each}
        {#if filtered.length === 0}
          <span class="si-empty">No matches</span>
        {/if}
      </div>
      <div class="si-picker-foot">
        <input bind:value={emojiDraft} maxlength="2" placeholder="emoji" class="si-emoji-in"
          onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); chooseEmoji(); } }} />
        <button type="button" onclick={chooseEmoji}>Use emoji</button>
        <button type="button" class="clear" onclick={() => choose(null)}>Clear</button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Connection dots: connected handles stay visible; empty ones show on hover
     or while connecting. */
  .si :global(.svelte-flow__handle) {
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .si.conn-t :global(.svelte-flow__handle-top),
  .si.conn-r :global(.svelte-flow__handle-right),
  .si.conn-b :global(.svelte-flow__handle-bottom),
  .si.conn-l :global(.svelte-flow__handle-left) {
    opacity: 1;
  }
  .si:hover :global(.svelte-flow__handle),
  :global(.svelte-flow.connecting) .si :global(.svelte-flow__handle) {
    opacity: 1;
  }
  .si {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    width: 84px;
  }
  .si-circle-wrap {
    position: relative;
    width: 60px;
    height: 60px;
  }
  .si-circle {
    all: unset;
    box-sizing: border-box;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: pointer;
    border: 2px solid var(--si-accent);
    background: #fff;
  }
  .si.selected .si-circle {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--si-accent) 40%, transparent);
  }
  .si-emoji { font-size: 26px; line-height: 1; }
  .si-glyph { width: 32px; height: 32px; display: grid; place-items: center; }
  .si-glyph :global(svg) { width: 100%; height: 100%; display: block; }
  .si-glyph.brand { width: 34px; height: 34px; }
  .si-label {
    all: unset;
    cursor: text;
    font-size: 12.5px;
    font-weight: 600;
    color: inherit;
    max-width: 84px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .si-labelinput {
    all: unset;
    text-align: center;
    font-size: 12.5px;
    font-weight: 600;
    width: 84px;
  }
  .si-colors {
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
    z-index: 5;
  }
  .si-swatch { width: 13px; height: 13px; border-radius: 50%; border: none; cursor: pointer; }
  .si-remove {
    position: absolute;
    top: -6px;
    right: 6px;
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

  /* picker */
  .si-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: transparent;
    border: none;
    cursor: default;
  }
  .si-picker {
    position: absolute;
    top: 68px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    width: 250px;
    border-radius: 12px;
    border: 1px solid #e4e8ec;
    background: #fff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    padding: 8px;
  }
  :global(html.dark) .si-picker { background: #1b2027; border-color: #333c46; }
  .si-tabs { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .si-tabs button {
    font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px;
    border: none; background: transparent; color: #6b7280; cursor: pointer;
  }
  .si-tabs button.active { background: #2563eb; color: #fff; }
  .si-search {
    flex: 1; min-width: 0; font-size: 11px; padding: 3px 6px; border-radius: 6px;
    border: 1px solid #e4e8ec; background: transparent; color: inherit; outline: none;
  }
  :global(html.dark) .si-search { border-color: #333c46; }
  .si-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 3px;
    max-height: 168px;
    overflow-y: auto;
  }
  .si-grid-btn {
    display: grid; place-items: center; aspect-ratio: 1; border-radius: 7px;
    border: none; background: transparent; cursor: pointer; color: #374151; padding: 5px;
  }
  :global(html.dark) .si-grid-btn { color: #cbd5e1; }
  .si-grid-btn:hover { background: color-mix(in srgb, #2563eb 14%, transparent); }
  .si-grid-btn :global(svg) { width: 100%; height: 100%; }
  .si-empty { grid-column: 1 / -1; text-align: center; font-size: 11px; color: #9ca3af; padding: 12px; }
  .si-picker-foot { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
  .si-emoji-in {
    width: 44px; font-size: 14px; text-align: center; padding: 2px; border-radius: 6px;
    border: 1px solid #e4e8ec; background: transparent; color: inherit; outline: none;
  }
  :global(html.dark) .si-emoji-in { border-color: #333c46; }
  .si-picker-foot button {
    font-size: 11px; padding: 3px 7px; border-radius: 6px; border: 1px solid #e4e8ec;
    background: transparent; color: inherit; cursor: pointer;
  }
  :global(html.dark) .si-picker-foot button { border-color: #333c46; }
  .si-picker-foot button.clear { margin-left: auto; color: #ef4444; border-color: transparent; }
</style>
