<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { Flashcard } from "$lib/ipc";
  import { CARD_COLORS, cardAccent } from "$lib/cardColors";
  import FlashCard from "$lib/components/FlashCard.svelte";
  import FlashCardPanel from "$lib/components/FlashCardPanel.svelte";
  import FlashStudyView from "$lib/components/FlashStudyView.svelte";

  let search = $state("");
  let activeCat = $state<number | "all">("all");
  let manageOpen = $state(false);
  let studyOpen = $state(false);
  let newCatName = $state("");

  let active = $derived(app.flashcards.filter((c) => !c.archived));

  let visible = $derived.by<Flashcard[]>(() => {
    const q = search.trim().toLowerCase();
    return active.filter(
      (c) =>
        (activeCat === "all" || c.categoryId === activeCat) &&
        (!q || c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q)),
    );
  });

  // Reorder allowed when not searching (category filter is fine — we move by the
  // target card's absolute deck position).
  let reorderable = $derived(search.trim() === "");

  async function newCard() {
    await app.newFlashcard("New card");
  }

  // ---- pointer drag reorder ----
  let dragId = $state<number | null>(null);
  let dragOverId = $state<number | null>(null);
  let pinfo: { id: number; x: number; y: number; pid: number; el: Element } | null = null;
  const THRESH = 25;

  function onDown(e: PointerEvent, id: number) {
    if (e.button !== 0 || !reorderable) return;
    pinfo = { id, x: e.clientX, y: e.clientY, pid: e.pointerId, el: e.currentTarget as Element };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onMove(e: PointerEvent) {
    if (!pinfo) return;
    const dx = e.clientX - pinfo.x, dy = e.clientY - pinfo.y;
    if (dragId === null && dx * dx + dy * dy < THRESH) return;
    if (dragId === null) dragId = pinfo.id;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-fc]") as HTMLElement | null;
    dragOverId = over ? Number(over.getAttribute("data-fc")) : null;
  }
  async function onUp() {
    const info = pinfo;
    pinfo = null;
    if (!info) return;
    try { info.el.releasePointerCapture(info.pid); } catch { /* ignore */ }
    if (dragId === null) {
      app.openFlashcard(info.id); // it was a click
      return;
    }
    const id = dragId;
    const overId = dragOverId;
    dragId = null;
    dragOverId = null;
    if (overId === null || overId === id) return;
    const target = app.flashcards.find((c) => c.id === overId);
    if (target) await app.moveFlashcard(id, target.position);
  }
  function onCancel() { pinfo = null; dragId = null; dragOverId = null; }

  // ---- category manager ----
  function cycleColor(catId: number, current: string | null) {
    const idx = CARD_COLORS.findIndex((c) => c.name === current);
    const next = CARD_COLORS[(idx + 1) % CARD_COLORS.length].name;
    app.updateFlashcardCategoryById(catId, null, next, null);
  }
  async function addCategory() {
    const n = newCatName.trim();
    newCatName = "";
    if (!n) return;
    const color = CARD_COLORS[app.flashcardCategories.length % CARD_COLORS.length].name;
    await app.newFlashcardCategory(n, color, null);
  }
</script>

<main class="mx-auto flex min-h-full w-full max-w-6xl flex-col px-8 py-10" class:select-none={dragId !== null}>
  <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Flash Deck</h1>
      <p class="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{active.length} {active.length === 1 ? "card" : "cards"}</p>
    </div>
    <div class="flex items-center gap-2">
      <input bind:value={search} type="search" placeholder="Search…" class="w-40 rounded-md border border-neutral-300/60 bg-white/60 px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100" />
      <button type="button" class="rounded-md border border-neutral-300/70 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700/70 dark:text-neutral-300 dark:hover:bg-neutral-800" disabled={visible.length === 0} onclick={() => (studyOpen = true)}>Study</button>
      <button type="button" class="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700" onclick={newCard}>+ New card</button>
    </div>
  </header>

  <!-- Category filter -->
  <div class="mb-5 flex flex-wrap items-center gap-1.5">
    <button type="button" class="rounded-full px-2.5 py-0.5 text-xs" class:bg-neutral-800={activeCat === "all"} class:text-white={activeCat === "all"} class:dark:bg-neutral-200={activeCat === "all"} class:dark:text-neutral-900={activeCat === "all"} class:text-neutral-500={activeCat !== "all"} onclick={() => (activeCat = "all")}>All</button>
    {#each app.flashcardCategories as cat (cat.id)}
      <button type="button" class="rounded-full px-2.5 py-0.5 text-xs font-medium" style={activeCat === cat.id ? `background:${cardAccent(cat.color) ?? '#888'};color:#fff` : ''} class:text-neutral-500={activeCat !== cat.id} class:ring-1={activeCat !== cat.id} class:ring-neutral-300={activeCat !== cat.id} class:dark:ring-neutral-700={activeCat !== cat.id} onclick={() => (activeCat = cat.id)}>{#if cat.icon}{cat.icon} {/if}{cat.name}</button>
    {/each}
    <div class="relative">
      <button type="button" class="rounded-full border border-dashed border-neutral-300/70 px-2.5 py-0.5 text-xs text-neutral-400 hover:text-neutral-700 dark:border-neutral-600 dark:hover:text-neutral-200" onclick={() => (manageOpen = !manageOpen)}>Manage</button>
      {#if manageOpen}
        <button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close" onclick={() => (manageOpen = false)}></button>
        <div class="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-neutral-200/70 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/95">
          <p class="mb-2 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Categories</p>
          <div class="flex flex-col gap-1.5">
            {#each app.flashcardCategories as cat (cat.id)}
              <div class="flex items-center gap-1.5">
                <button type="button" class="h-5 w-5 shrink-0 rounded-full border border-black/10 dark:border-white/10" style="background: {cardAccent(cat.color) ?? '#888'};" title="Click to change color" onclick={() => cycleColor(cat.id, cat.color)} aria-label="color"></button>
                <input value={cat.icon ?? ""} maxlength="2" placeholder="◆" class="w-8 rounded border border-neutral-300/60 bg-transparent px-1 py-0.5 text-center text-sm outline-none dark:border-neutral-700/60" onchange={(e) => app.updateFlashcardCategoryById(cat.id, null, null, (e.currentTarget as HTMLInputElement).value.trim() || null)} />
                <input value={cat.name} class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-neutral-300/60 focus:border-blue-300 dark:text-neutral-200 dark:hover:border-neutral-700/60" onchange={(e) => app.updateFlashcardCategoryById(cat.id, (e.currentTarget as HTMLInputElement).value, null, null)} />
                <button type="button" class="rounded p-1 text-neutral-400 hover:text-red-500" title="Delete" onclick={() => app.deleteFlashcardCategoryById(cat.id)} aria-label="delete">✕</button>
              </div>
            {/each}
          </div>
          <div class="mt-2 flex gap-1.5 border-t border-neutral-200/60 pt-2 dark:border-neutral-700/60">
            <input bind:value={newCatName} placeholder="New category" onkeydown={(e) => { if (e.key === 'Enter') addCategory(); }} class="min-w-0 flex-1 rounded border border-neutral-300/60 bg-white px-2 py-1 text-xs outline-none dark:border-neutral-700/60 dark:bg-neutral-900/40" />
            <button type="button" class="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700" onclick={addCategory}>Add</button>
          </div>
        </div>
      {/if}
    </div>
  </div>

  {#if visible.length === 0}
    <div class="grid flex-1 place-items-center">
      <p class="text-sm text-neutral-400 dark:text-neutral-500">
        {active.length === 0 ? "No cards yet — break a concept into a card with “+ New card”." : "No cards match."}
      </p>
    </div>
  {:else}
    <div class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
      {#each visible as card (card.id)}
        <div
          data-fc={card.id}
          role="button"
          tabindex="0"
          style="aspect-ratio: 200/300;"
          class="rounded-xl transition-all"
          class:cursor-grab={reorderable && dragId === null}
          class:cursor-pointer={!reorderable}
          class:opacity-30={dragId === card.id}
          class:ring-2={dragOverId === card.id && dragId !== null}
          class:ring-blue-500={dragOverId === card.id && dragId !== null}
          class:hover:-translate-y-1={dragId === null}
          class:hover:shadow-lg={dragId === null}
          onpointerdown={(e) => onDown(e, card.id)}
          onpointermove={onMove}
          onpointerup={onUp}
          onpointercancel={onCancel}
          onkeydown={(e) => { if (e.key === "Enter") app.openFlashcard(card.id); }}
        >
          <FlashCard {card} />
        </div>
      {/each}
    </div>
  {/if}
</main>

{#if app.selectedFlashcardId !== null}
  <FlashCardPanel cardId={app.selectedFlashcardId} />
{/if}

{#if studyOpen}
  <FlashStudyView cards={visible} onClose={() => (studyOpen = false)} />
{/if}
