<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { FeedbackCardSummary, FeedbackColumn } from "$lib/ipc";
  import FeedbackCardPanel from "$lib/components/FeedbackCardPanel.svelte";

  const COLUMNS: { key: FeedbackColumn; label: string }[] = [
    { key: "to_implement", label: "To Implement" },
    { key: "in_definition", label: "In Definition" },
    { key: "in_progress", label: "In Progress" },
    { key: "done", label: "Done" },
  ];

  let board = $derived(
    app.feedbackBoards.find((b) => b.id === app.selectedFeedbackBoardId) ??
      null,
  );

  // Per-column card lists, sorted by position.
  function cardsForColumn(col: FeedbackColumn): FeedbackCardSummary[] {
    return app.feedbackCards
      .filter((c) => c.columnKind === col)
      .sort((a, b) => a.position - b.position);
  }

  // Inline new-card form state, keyed by column.
  let addingCol = $state<FeedbackColumn | null>(null);
  let addTitleDraft = $state("");
  let addDescDraft = $state("");
  let addInput: HTMLInputElement | undefined = $state();

  function startAdd(col: FeedbackColumn) {
    addingCol = col;
    addTitleDraft = "";
    addDescDraft = "";
    queueMicrotask(() => addInput?.focus());
  }
  function cancelAdd() {
    addingCol = null;
    addTitleDraft = "";
    addDescDraft = "";
  }
  async function commitAdd() {
    if (!addingCol) return;
    const t = addTitleDraft.trim();
    if (!t) {
      cancelAdd();
      return;
    }
    await app.newFeedbackCard(addingCol, t, addDescDraft);
    cancelAdd();
  }
  function onAddKey(e: KeyboardEvent) {
    if (e.key === "Escape") cancelAdd();
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitAdd();
  }

  // -------- Pointer-events drag-and-drop --------
  // HTML5 drag/drop is unreliable in WKWebView. We do our own DnD with
  // pointer events: pointerdown captures the pointer, pointermove past a
  // threshold enters drag mode and renders a floating ghost, pointerup
  // commits via app.moveFeedbackCard.
  let draggingId = $state<number | null>(null);
  let dragOverCol = $state<FeedbackColumn | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let ghostX = $state(0);
  let ghostY = $state(0);

  type PointerInfo = {
    cardId: number;
    startX: number;
    startY: number;
    pointerId: number;
    capturedEl: Element;
  };
  let pointerInfo: PointerInfo | null = null;
  const DRAG_THRESHOLD_SQ = 25; // 5px

  function onCardPointerDown(e: PointerEvent, cardId: number) {
    if (e.button !== 0) return;
    pointerInfo = {
      cardId,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      capturedEl: e.currentTarget as Element,
    };
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onCardPointerMove(e: PointerEvent) {
    if (!pointerInfo) return;
    const dx = e.clientX - pointerInfo.startX;
    const dy = e.clientY - pointerInfo.startY;
    // Threshold gate so a click doesn't accidentally start a drag.
    if (draggingId === null && dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
    if (draggingId === null) {
      draggingId = pointerInfo.cardId;
    }
    ghostX = e.clientX;
    ghostY = e.clientY;
    // Determine drop target via the column under the pointer.
    // Temporarily hide the ghost so elementFromPoint sees through it.
    const colEl = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-col]") as HTMLElement | null;
    if (!colEl) {
      dragOverCol = null;
      dragOverIndex = null;
      return;
    }
    dragOverCol = colEl.getAttribute("data-col") as FeedbackColumn;
    // Walk the cards inside the column inner to find drop index.
    const innerEl = colEl.querySelector("[data-col-inner]") as HTMLElement | null;
    if (!innerEl) {
      dragOverIndex = 0;
      return;
    }
    const cards = Array.from(
      innerEl.querySelectorAll("[data-card-id]"),
    ) as HTMLElement[];
    let idx = cards.length;
    for (let i = 0; i < cards.length; i++) {
      // Skip the card we're currently dragging — its rect would skew
      // the calculation since it's still in the DOM.
      if (cards[i].getAttribute("data-card-id") === String(draggingId)) continue;
      const rect = cards[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        idx = i;
        break;
      }
    }
    dragOverIndex = idx;
  }

  async function onCardPointerUp(e: PointerEvent) {
    const info = pointerInfo;
    pointerInfo = null;
    if (!info) return;
    try {
      info.capturedEl.releasePointerCapture(info.pointerId);
    } catch {
      // ignore
    }
    if (draggingId === null) {
      // No drag happened — treat as a click.
      onCardClick(info.cardId);
      return;
    }
    const id = draggingId;
    const col = dragOverCol;
    const idx = dragOverIndex;
    draggingId = null;
    dragOverCol = null;
    dragOverIndex = null;
    if (col === null || idx === null) return;
    await app.moveFeedbackCard(id, col, idx);
  }

  function onCardPointerCancel() {
    pointerInfo = null;
    draggingId = null;
    dragOverCol = null;
    dragOverIndex = null;
  }

  // Floating ghost shows the title of the dragged card under the cursor.
  let draggedCard = $derived(
    draggingId === null
      ? null
      : app.feedbackCards.find((c) => c.id === draggingId) ?? null,
  );

  // Header rename.
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let titleInputEl: HTMLInputElement | undefined = $state();

  function startTitleEdit() {
    if (!board) return;
    titleDraft = board.title;
    editingTitle = true;
    queueMicrotask(() => titleInputEl?.focus());
  }
  async function commitTitleEdit() {
    editingTitle = false;
    if (!board) return;
    if (titleDraft.trim() === board.title) return;
    await app.renameFeedbackBoard(board.id, titleDraft);
  }
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitTitleEdit();
    else if (e.key === "Escape") {
      titleDraft = board?.title ?? "";
      editingTitle = false;
    }
  }

  function onCardClick(cardId: number) {
    app.openFeedbackCard(cardId);
  }
</script>

{#if board}
  <main class="mx-auto flex h-full w-full max-w-[1400px] flex-col px-6 pb-6 pt-8">
    <header class="mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-neutral-300/70 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700/70 dark:text-neutral-300 dark:hover:bg-neutral-800"
          onclick={() => app.openFeedback()}
        >
          ← Boards
        </button>
        {#if editingTitle}
          <input
            bind:this={titleInputEl}
            bind:value={titleDraft}
            onblur={commitTitleEdit}
            onkeydown={onTitleKey}
            class="rounded-md border-none bg-transparent px-2 py-1 text-xl font-semibold tracking-tight text-neutral-900 outline-none ring-2 ring-blue-500/40 focus:ring-blue-500 dark:text-neutral-100"
          />
        {:else}
          <button
            type="button"
            class="rounded-md px-2 py-1 text-xl font-semibold tracking-tight text-neutral-900 hover:bg-neutral-200/40 dark:text-neutral-100 dark:hover:bg-neutral-700/30"
            onclick={startTitleEdit}
          >
            {board.title}
          </button>
        {/if}
        {#if board.archived}
          <span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            archived
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
          title={board.archived ? "Unarchive" : "Archive"}
          onclick={() => app.setFeedbackBoardArchived(board.id, !board.archived)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/>
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title="Delete board"
          onclick={() => app.deleteFeedbackBoard(board.id)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="grid flex-1 grid-cols-4 gap-3 overflow-hidden">
      {#each COLUMNS as col}
        {@const cards = cardsForColumn(col.key)}
        <section
          class="flex min-h-0 flex-col rounded-lg border border-neutral-200/70 bg-neutral-50/70 transition-colors dark:border-neutral-700/70 dark:bg-neutral-900/40"
          class:border-blue-400={dragOverCol === col.key}
          class:dark:border-blue-500={dragOverCol === col.key}
          role="group"
          aria-label={col.label}
          data-col={col.key}
        >
          <header class="flex items-center justify-between px-3 pb-2 pt-3">
            <h3 class="text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
              {col.label}
            </h3>
            <span class="rounded-full bg-neutral-200/60 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-600 dark:bg-neutral-700/40 dark:text-neutral-300">
              {cards.length}
            </span>
          </header>

          <div class="flex-1 overflow-y-auto px-2 pb-2" data-col-inner>
            {#each cards as c, idx (c.id)}
              {#if dragOverCol === col.key && dragOverIndex === idx && draggingId !== c.id}
                <div class="mb-2 h-0.5 rounded bg-blue-500"></div>
              {/if}
              <div
                data-card-id={c.id}
                role="button"
                tabindex="0"
                onpointerdown={(e) => onCardPointerDown(e, c.id)}
                onpointermove={onCardPointerMove}
                onpointerup={onCardPointerUp}
                onpointercancel={onCardPointerCancel}
                onkeydown={(e) => {
                  if (e.key === "Enter") onCardClick(c.id);
                }}
                class="mb-2 select-none rounded-md border border-neutral-200/80 bg-white px-3 py-2 shadow-sm transition-colors hover:border-neutral-300 dark:border-neutral-700/80 dark:bg-neutral-900 dark:hover:border-neutral-600"
                class:cursor-grab={draggingId === null}
                class:cursor-grabbing={draggingId === c.id}
                class:opacity-30={draggingId === c.id}
              >
                <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {c.title}
                </p>
                {#if c.description.trim()}
                  <p class="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                    {c.description}
                  </p>
                {/if}
                {#if c.commentCount > 0}
                  <p class="mt-2 inline-flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                    <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
                      <path fill-rule="evenodd" d="M3 4a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-3.586l-2.707 2.707A1 1 0 017 16v-2H5a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
                    </svg>
                    {c.commentCount}
                  </p>
                {/if}
              </div>
            {/each}
            {#if dragOverCol === col.key && dragOverIndex === cards.length && draggingId !== null}
              <div class="mb-2 h-0.5 rounded bg-blue-500"></div>
            {/if}

            {#if addingCol === col.key}
              <div class="rounded-md border border-blue-300/70 bg-white p-2 shadow-sm dark:border-blue-700/70 dark:bg-neutral-900">
                <input
                  bind:this={addInput}
                  bind:value={addTitleDraft}
                  onkeydown={onAddKey}
                  type="text"
                  placeholder="Card title"
                  class="w-full rounded border border-neutral-300/70 bg-white px-2 py-1 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
                />
                <textarea
                  bind:value={addDescDraft}
                  onkeydown={onAddKey}
                  placeholder="Description (optional)"
                  class="mt-1 w-full resize-y rounded border border-neutral-300/70 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
                  rows="2"
                ></textarea>
                <div class="mt-1 flex justify-end gap-1">
                  <button
                    type="button"
                    class="rounded px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    onclick={cancelAdd}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                    onclick={commitAdd}
                  >
                    Add card
                  </button>
                </div>
              </div>
            {:else}
              <button
                type="button"
                class="w-full rounded-md border border-dashed border-neutral-300/60 px-2 py-1.5 text-left text-xs text-neutral-400 transition-colors hover:border-neutral-400 hover:bg-neutral-100/40 hover:text-neutral-700 dark:border-neutral-700/60 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/30 dark:hover:text-neutral-200"
                onclick={() => startAdd(col.key)}
              >
                + Add card
              </button>
            {/if}
          </div>
        </section>
      {/each}
    </div>
  </main>

  {#if draggedCard}
    <div
      class="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 rounded-md border border-neutral-300/90 bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-lg dark:border-neutral-600/90 dark:bg-neutral-800 dark:text-neutral-100"
      style="left: {ghostX}px; top: {ghostY}px; max-width: 220px;"
    >
      {draggedCard.title}
    </div>
  {/if}

  {#if app.selectedFeedbackCardId !== null}
    <FeedbackCardPanel cardId={app.selectedFeedbackCardId} />
  {/if}
{:else}
  <main class="mx-auto flex min-h-full w-full items-center justify-center px-8">
    <p class="text-sm text-neutral-400">Board not found.</p>
  </main>
{/if}
