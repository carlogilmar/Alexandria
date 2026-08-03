<script lang="ts">
  import {
    STORY_ICONS,
    iconInlineSvg,
    type StoryIcon,
    type StoryIconKind,
  } from "$lib/storyIcons";

  type Props = {
    onPick: (shortcode: string) => void;
    onClose: () => void;
  };
  let { onPick, onClose }: Props = $props();

  let tab = $state<StoryIconKind>("concept");
  let query = $state("");
  let filtered = $derived(
    STORY_ICONS.filter(
      (i) =>
        i.kind === tab &&
        (query.trim() === "" ||
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.key.toLowerCase().includes(query.toLowerCase())),
    ),
  );
  // The markdown shortcode name: concept keys are flat, brand keys drop `b:`.
  function shortcode(i: StoryIcon): string {
    return i.kind === "brand" ? i.key.slice(2) : i.key;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<button type="button" class="ip-backdrop" aria-label="Close" onclick={onClose}></button>
<div class="ip" role="dialog" aria-label="Insert icon">
  <div class="ip-head">
    <div class="ip-tabs">
      <button type="button" class:active={tab === "concept"} onclick={() => (tab = "concept")}>Concepts</button>
      <button type="button" class:active={tab === "brand"} onclick={() => (tab = "brand")}>Logos</button>
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={query} placeholder="Search…" class="ip-search" autofocus />
    <button type="button" class="ip-x" aria-label="Close" onclick={onClose}>✕</button>
  </div>
  <div class="ip-grid">
    {#each filtered as i (i.key)}
      <button
        type="button"
        class="ip-btn"
        title={`${i.label}  ·  :${shortcode(i)}:`}
        onclick={() => onPick(shortcode(i))}
      >
        <span class="ip-glyph" class:concept={i.kind === "concept"}>{@html iconInlineSvg(i)}</span>
        <span class="ip-name">{shortcode(i)}</span>
      </button>
    {/each}
    {#if filtered.length === 0}
      <p class="ip-empty">No matches.</p>
    {/if}
  </div>
  <p class="ip-foot">Inserts <code>:{"name"}:</code> — renders inline, tinting with the text color (concepts).</p>
</div>

<style>
  .ip-backdrop {
    position: fixed;
    inset: 0;
    z-index: 82;
    background: rgba(15, 18, 24, 0.4);
    backdrop-filter: blur(2px);
    border: none;
    cursor: default;
  }
  .ip {
    position: fixed;
    left: 50%;
    top: 12vh;
    z-index: 83;
    width: min(94vw, 460px);
    transform: translateX(-50%);
    border-radius: 14px;
    border: 1px solid var(--border, #e4e8ec);
    background: #fff;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    padding: 12px;
  }
  :global(html.dark) .ip {
    background: #14181c;
    border-color: #262d35;
    color: #e7eaee;
  }
  .ip-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .ip-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: color-mix(in srgb, currentColor 8%, transparent); }
  .ip-tabs button {
    font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 6px;
    border: none; background: transparent; color: color-mix(in srgb, currentColor 55%, transparent); cursor: pointer;
  }
  .ip-tabs button.active { background: #2563eb; color: #fff; }
  .ip-search {
    flex: 1; min-width: 0; font-size: 13px; padding: 5px 9px; border-radius: 8px;
    border: 1px solid var(--border, #e4e8ec); background: transparent; color: inherit; outline: none;
  }
  :global(html.dark) .ip-search { border-color: #333c46; }
  .ip-x { border: none; background: transparent; color: color-mix(in srgb, currentColor 55%, transparent); font-size: 15px; cursor: pointer; padding: 4px; }
  .ip-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    max-height: 46vh;
    overflow-y: auto;
  }
  .ip-btn {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 8px 4px 6px; border-radius: 9px; border: none; background: transparent; cursor: pointer;
    color: inherit;
  }
  .ip-btn:hover { background: color-mix(in srgb, #2563eb 12%, transparent); }
  .ip-glyph { width: 26px; height: 26px; display: grid; place-items: center; }
  .ip-glyph :global(svg) { width: 100%; height: 100%; }
  .ip-glyph.concept { color: #334155; }
  :global(html.dark) .ip-glyph.concept { color: #cbd5e1; }
  .ip-name {
    font-size: 9.5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: color-mix(in srgb, currentColor 55%, transparent);
  }
  .ip-empty { grid-column: 1 / -1; text-align: center; font-size: 12px; padding: 16px; color: color-mix(in srgb, currentColor 50%, transparent); }
  .ip-foot { margin: 10px 2px 0; font-size: 11px; color: color-mix(in srgb, currentColor 50%, transparent); }
  .ip-foot code { font-family: ui-monospace, monospace; }
</style>
