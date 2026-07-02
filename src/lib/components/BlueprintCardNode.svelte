<script lang="ts">
  import { Handle, NodeResizer, Position, useSvelteFlow } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { CARD_COLORS, cardAccent } from "$lib/cardColors";
  import { createMarkdownIt } from "$lib/markdownit";

  type CardData = {
    nodeId: number;
    title: string;
    description: string;
    color: string | null;
  };
  type Props = {
    id: string;
    data: CardData;
    selected?: boolean;
  };
  let { id, data, selected = false }: Props = $props();

  const { deleteElements } = useSvelteFlow();
  // Markdown for the description. Mermaid fences are deliberately NOT
  // hydrated inside cards (diagram-in-diagram; breaks PNG export fidelity) —
  // they render as the plain placeholder block.
  const md = createMarkdownIt();
  // Badges: inline code (`like this`) renders as an accent-colored pill —
  // see the `:not(pre) > code` rule below. Fenced blocks stay code-styled.

  // ----- title editing -----
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let titleInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (!editingTitle) titleDraft = data.title;
  });

  function startTitleEdit(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    editingTitle = true;
    queueMicrotask(() => {
      titleInput?.focus();
      titleInput?.select();
    });
  }
  async function commitTitle() {
    editingTitle = false;
    const next = titleDraft.trim();
    if (next === data.title || !next) return;
    await app.updateBlueprintCard(data.nodeId, next, null);
  }
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  }

  // ----- description editing -----
  let editingDesc = $state(false);
  let descDraft = $state("");
  let descArea: HTMLTextAreaElement | undefined = $state();

  $effect(() => {
    if (!editingDesc) descDraft = data.description;
  });

  function startDescEdit(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    editingDesc = true;
    queueMicrotask(() => descArea?.focus());
  }
  async function commitDesc() {
    editingDesc = false;
    if (descDraft === data.description) return;
    await app.updateBlueprintCard(data.nodeId, null, descDraft);
  }
  function onDescKey(e: KeyboardEvent) {
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
  let accent = $derived(
    cardAccent(data.color) ?? (isDark ? "hsl(220 10% 45%)" : "hsl(220 10% 62%)"),
  );
  let hue = $derived(CARD_COLORS.find((c) => c.name === data.color)?.hue ?? null);
  let bg = $derived.by(() => {
    if (hue === null || data.color === "gray") {
      return isDark ? "rgba(38, 38, 38, 0.96)" : "rgba(255, 255, 255, 0.96)";
    }
    return isDark ? `hsl(${hue} 26% 15% / 0.96)` : `hsl(${hue} 75% 97% / 0.96)`;
  });
  let descHtml = $derived(
    data.description.trim() ? md.render(data.description) : "",
  );
  let handleStyle = $derived(`background: ${accent};`);
</script>

<div
  class="bp-card"
  class:bp-card-selected={selected}
  style:--bp-accent={accent}
  style:background={bg}
>
  <NodeResizer
    minWidth={180}
    minHeight={80}
    isVisible={selected}
    lineClass="bp-card-resize-line"
    handleClass="bp-card-resize-handle"
    onResizeEnd={(_e, params) => {
      void app.resizeBlueprintNode(data.nodeId, params.width, params.height);
    }}
  />

  <!-- Four connection points so diagrams can flow left→right or top→bottom.
       Loose connection mode (set on the SvelteFlow) lets any handle start or
       end a connection. Handle ids are persisted on the edge row. -->
  <Handle id="t" type="source" position={Position.Top} style={handleStyle} />
  <Handle id="r" type="source" position={Position.Right} style={handleStyle} />
  <Handle id="b" type="source" position={Position.Bottom} style={handleStyle} />
  <Handle id="l" type="source" position={Position.Left} style={handleStyle} />

  <button
    type="button"
    class="bp-card-remove nodrag"
    aria-label="Remove card"
    title="Remove from blueprint"
    onclick={removeNode}
  >
    ×
  </button>

  {#if editingTitle}
    <input
      bind:this={titleInput}
      bind:value={titleDraft}
      onblur={commitTitle}
      onkeydown={onTitleKey}
      class="bp-card-title-edit nodrag"
      placeholder="Card title"
    />
  {:else}
    <div
      class="bp-card-title"
      role="textbox"
      tabindex="0"
      onclick={startTitleEdit}
      onkeydown={(e) => {
        if (e.key === "Enter") startTitleEdit(e);
      }}
    >
      {data.title.trim() || "Untitled"}
    </div>
  {/if}

  {#if editingDesc}
    <textarea
      bind:this={descArea}
      bind:value={descDraft}
      onblur={commitDesc}
      onkeydown={onDescKey}
      class="bp-card-desc-edit nodrag"
      placeholder="Description (markdown)…"
    ></textarea>
  {:else if descHtml}
    <div
      class="bp-card-desc markdown-body"
      role="textbox"
      tabindex="0"
      onclick={startDescEdit}
      onkeydown={(e) => {
        if (e.key === "Enter") startDescEdit(e);
      }}
    >
      {@html descHtml}
    </div>
  {:else}
    <div
      class="bp-card-desc bp-card-desc-empty"
      role="textbox"
      tabindex="0"
      onclick={startDescEdit}
      onkeydown={(e) => {
        if (e.key === "Enter") startDescEdit(e);
      }}
    >
      (description — click to edit)
    </div>
  {/if}

  {#if selected}
    <!-- Color strip: floats above the card while selected. -->
    <div class="bp-card-colors nodrag">
      {#each CARD_COLORS as c (c.name)}
        <button
          type="button"
          class="bp-color-dot"
          class:bp-color-dot-active={data.color === c.name}
          style:background={cardAccent(c.name)}
          title={c.name}
          aria-label={`Color: ${c.name}`}
          onclick={(e) => {
            e.stopPropagation();
            void app.setBlueprintCardColor(
              data.nodeId,
              data.color === c.name ? null : c.name,
            );
          }}
        ></button>
      {/each}
      <button
        type="button"
        class="bp-color-dot bp-color-clear"
        title="No color"
        aria-label="Clear color"
        onclick={(e) => {
          e.stopPropagation();
          void app.setBlueprintCardColor(data.nodeId, null);
        }}
      >
        ×
      </button>
    </div>
  {/if}
</div>

<style>
  .bp-card {
    position: relative;
    width: 100%;
    /* height: 100% only bites when the node has an explicit height (after a
       manual resize). With no persisted height the node auto-sizes to its
       text — this is what makes cards grow with their content. */
    height: 100%;
    min-height: 64px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 10px 12px 10px 14px;
    border-radius: 8px;
    border-left: 4px solid var(--bp-accent);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.08),
      0 0 0 1px rgba(0, 0, 0, 0.07);
    font-family: ui-sans-serif, system-ui, sans-serif;
    color: rgb(23, 23, 23);
    /* No overflow: hidden — it would clip the resize + connection handles. */
  }
  :global(html.dark) .bp-card {
    color: rgb(229, 229, 229);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.1);
  }
  .bp-card-selected {
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.08),
      0 0 0 2px var(--bp-accent);
  }

  /* Title dominates; description is the complement. */
  .bp-card-title,
  .bp-card-title-edit {
    font-size: 16px;
    font-weight: 650;
    line-height: 1.25;
    letter-spacing: -0.01em;
    word-break: break-word;
    cursor: text;
    outline: none;
    text-align: center;
  }
  .bp-card-title-edit {
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
  }

  .bp-card-desc,
  .bp-card-desc-edit {
    margin-top: 6px;
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-size: 12px;
    line-height: 1.45;
    cursor: text;
    outline: none;
    opacity: 0.85;
  }
  .bp-card-desc-empty {
    font-style: italic;
    opacity: 0.4;
  }
  .bp-card-desc-edit {
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    resize: none;
  }
  /* Tighten markdown spacing inside the small card body. */
  .bp-card-desc :global(p) {
    margin: 0 0 0.4em;
  }
  .bp-card-desc :global(ul),
  .bp-card-desc :global(ol) {
    margin: 0 0 0.4em;
    padding-left: 1.2em;
  }
  .bp-card-desc :global(pre) {
    margin: 0 0 0.4em;
    padding: 4px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.06);
    overflow-x: auto;
  }
  :global(html.dark) .bp-card-desc :global(pre) {
    background: rgba(255, 255, 255, 0.08);
  }
  /* Badges: inline `code` renders as a pill tinted with the card accent.
     Only inline code — code inside fenced blocks (pre) keeps code styling. */
  .bp-card-desc :global(:not(pre) > code) {
    display: inline-block;
    padding: 0 8px;
    border-radius: 9999px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 10px;
    font-weight: 650;
    line-height: 1.7;
    letter-spacing: 0.02em;
    vertical-align: baseline;
    white-space: nowrap;
    background: color-mix(in srgb, var(--bp-accent) 16%, transparent);
    color: color-mix(in srgb, var(--bp-accent) 75%, rgb(23, 23, 23));
    border: 1px solid color-mix(in srgb, var(--bp-accent) 35%, transparent);
  }
  :global(html.dark) .bp-card-desc :global(:not(pre) > code) {
    background: color-mix(in srgb, var(--bp-accent) 26%, transparent);
    color: color-mix(in srgb, var(--bp-accent) 55%, white);
    border-color: color-mix(in srgb, var(--bp-accent) 45%, transparent);
  }

  .bp-card-remove {
    position: absolute;
    top: 4px;
    right: 6px;
    width: 18px;
    height: 18px;
    line-height: 1;
    font-size: 16px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.3);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms;
    z-index: 1;
  }
  .bp-card:hover .bp-card-remove {
    opacity: 1;
  }
  .bp-card-remove:hover {
    background: rgba(0, 0, 0, 0.08);
    color: rgb(190, 50, 50);
  }
  :global(html.dark) .bp-card-remove {
    color: rgba(255, 255, 255, 0.35);
  }
  :global(html.dark) .bp-card-remove:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgb(248, 113, 113);
  }

  .bp-card-colors {
    position: absolute;
    top: -34px;
    left: 0;
    display: flex;
    gap: 4px;
    padding: 5px 6px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.95);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(0, 0, 0, 0.08);
  }
  :global(html.dark) .bp-card-colors {
    background: rgba(23, 23, 23, 0.95);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .bp-color-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.15);
    cursor: pointer;
    padding: 0;
    transition: transform 100ms;
  }
  .bp-color-dot:hover {
    transform: scale(1.2);
  }
  .bp-color-dot-active {
    outline: 2px solid rgba(0, 0, 0, 0.55);
    outline-offset: 1px;
  }
  :global(html.dark) .bp-color-dot-active {
    outline-color: rgba(255, 255, 255, 0.7);
  }
  .bp-color-clear {
    background: transparent;
    color: rgba(0, 0, 0, 0.5);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }
  :global(html.dark) .bp-color-clear {
    color: rgba(255, 255, 255, 0.5);
  }

  :global(.bp-card-resize-line) {
    border-color: color-mix(in srgb, var(--bp-accent) 55%, transparent);
  }
  :global(.bp-card-resize-handle) {
    background: var(--bp-accent);
    border: 1.5px solid white;
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
</style>
