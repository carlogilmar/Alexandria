<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { saveImageFile } from "$lib/ipc";
  import { CARD_COLORS, cardAccent } from "$lib/cardColors";
  import { createMarkdownIt, hydrateMermaidBlocks } from "$lib/markdownit";
  import FlashCard from "$lib/components/FlashCard.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";

  let { cardId }: { cardId: number } = $props();
  let card = $derived(app.flashcards.find((c) => c.id === cardId) ?? null);

  let flipped = $state(false);

  // Title (inline edit)
  let titleDraft = $state("");
  let editingTitle = $state(false);
  let titleInput: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (!editingTitle && card) titleDraft = card.title;
  });
  function startTitleEdit() {
    if (!card) return;
    titleDraft = card.title;
    editingTitle = true;
    queueMicrotask(() => titleInput?.focus());
  }
  async function commitTitle() {
    editingTitle = false;
    if (!card || titleDraft.trim() === card.title || !titleDraft.trim()) return;
    await app.updateFlashcardText(card.id, titleDraft, null);
  }

  // Back-of-card rendered markdown (read view inside the flip)
  const md = createMarkdownIt();
  let backHtml = $derived(card?.body.trim() ? md.render(card.body) : "");
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

  // Category
  let addingCat = $state(false);
  let newCatName = $state("");
  async function addCategory() {
    const n = newCatName.trim();
    addingCat = false;
    newCatName = "";
    if (!n || !card) return;
    // Give the new category a color seeded by its position in the palette.
    const color = CARD_COLORS[app.flashcardCategories.length % CARD_COLORS.length].name;
    const created = await app.newFlashcardCategory(n, color, null);
    if (created) await app.setFlashcardCategory(card.id, created.id);
  }

  // Image
  async function uploadImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f || !card) return;
      try {
        const url = await saveImageFile(f);
        await app.setFlashcardImage(card.id, url);
      } catch (e) {
        app.setFlash(`Couldn't set image: ${e}`);
      }
    };
    input.click();
  }

  function close() {
    app.closeFlashcard();
  }
</script>

{#if card}
  <button
    type="button"
    aria-label="Close panel"
    class="fixed inset-0 z-40 cursor-default bg-neutral-900/30 dark:bg-neutral-950/50"
    onclick={close}
  ></button>
  <aside
    class="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-700/80 dark:bg-neutral-900"
  >
    <header class="flex items-center justify-between gap-2 border-b border-neutral-200/70 px-5 py-3 dark:border-neutral-700/70">
      <span class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Flashcard</span>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-md p-1.5 transition-colors"
          class:text-amber-500={card.pinned}
          class:text-neutral-400={!card.pinned}
          class:hover:bg-neutral-200={!card.pinned}
          class:dark:hover:bg-neutral-700={!card.pinned}
          title={card.pinned ? "Unpin" : "Pin to sidebar"}
          onclick={() => app.toggleFlashcardPin(card.id)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/></svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
          title={card.archived ? "Unarchive" : "Archive"}
          onclick={() => app.setFlashcardArchived(card.id, !card.archived)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/></svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title="Delete card"
          onclick={() => app.deleteFlashcardById(card.id)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="Close"
          onclick={close}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      <!-- Flip preview -->
      <div class="mx-auto" style="perspective: 1200px; width: 200px;">
        <button
          type="button"
          class="flip relative block w-full"
          style="aspect-ratio: 200/280;"
          class:flipped
          title="Flip the card"
          onclick={() => (flipped = !flipped)}
        >
          <div class="face">
            <FlashCard {card} />
          </div>
          <div class="face back overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-3 text-left dark:border-neutral-700/70 dark:bg-neutral-900">
            {#if backHtml}
              <div bind:this={backEl} class="markdown-body overflow-y-auto text-[12px] leading-relaxed text-neutral-800 dark:text-neutral-200" style="max-height: 100%;">
                {@html backHtml}
              </div>
            {:else}
              <p class="grid h-full place-items-center text-center text-xs italic text-neutral-400">No text yet — add it below.</p>
            {/if}
          </div>
        </button>
      </div>
      <p class="mt-1 text-center text-[11px] text-neutral-400 dark:text-neutral-500">click the card to flip</p>

      <!-- Title -->
      <div class="mt-4">
        {#if editingTitle}
          <input
            bind:this={titleInput}
            bind:value={titleDraft}
            onblur={commitTitle}
            onkeydown={(e) => { if (e.key === "Enter") commitTitle(); else if (e.key === "Escape") editingTitle = false; }}
            class="w-full rounded-md border-none bg-transparent text-lg font-semibold tracking-tight text-neutral-900 outline-none ring-2 ring-blue-500/40 focus:ring-blue-500 dark:text-neutral-100"
          />
        {:else}
          <button type="button" class="block w-full rounded-md text-left text-lg font-semibold tracking-tight text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800/60" onclick={startTitleEdit} title="Click to rename · #tags become badges">
            {card.title}
          </button>
        {/if}
      </div>

      <!-- Category -->
      <h3 class="mb-1.5 mt-5 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Category</h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <button type="button" class="rounded-full border px-2 py-0.5 text-xs" class:ring-2={card.categoryId === null} class:ring-blue-500={card.categoryId === null} class:border-neutral-300={true} class:dark:border-neutral-600={true} onclick={() => app.setFlashcardCategory(card.id, null)}>None</button>
        {#each app.flashcardCategories as cat (cat.id)}
          <button
            type="button"
            class="rounded-full px-2 py-0.5 text-xs font-medium text-white"
            class:ring-2={card.categoryId === cat.id}
            class:ring-offset-1={card.categoryId === cat.id}
            class:ring-blue-500={card.categoryId === cat.id}
            class:dark:ring-offset-neutral-900={card.categoryId === cat.id}
            style="background: {cardAccent(cat.color) ?? 'hsl(220 8% 55%)'};"
            onclick={() => app.setFlashcardCategory(card.id, cat.id)}
          >{#if cat.icon}{cat.icon} {/if}{cat.name}</button>
        {/each}
        {#if addingCat}
          <input
            bind:value={newCatName}
            onblur={addCategory}
            onkeydown={(e) => { if (e.key === "Enter") addCategory(); else if (e.key === "Escape") { addingCat = false; newCatName = ""; } }}
            placeholder="New category"
            class="rounded-full border border-blue-300/70 px-2 py-0.5 text-xs outline-none dark:border-blue-700/70 dark:bg-neutral-900"
          />
        {:else}
          <button type="button" class="rounded-full border border-dashed border-neutral-300/70 px-2 py-0.5 text-xs text-neutral-400 hover:text-neutral-700 dark:border-neutral-600 dark:hover:text-neutral-200" onclick={() => { addingCat = true; queueMicrotask(() => {}); }}>+ New</button>
        {/if}
      </div>

      <!-- Color -->
      <h3 class="mb-1.5 mt-5 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Color</h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <button type="button" class="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-neutral-400 dark:border-neutral-600" class:ring-2={!card.color} class:ring-blue-500={!card.color} title="Default (from category / title)" onclick={() => app.setFlashcardColor(card.id, null)}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" class="h-3.5 w-3.5"><path d="M4 16L16 4" stroke-width="1.5"/></svg>
        </button>
        {#each CARD_COLORS as c (c.name)}
          <button type="button" class="h-6 w-6 rounded-full border border-black/10 dark:border-white/10" class:ring-2={card.color === c.name} class:ring-offset-1={card.color === c.name} class:ring-blue-500={card.color === c.name} class:dark:ring-offset-neutral-900={card.color === c.name} style="background: {cardAccent(c.name)};" title={c.name} onclick={() => app.setFlashcardColor(card.id, c.name)}></button>
        {/each}
      </div>

      <!-- Emoji + Image -->
      <div class="mt-5 flex items-end gap-4">
        <div>
          <h3 class="mb-1.5 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Emoji</h3>
          <input
            value={card.emoji ?? ""}
            maxlength="2"
            placeholder="🎴"
            class="w-14 rounded-md border border-neutral-300/70 bg-white px-2 py-1 text-center text-lg outline-none dark:border-neutral-700/70 dark:bg-neutral-900/40"
            onchange={(e) => app.setFlashcardEmoji(card.id, (e.currentTarget as HTMLInputElement).value.trim() || null)}
          />
        </div>
        <div class="flex-1">
          <h3 class="mb-1.5 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Image</h3>
          <div class="flex gap-1.5">
            <button type="button" class="rounded-md border border-neutral-300/70 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700/70 dark:text-neutral-300 dark:hover:bg-neutral-800" onclick={uploadImage}>{card.imageUrl ? "Replace" : "Upload"}</button>
            {#if card.imageUrl}
              <button type="button" class="rounded-md border border-neutral-300/70 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700/70 dark:hover:bg-neutral-800" onclick={() => app.setFlashcardImage(card.id, null)}>Remove</button>
            {/if}
          </div>
        </div>
      </div>

      <!-- Body (the card's back text) -->
      <h3 class="mb-1.5 mt-5 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Card text</h3>
      {#key card.id}
        <MarkdownEditor
          value={card.body}
          placeholder="The card's content — markdown supported."
          minHeight="10rem"
          onCommit={(b) => app.updateFlashcardText(card.id, null, b)}
        />
      {/key}
    </div>
  </aside>
{/if}

<style>
  .flip {
    transform-style: preserve-3d;
    transition: transform 0.5s;
  }
  .flip.flipped {
    transform: rotateY(180deg);
  }
  .face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .face.back {
    transform: rotateY(180deg);
  }
</style>
