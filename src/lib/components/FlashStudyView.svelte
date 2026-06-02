<script lang="ts">
  import { theme } from "$lib/stores/theme.svelte";
  import type { Flashcard } from "$lib/ipc";
  import { createMarkdownIt, hydrateMermaidBlocks } from "$lib/markdownit";
  import FlashCard from "$lib/components/FlashCard.svelte";

  let { cards, onClose }: { cards: Flashcard[]; onClose: () => void } = $props();

  // A sequential order we can shuffle in place. Initialized from the session's
  // card snapshot; only re-seeded if the deck size changes.
  let order = $state<number[]>([]);
  $effect(() => {
    if (order.length !== cards.length) order = cards.map((_, i) => i);
  });
  let pos = $state(0);
  let flipped = $state(false);

  let current = $derived(cards[order[pos]] ?? null);

  const md = createMarkdownIt();
  let backHtml = $derived(current?.body.trim() ? md.render(current.body) : "");
  let backEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    const el = backEl;
    backHtml;
    const t = theme.resolved === "dark" ? "dark" : "default";
    if (!el) return;
    hydrateMermaidBlocks(el, t);
    const mo = new MutationObserver(() => hydrateMermaidBlocks(el, t));
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  });

  function go(d: number) {
    if (cards.length === 0) return;
    pos = (pos + d + order.length) % order.length;
    flipped = false;
  }
  function shuffle() {
    const a = [...order];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    order = a;
    pos = 0;
    flipped = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      flipped = !flipped;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-neutral-950/92 px-6 py-8 backdrop-blur">
  <div class="flex w-full max-w-md items-center justify-between text-xs text-neutral-400">
    <span class="tabular-nums">{cards.length === 0 ? 0 : pos + 1} / {cards.length}</span>
    <span class="uppercase tracking-widest">Study</span>
    <button type="button" class="rounded-md px-2 py-1 hover:bg-white/10" onclick={onClose}>Close ✕</button>
  </div>

  {#if current}
    <div style="perspective: 1400px; width: 320px;">
      <button
        type="button"
        class="flip relative block w-full"
        style="aspect-ratio: 320/448;"
        class:flipped
        onclick={() => (flipped = !flipped)}
        title="Flip (space)"
      >
        <div class="face"><FlashCard card={current} /></div>
        <div class="face back overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-5 text-left dark:border-neutral-700/70 dark:bg-neutral-900">
          <h3 class="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{current.title}</h3>
          {#if backHtml}
            <div bind:this={backEl} class="markdown-body overflow-y-auto text-sm leading-relaxed text-neutral-800 dark:text-neutral-200" style="max-height: 340px;">
              {@html backHtml}
            </div>
          {:else}
            <p class="text-sm italic text-neutral-400">No text on this card.</p>
          {/if}
        </div>
      </button>
    </div>
  {:else}
    <p class="text-sm text-neutral-400">No cards to study.</p>
  {/if}

  <div class="flex items-center gap-2">
    <button type="button" class="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20" onclick={() => go(-1)}>← Prev</button>
    <button type="button" class="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20" onclick={() => (flipped = !flipped)}>Flip</button>
    <button type="button" class="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20" onclick={() => go(1)}>Next →</button>
    <button type="button" class="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20" onclick={shuffle} title="Shuffle">⤮ Shuffle</button>
  </div>
  <p class="text-[11px] text-neutral-500">space = flip · ← → = navigate · esc = close</p>
</div>

<style>
  .flip { transform-style: preserve-3d; transition: transform 0.5s; }
  .flip.flipped { transform: rotateY(180deg); }
  .face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .face.back { transform: rotateY(180deg); }
</style>
