<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { Flashcard } from "$lib/ipc";
  import { cardArtSvg } from "$lib/cardArt";
  import { CARD_COLORS, cardAccent } from "$lib/cardColors";
  import { tagHue } from "$lib/badges";
  import TagBadges from "$lib/components/TagBadges.svelte";

  // Renders a flashcard FRONT (art + title + category). The art is generative
  // unless an image is set. Size is driven by the container.
  let { card }: { card: Flashcard } = $props();

  let category = $derived(
    app.flashcardCategories.find((c) => c.id === card.categoryId) ?? null,
  );

  let resolved = $derived.by(() => {
    const name = card.color ?? category?.color ?? null;
    const c = name ? CARD_COLORS.find((x) => x.name === name) : null;
    if (c) return { hue: c.hue, muted: name === "gray" };
    return { hue: tagHue(card.title || String(card.id)), muted: false };
  });

  let art = $derived(
    cardArtSvg({
      seed: card.title || String(card.id),
      hue: resolved.hue,
      uid: card.id,
      muted: resolved.muted,
    }),
  );
  let accent = $derived(
    category?.color
      ? cardAccent(category.color)
      : card.color
        ? cardAccent(card.color)
        : `hsl(${resolved.hue} 62% 50%)`,
  );
</script>

<div
  class="flex h-full w-full flex-col overflow-hidden rounded-xl border border-neutral-200/70 bg-white shadow-sm dark:border-neutral-700/70 dark:bg-neutral-900"
>
  <div class="relative" style="flex: 0 0 60%;">
    {#if card.imageUrl}
      <img src={card.imageUrl} alt="" class="h-full w-full object-cover" />
    {:else}
      {@html art}
    {/if}
    {#if card.emoji}
      <span
        class="absolute right-2 top-2 text-2xl leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
        >{card.emoji}</span
      >
    {/if}
  </div>
  <div class="flex flex-1 flex-col justify-center gap-1 px-3 py-2">
    {#if category}
      <span
        class="self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
        style="background: {accent};"
      >
        {#if category.icon}{category.icon} {/if}{category.name}
      </span>
    {/if}
    <div
      class="line-clamp-2 text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-100"
    >
      <TagBadges text={card.title} />
    </div>
  </div>
</div>
