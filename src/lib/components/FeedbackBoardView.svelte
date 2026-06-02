<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { FeedbackCardSummary } from "$lib/ipc";
  import { cardAccent } from "$lib/cardColors";
  import FeedbackCardPanel from "$lib/components/FeedbackCardPanel.svelte";
  import TagBadges from "$lib/components/TagBadges.svelte";

  let board = $derived(
    app.feedbackBoards.find((b) => b.id === app.selectedFeedbackBoardId) ?? null,
  );
  let columns = $derived(app.feedbackColumns);

  function cardsForColumn(colId: number): FeedbackCardSummary[] {
    return app.feedbackCards
      .filter((c) => c.columnId === colId)
      .sort((a, b) => a.position - b.position);
  }

  // -------- Quick add: Enter adds a card and keeps the input open --------
  let addingColId = $state<number | null>(null);
  let addTitleDraft = $state("");
  let addInput: HTMLInputElement | undefined = $state();

  function startAdd(colId: number) {
    addingColId = colId;
    addTitleDraft = "";
    queueMicrotask(() => addInput?.focus());
  }
  function closeAdd() {
    addingColId = null;
    addTitleDraft = "";
  }
  async function commitAddKeep() {
    const t = addTitleDraft.trim();
    const colId = addingColId;
    if (!t || colId === null) return;
    addTitleDraft = "";
    await app.newFeedbackCard(colId, t);
    queueMicrotask(() => addInput?.focus()); // ready for the next card
  }
  async function onAddBlur() {
    const t = addTitleDraft.trim();
    const colId = addingColId;
    if (t && colId !== null) {
      addTitleDraft = "";
      await app.newFeedbackCard(colId, t);
    }
    closeAdd();
  }
  function onAddKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      addTitleDraft = "";
      closeAdd();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitAddKeep();
    }
  }

  // -------- Column management --------
  let editingColId = $state<number | null>(null);
  let colNameDraft = $state("");
  let colInput: HTMLInputElement | undefined = $state();

  function startRenameCol(id: number, name: string) {
    editingColId = id;
    colNameDraft = name;
    queueMicrotask(() => colInput?.select());
  }
  async function commitRenameCol() {
    const id = editingColId;
    editingColId = null;
    if (id === null) return;
    await app.renameFeedbackColumn(id, colNameDraft);
  }
  function onColKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitRenameCol();
    else if (e.key === "Escape") editingColId = null;
  }

  let addingColumn = $state(false);
  let newColName = $state("");
  let newColInput: HTMLInputElement | undefined = $state();
  function startAddColumn() {
    addingColumn = true;
    newColName = "";
    queueMicrotask(() => newColInput?.focus());
  }
  async function commitAddColumn() {
    const n = newColName.trim();
    addingColumn = false;
    if (!n) return;
    await app.newFeedbackColumn(n);
  }
  function onNewColKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitAddColumn();
    else if (e.key === "Escape") addingColumn = false;
  }

  // -------- Pointer-events drag-and-drop (WKWebView-safe) --------
  let draggingId = $state<number | null>(null);
  let dragOverColId = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let ghostX = $state(0);
  let ghostY = $state(0);
  let interacting = $state(false); // suppresses text selection while pressing

  type PointerInfo = {
    cardId: number;
    startX: number;
    startY: number;
    pointerId: number;
    capturedEl: Element;
  };
  let pointerInfo: PointerInfo | null = null;
  const DRAG_THRESHOLD_SQ = 25;

  function onCardPointerDown(e: PointerEvent, cardId: number) {
    if (e.button !== 0) return;
    interacting = true;
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
    if (draggingId === null && dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
    if (draggingId === null) draggingId = pointerInfo.cardId;
    ghostX = e.clientX;
    ghostY = e.clientY;
    const colEl = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-col]") as HTMLElement | null;
    if (!colEl) {
      dragOverColId = null;
      dragOverIndex = null;
      return;
    }
    dragOverColId = Number(colEl.getAttribute("data-col"));
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

  async function onCardPointerUp() {
    const info = pointerInfo;
    pointerInfo = null;
    interacting = false;
    if (!info) return;
    try {
      info.capturedEl.releasePointerCapture(info.pointerId);
    } catch {
      // ignore
    }
    if (draggingId === null) {
      onCardClick(info.cardId);
      return;
    }
    const id = draggingId;
    const colId = dragOverColId;
    const idx = dragOverIndex;
    draggingId = null;
    dragOverColId = null;
    dragOverIndex = null;
    if (colId === null || idx === null) return;
    await app.moveFeedbackCard(id, colId, idx);
  }

  function onCardPointerCancel() {
    pointerInfo = null;
    draggingId = null;
    dragOverColId = null;
    dragOverIndex = null;
    interacting = false;
  }

  let draggedCard = $derived(
    draggingId === null
      ? null
      : (app.feedbackCards.find((c) => c.id === draggingId) ?? null),
  );

  // -------- Header rename --------
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
  <main
    class="mx-auto flex h-full w-full max-w-[1600px] flex-col px-6 pb-6 pt-8"
    class:select-none={interacting}
  >
    <header class="mb-4 flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
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
            class="min-w-0 truncate rounded-md px-2 py-1 text-xl font-semibold tracking-tight text-neutral-900 hover:bg-neutral-200/40 dark:text-neutral-100 dark:hover:bg-neutral-700/30"
            onclick={startTitleEdit}
            title="Click to rename · use #tags to categorize"
          >
            <TagBadges text={board.title} />
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
          class="rounded-md p-1.5 transition-colors"
          class:text-amber-500={board.pinned}
          class:text-neutral-400={!board.pinned}
          class:hover:bg-neutral-200={!board.pinned}
          class:dark:hover:bg-neutral-700={!board.pinned}
          title={board.pinned ? "Unpin" : "Pin to sidebar"}
          onclick={() => app.setFeedbackBoardPinned(board.id, !board.pinned)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
          </svg>
        </button>
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

    <div class="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden pb-2">
      {#each columns as col (col.id)}
        {@const cards = cardsForColumn(col.id)}
        <section
          class="flex w-72 shrink-0 flex-col rounded-lg border border-neutral-200/70 bg-neutral-50/70 transition-colors dark:border-neutral-700/70 dark:bg-neutral-900/40"
          class:border-blue-400={dragOverColId === col.id}
          class:dark:border-blue-500={dragOverColId === col.id}
          role="group"
          aria-label={col.name}
          data-col={col.id}
        >
          <header class="group flex items-center justify-between gap-1 px-3 pb-2 pt-3">
            {#if editingColId === col.id}
              <input
                bind:this={colInput}
                bind:value={colNameDraft}
                onblur={commitRenameCol}
                onkeydown={onColKey}
                class="w-full rounded border border-blue-300/70 bg-white px-1.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-neutral-700 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-blue-700/70 dark:bg-neutral-900 dark:text-neutral-200"
              />
            {:else}
              <button
                type="button"
                class="flex-1 truncate text-left text-xs font-semibold uppercase tracking-widest text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                title="Rename column"
                onclick={() => startRenameCol(col.id, col.name)}
              >
                {col.name}
              </button>
              <span class="rounded-full bg-neutral-200/60 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-600 dark:bg-neutral-700/40 dark:text-neutral-300">
                {cards.length}
              </span>
              <button
                type="button"
                class="rounded p-0.5 text-neutral-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-neutral-600"
                title="Delete column"
                onclick={() => app.deleteFeedbackColumn(col.id)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9z" clip-rule="evenodd"/>
                </svg>
              </button>
            {/if}
          </header>

          <div class="flex-1 overflow-y-auto px-2 pb-2" data-col-inner>
            {#each cards as c, idx (c.id)}
              {#if dragOverColId === col.id && dragOverIndex === idx && draggingId !== c.id}
                <div class="mb-2 h-0.5 rounded bg-blue-500"></div>
              {/if}
              {@const accent = cardAccent(c.color)}
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
                style={accent ? `border-left: 3px solid ${accent};` : ""}
              >
                <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  <TagBadges text={c.title} />
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
            {#if dragOverColId === col.id && dragOverIndex === cards.length && draggingId !== null}
              <div class="mb-2 h-0.5 rounded bg-blue-500"></div>
            {/if}

            {#if addingColId === col.id}
              <input
                bind:this={addInput}
                bind:value={addTitleDraft}
                onkeydown={onAddKey}
                onblur={onAddBlur}
                type="text"
                placeholder="Card title — Enter to add, Esc to close"
                class="w-full rounded-md border border-blue-300/70 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-blue-700/70 dark:bg-neutral-900 dark:text-neutral-100"
              />
            {:else}
              <button
                type="button"
                class="w-full rounded-md border border-dashed border-neutral-300/60 px-2 py-1.5 text-left text-xs text-neutral-400 transition-colors hover:border-neutral-400 hover:bg-neutral-100/40 hover:text-neutral-700 dark:border-neutral-700/60 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/30 dark:hover:text-neutral-200"
                onclick={() => startAdd(col.id)}
              >
                + Add card
              </button>
            {/if}
          </div>
        </section>
      {/each}

      <!-- Add column -->
      <div class="w-60 shrink-0 pt-3">
        {#if addingColumn}
          <input
            bind:this={newColInput}
            bind:value={newColName}
            onkeydown={onNewColKey}
            onblur={commitAddColumn}
            type="text"
            placeholder="Column name — Enter"
            class="w-full rounded-md border border-blue-300/70 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-blue-700/70 dark:bg-neutral-900 dark:text-neutral-100"
          />
        {:else}
          <button
            type="button"
            class="w-full rounded-lg border border-dashed border-neutral-300/60 px-3 py-2 text-left text-xs text-neutral-400 transition-colors hover:border-neutral-400 hover:bg-neutral-100/40 hover:text-neutral-700 dark:border-neutral-700/60 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/30 dark:hover:text-neutral-200"
            onclick={startAddColumn}
          >
            + Add column
          </button>
        {/if}
      </div>
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
