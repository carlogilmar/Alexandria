<script lang="ts">
  import { flip } from "svelte/animate";
  import { app, todayIso } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import TagBadges from "$lib/components/TagBadges.svelte";
  import { reveal } from "$lib/anim";

  let query = $state("");
  let searchInput: HTMLInputElement | undefined = $state();
  let logoFailed = $state(false);

  const commitHash = __APP_COMMIT__;
  const commitMessage = __APP_COMMIT_MESSAGE__;
  const commitDate = __APP_COMMIT_DATE__;
  let commitOpen = $state(false);

  // Editable app-brand label (Sprint 31).
  let editingBrand = $state(false);
  let brandDraft = $state("");
  let brandInput: HTMLInputElement | undefined = $state();

  function startBrandEdit() {
    brandDraft = theme.brandLabel;
    editingBrand = true;
    queueMicrotask(() => {
      brandInput?.focus();
      brandInput?.select();
    });
  }
  function commitBrandEdit() {
    if (!editingBrand) return;
    editingBrand = false;
    theme.setBrandLabel(brandDraft);
  }
  function onBrandKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitBrandEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      editingBrand = false;
    }
  }

  let commitDatePretty = $derived(
    commitDate
      ? new Date(commitDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "",
  );

  // Debounced search
  $effect(() => {
    const q = query.trim();
    if (q.length === 0) {
      app.clearSearch();
      return;
    }
    const timer = setTimeout(() => app.runSearch(q), 150);
    return () => clearTimeout(timer);
  });

  export function focus() {
    searchInput?.focus();
    searchInput?.select();
  }
  let isSearching = $derived(query.trim().length > 0);

  // ----- Today's-list quick access (unchanged detection) -----
  let today = $state(todayIso());
  $effect(() => {
    const sync = () => {
      const now = todayIso();
      if (now !== today) today = now;
    };
    const interval = setInterval(sync, 30_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  });
  let todaysList = $derived.by(() => {
    const candidates = app.lists.filter((l) => l.date === today && !l.archived);
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (b.id < a.id ? b : a));
  });

  // ----- Unified Pinned list (Sprint 49) -----
  type PinKind = "note" | "blueprint" | "storyboard" | "board" | "flashcard";
  type Pin = {
    key: string;
    kind: PinKind;
    id: number;
    title: string;
    meta: string;
    hue: number;
    badge: boolean;
    selected: boolean;
  };
  const ICON: Record<PinKind, string> = {
    note: '<path d="M5 3h7l3 3v11H5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h5M8 11h5M8 14h3" stroke="currentColor" stroke-width="1.5"/>',
    blueprint: '<rect x="3" y="3" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="12" y="12" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5h4v6.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    storyboard: '<rect x="3" y="5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 5v10M13 5v10" stroke="currentColor" stroke-width="1.5"/>',
    board: '<rect x="3" y="3" width="4" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="3" width="4" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="3.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    flashcard: '<rect x="3.5" y="5" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 9h6M7 12h4" stroke="currentColor" stroke-width="1.5"/>',
  };

  let allPins = $derived<Pin[]>([
    ...app.notes.filter((n) => n.pinned && !n.archived).map((n) => ({ key: `note:${n.id}`, kind: "note" as const, id: n.id, title: n.title, meta: n.date.slice(5), hue: 217, badge: false, selected: app.view === "note" && app.selectedNote?.id === n.id })),
    ...app.blueprints.filter((b) => b.pinned && !b.archived).map((b) => ({ key: `blueprint:${b.id}`, kind: "blueprint" as const, id: b.id, title: b.title, meta: "", hue: 200, badge: false, selected: app.view === "blueprint" && app.selectedBlueprint?.id === b.id })),
    ...app.storyboards.filter((s) => s.pinned && !s.archived).map((s) => ({ key: `storyboard:${s.id}`, kind: "storyboard" as const, id: s.id, title: s.title, meta: "", hue: 158, badge: false, selected: app.view === "storyboard" && app.selectedStoryboard?.id === s.id })),
    ...app.feedbackBoards.filter((b) => b.pinned && !b.archived).map((b) => ({ key: `board:${b.id}`, kind: "board" as const, id: b.id, title: b.title, meta: "", hue: 350, badge: true, selected: app.view === "feedback-board" && app.selectedFeedbackBoardId === b.id })),
    ...app.flashcards.filter((c) => c.pinned && !c.archived).map((c) => ({ key: `flashcard:${c.id}`, kind: "flashcard" as const, id: c.id, title: c.title, meta: "", hue: 175, badge: true, selected: app.view === "flashdeck" && app.selectedFlashcardId === c.id })),
  ]);
  let pinMap = $derived(new Map(allPins.map((p) => [p.key, p])));
  let baseOrder = $derived(
    [...allPins]
      .sort((a, b) => {
        const pa = app.pinOrder[a.key] ?? Infinity;
        const pb = app.pinOrder[b.key] ?? Infinity;
        return pa !== pb ? pa - pb : a.key < b.key ? -1 : 1;
      })
      .map((p) => p.key),
  );

  // Local display order — mirrors baseOrder except during an active drag.
  let order = $state<string[]>([]);
  $effect(() => {
    if (dragKey === null) order = baseOrder;
  });
  let pinsToRender = $derived(order.map((k) => pinMap.get(k)).filter((p): p is Pin => !!p));

  function openPin(p: Pin) {
    if (p.kind === "note") app.selectNote(p.id);
    else if (p.kind === "blueprint") app.openBlueprint(p.id);
    else if (p.kind === "storyboard") app.openStoryboard(p.id);
    else if (p.kind === "board") app.openFeedbackBoard(p.id);
    else app.openFlashcardInDeck(p.id);
  }
  function unpin(p: Pin) {
    if (p.kind === "note") app.setNotePinnedById(p.id, false);
    else if (p.kind === "blueprint") app.setBlueprintPinned(p.id, false);
    else if (p.kind === "storyboard") app.setStoryboardPinned(p.id, false);
    else if (p.kind === "board") app.setFeedbackBoardPinned(p.id, false);
    else app.toggleFlashcardPin(p.id);
  }

  // ----- Pointer-based drag reorder (HTML5 DnD is unreliable in WKWebView) -----
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flipDur = reduced ? 0 : 200;
  let listEl: HTMLElement | undefined = $state();
  let dragKey = $state<string | null>(null);
  let potentialKey: string | null = null;
  let startX = 0;
  let startY = 0;

  function reorderFromPointer(clientY: number) {
    if (!listEl || dragKey === null) return;
    const rows = Array.from(listEl.querySelectorAll<HTMLElement>("[data-pin-key]"));
    let above = 0;
    for (const row of rows) {
      if (row.dataset.pinKey === dragKey) continue;
      const r = row.getBoundingClientRect();
      if (r.top + r.height / 2 < clientY) above++;
    }
    const without = order.filter((k) => k !== dragKey);
    const target = Math.max(0, Math.min(without.length, above));
    const next = [...without.slice(0, target), dragKey, ...without.slice(target)];
    if (next.length !== order.length || next.some((k, i) => k !== order[i])) order = next;
  }
  function rowDown(e: PointerEvent, key: string) {
    if (e.button !== 0) return;
    potentialKey = key;
    startX = e.clientX;
    startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function rowMove(e: PointerEvent) {
    if (potentialKey === null) return;
    if (dragKey === null) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
      dragKey = potentialKey;
    }
    reorderFromPointer(e.clientY);
  }
  function rowUp(e: PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (dragKey !== null) {
      void app.reorderPins(order);
      dragKey = null;
    } else if (potentialKey !== null) {
      const p = pinMap.get(potentialKey);
      if (p) openPin(p);
    }
    potentialKey = null;
  }
  function rowKey(e: KeyboardEvent, p: Pin) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPin(p);
    }
  }

  let todayPct = $derived(
    todaysList && todaysList.total > 0 ? Math.round((todaysList.done / todaysList.total) * 100) : 0,
  );
</script>

<aside
  class="relative isolate flex h-screen w-60 shrink-0 flex-col overflow-hidden border-r px-3 pb-2 pt-12"
  class:dark={theme.isSidebarDark}
  style="background-color: var(--sidebar-bg); border-color: var(--sidebar-border);"
  data-tauri-drag-region
>
  {#if theme.sidebarAurora}
    <div class="aurora" class:aurora-light={!theme.isSidebarDark} aria-hidden="true">
      {#each theme.sidebarAurora as c, i (i)}
        <div class="aurora-blob aurora-blob-{i}" style="background: radial-gradient(circle at 50% 50%, {c} 0%, transparent 65%);"></div>
      {/each}
      <div class="aurora-noise"></div>
    </div>
  {/if}

  <div class="relative mb-3 flex flex-col items-center pt-0.5" use:reveal={{ delay: 30 }}>
    <button type="button" onclick={() => app.goHome(true)} aria-label="Go to home — today" class="flex flex-col items-center gap-2 rounded-xl px-4 py-1.5 transition-colors hover:bg-neutral-200/30 dark:hover:bg-neutral-700/25">
      {#if !logoFailed}
        <img src={theme.resolved === "dark" || theme.isSidebarDark ? "/logo-dark.png" : "/logo.png"} alt="Alexandria logo" class="pointer-events-none h-16 w-16 select-none rounded-2xl shadow-sm" draggable="false" onerror={() => (logoFailed = true)} />
      {/if}
      <span class="app-title text-neutral-700 dark:text-neutral-100">Alexandria</span>
    </button>
    <button type="button" class="absolute right-0 top-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200" title="Collapse sidebar" aria-label="Collapse sidebar" onclick={() => app.toggleSidebar()}>
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg>
    </button>
  </div>

  <div class="mb-2 px-1" use:reveal={{ delay: 70 }}>
    <input bind:this={searchInput} bind:value={query} type="search" placeholder="Search todos…" title="Searches todos. Press ⌘K to search everything." class="w-full rounded-md border border-neutral-300/60 bg-white/60 px-2 py-1 text-xs outline-none transition-shadow placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500" />
    <button type="button" class="mt-1 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-200/50 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-300" onclick={() => (app.paletteOpen = true)}>
      Search everything
      <kbd class="rounded border border-neutral-300/70 px-1 font-mono text-[10px] dark:border-neutral-600/70">⌘K</kbd>
    </button>
  </div>

  <nav class="flex-1 overflow-y-auto">
    {#if isSearching}
      <div class="mb-2 px-2 pt-1">
        <p class="pb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{app.searchResults.length === 0 ? "No results" : "Results"}</p>
      </div>
      {#each app.searchResults as hit (hit.id)}
        <button type="button" class="mb-1 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-800" onclick={() => { query = ""; app.goToHit(hit); }}>
          <div class="flex items-center gap-2">
            {#if hit.completed}<span class="text-[10px] text-neutral-400">✓</span>{/if}
            <span class="truncate text-sm text-neutral-700 dark:text-neutral-300" class:line-through={hit.completed} class:text-neutral-400={hit.completed}>{hit.text}</span>
          </div>
          <p class="text-[11px] text-neutral-400 dark:text-neutral-500">{hit.listDate} · {hit.listTitle}</p>
        </button>
      {/each}
    {:else}
      <!-- Today's list -->
      {#if todaysList}
        <button
          type="button"
          class="mb-2 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors"
          class:border-blue-500={app.view === "list" && app.selected?.id === todaysList.id}
          class:bg-blue-50={app.view === "list" && app.selected?.id === todaysList.id}
          class:dark:bg-blue-950={app.view === "list" && app.selected?.id === todaysList.id}
          class:border-neutral-200={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:bg-white={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:hover:bg-neutral-100={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:dark:border-neutral-700={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:dark:bg-neutral-900={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:dark:hover:bg-neutral-800={!(app.view === "list" && app.selected?.id === todaysList.id)}
          onclick={() => todaysList && app.select(todaysList.id)}
          title="Today's list — ⌘N to create one for any day"
          use:reveal={{ delay: 110 }}
        >
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M6 2a1 1 0 011 1v1h6V3a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1zm-1 6v9h10V8H5z" clip-rule="evenodd"/></svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Today's list</p>
            <p class="truncate text-xs font-medium text-neutral-700 dark:text-neutral-200">{todaysList.done}/{todaysList.total === 0 ? "—" : todaysList.total} {todaysList.total > 0 ? "done" : "empty"}</p>
            {#if todaysList.total > 0}
              <div class="mt-1 h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div class="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out dark:bg-emerald-400" style="width: {todayPct}%"></div>
              </div>
            {/if}
          </div>
        </button>
      {:else}
        <button type="button" class="mb-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-neutral-300/70 px-2.5 py-2.5 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-100/60 hover:text-neutral-700 dark:border-neutral-700/70 dark:text-neutral-400 dark:hover:bg-neutral-800/40 dark:hover:text-neutral-200" onclick={() => app.newList()} title="Create today's list" use:reveal={{ delay: 110 }}>
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          Create today's list
        </button>
      {/if}

      <!-- Backlog -->
      <button
        type="button"
        class="mb-2 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors"
        class:border-blue-500={app.view === "list" && app.selected?.isBacklog}
        class:bg-blue-50={app.view === "list" && app.selected?.isBacklog}
        class:dark:bg-blue-950={app.view === "list" && app.selected?.isBacklog}
        class:border-neutral-200={!(app.view === "list" && app.selected?.isBacklog)}
        class:bg-white={!(app.view === "list" && app.selected?.isBacklog)}
        class:hover:bg-neutral-100={!(app.view === "list" && app.selected?.isBacklog)}
        class:dark:border-neutral-700={!(app.view === "list" && app.selected?.isBacklog)}
        class:dark:bg-neutral-900={!(app.view === "list" && app.selected?.isBacklog)}
        class:dark:hover:bg-neutral-800={!(app.view === "list" && app.selected?.isBacklog)}
        onclick={() => app.openBacklog()}
        use:reveal={{ delay: 150 }}
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" /><path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zm4 2a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[10.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Backlog</p>
          <p class="truncate text-xs font-medium text-neutral-700 dark:text-neutral-200">{app.backlogPending > 0 ? `${app.backlogPending} pending` : "empty"}</p>
        </div>
        {#if app.backlogPending > 0}
          <span class="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-900 dark:text-violet-200">{app.backlogPending}</span>
        {/if}
      </button>

      <!-- + Add -->
      <button type="button" class="add-btn mb-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-2 text-sm font-semibold text-white shadow-sm transition-[transform,box-shadow] hover:bg-blue-700 hover:shadow-md active:translate-y-px dark:bg-blue-700 dark:hover:bg-blue-600" onclick={() => (app.addModalOpen = true)} use:reveal={{ delay: 190 }}>
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
        Add
      </button>

      <!-- Pinned (unified, drag-to-reorder) -->
      <div class="mb-1 flex items-center gap-2 px-2" use:reveal={{ delay: 230 }}>
        <h2 class="text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Pinned</h2>
        {#if allPins.length > 0}<span class="font-mono text-[10.5px] text-neutral-300 dark:text-neutral-600">{allPins.length}</span>{/if}
      </div>

      {#if allPins.length === 0}
        <p class="px-2 text-[11px] italic text-neutral-400 dark:text-neutral-500" use:reveal={{ delay: 260 }}>
          Pin items from the Library to keep them one click away here. Drag to reorder.
        </p>
      {:else}
        <div class="pin-list -mx-1 px-1" class:is-dragging={dragKey !== null} bind:this={listEl}>
          {#each pinsToRender as p, i (p.key)}
            <div
              data-pin-key={p.key}
              role="button"
              tabindex="0"
              class="pin-row group flex items-center gap-2 rounded-lg px-2 py-1.5"
              class:selected={p.selected}
              class:dragging={dragKey === p.key}
              onpointerdown={(e) => rowDown(e, p.key)}
              onpointermove={rowMove}
              onpointerup={rowUp}
              onkeydown={(e) => rowKey(e, p)}
              animate:flip={{ duration: flipDur }}
              use:reveal={{ delay: 270 + i * 30, y: 6 }}
            >
              <span class="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md" style="background: hsl({p.hue} 70% 55% / 0.16); color: hsl({p.hue} 70% {theme.isSidebarDark || theme.resolved === 'dark' ? '68%' : '46%'});">
                <svg viewBox="0 0 20 20" class="h-3.5 w-3.5">{@html ICON[p.kind]}</svg>
              </span>
              <span class="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">
                {#if p.badge}<TagBadges text={p.title} />{:else}{p.title || "Untitled"}{/if}
              </span>
              {#if p.meta}<span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{p.meta}</span>{/if}
              <button
                type="button"
                class="unpin-btn grid h-5 w-5 shrink-0 place-items-center rounded text-neutral-300 opacity-0 transition-opacity hover:bg-neutral-200/60 hover:text-red-500 group-hover:opacity-100 dark:text-neutral-600 dark:hover:bg-neutral-700/50 dark:hover:text-red-400"
                title="Unpin"
                aria-label="Unpin"
                onpointerdown={(e) => e.stopPropagation()}
                onclick={(e) => { e.stopPropagation(); unpin(p); }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </nav>

  <div class="mt-2 border-t border-neutral-300/40 px-2 pt-2 text-[11px] text-neutral-400 dark:border-neutral-700/40 dark:text-neutral-500">
    <div class="group relative mb-2 flex items-center justify-center">
      {#if editingBrand}
        <input bind:this={brandInput} bind:value={brandDraft} onblur={commitBrandEdit} onkeydown={onBrandKey} maxlength="60" class="brand-label w-full rounded border-none bg-transparent px-0.5 py-0 text-center uppercase text-neutral-400 outline-none ring-1 ring-blue-500/40 focus:ring-blue-500 dark:text-neutral-500" aria-label="App name" />
      {:else}
        <span class="brand-label uppercase text-center text-neutral-400 dark:text-neutral-500">{theme.brandLabel}</span>
        <button type="button" class="absolute right-0 top-1/2 -translate-y-1/2 shrink-0 rounded p-0.5 text-neutral-300 opacity-0 transition-opacity hover:bg-neutral-200/60 hover:text-neutral-600 group-hover:opacity-100 focus:opacity-100 dark:text-neutral-600 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-300" title="Rename this app" aria-label="Rename this app" onclick={startBrandEdit}>
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
        </button>
      {/if}
    </div>
    <button type="button" class="mt-1.5 flex w-full items-center justify-between rounded px-1 py-1 text-left text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200" onclick={() => (app.helpOpen = true)}>
      <span>Shortcuts</span>
      <span class="font-mono text-[10px]">?</span>
    </button>
    <div class="relative">
      <button type="button" class="mt-1.5 flex w-full items-center justify-between rounded px-1 py-0.5 text-[10px] text-neutral-300 transition-colors hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-600 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-300" title="Show the commit this build was made from" onclick={() => (commitOpen = !commitOpen)}>
        <span>build</span>
        <span class="font-mono">{commitHash}</span>
      </button>
      {#if commitOpen}
        <button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close commit details" onclick={() => (commitOpen = false)}></button>
        <div class="absolute bottom-7 left-0 right-0 z-50 rounded-lg border border-neutral-200/70 bg-white/95 p-3 text-left shadow-lg backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/95">
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="text-[10px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Build commit</span>
            <span class="select-text font-mono text-[10px] text-neutral-500 dark:text-neutral-400">{commitHash}</span>
          </div>
          {#if commitDatePretty}<p class="mb-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">{commitDatePretty}</p>{/if}
          {#if commitMessage}
            <pre class="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-200">{commitMessage}</pre>
          {:else}
            <p class="text-[11px] italic text-neutral-400 dark:text-neutral-500">No commit message available.</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</aside>

<style>
  .brand-label {
    font-family: "Oswald", var(--font-sans);
    font-weight: 600;
    font-size: 15px;
    line-height: 1.15;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* Product wordmark at the top of the sidebar (the logo is a mark, not a
     wordmark, so the name lives here). Oswald, the bundled brand face. */
  .app-title {
    font-family: "Oswald", var(--font-sans);
    font-weight: 600;
    font-size: 18px;
    letter-spacing: 0.14em;
    line-height: 1;
    text-transform: uppercase;
  }

  /* Pinned rows: pointer-drag reorder. `touch-action: none` so pointer
     capture drags rather than scrolls; disabling text selection (with the
     -webkit- prefix, required by Tauri's WKWebView) stops the stray
     highlight while dragging. `grab`/`grabbing` cursors signal draggability. */
  .pin-row {
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    transition: background 0.12s;
  }
  .pin-row:hover { background: rgba(120, 120, 120, 0.12); }
  .pin-row.selected { background: rgba(59, 130, 246, 0.16); }
  .pin-row.dragging {
    background: var(--sidebar-bg, rgba(30, 30, 30, 0.9));
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
    transform: scale(1.02);
    position: relative;
    z-index: 5;
  }
  /* While a drag is in progress force the grabbing cursor everywhere in the
     list, and belt-and-braces block selection. */
  .pin-list.is-dragging,
  .pin-list.is-dragging * {
    cursor: grabbing !important;
    -webkit-user-select: none;
    user-select: none;
  }

  /* + Add flourish: the icon rotates on hover. */
  .add-btn svg { transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
  .add-btn:hover svg { transform: rotate(90deg); }
  @media (prefers-reduced-motion: reduce) {
    .add-btn svg { transition: none; }
  }

  .aurora { position: absolute; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
  .aurora-blob {
    position: absolute; width: 200%; aspect-ratio: 1; border-radius: 50%;
    filter: blur(36px); opacity: 0.45; mix-blend-mode: screen;
    animation: aurora-drift 18s ease-in-out infinite alternate; will-change: transform;
  }
  .aurora-blob-0 { top: -30%; left: -55%; animation-duration: 4s; }
  .aurora-blob-1 { top: 15%; left: -20%; animation-duration: 5.5s; animation-delay: -2s; }
  .aurora-blob-2 { top: 55%; left: -60%; animation-duration: 4.75s; animation-delay: -3.25s; }
  .aurora-light .aurora-blob { mix-blend-mode: multiply; opacity: 0.5; }
  .aurora-light .aurora-noise { opacity: 0.05; }
  @keyframes aurora-drift {
    from { transform: translate3d(-12%, -8%, 0) scale(1) rotate(0deg); }
    to { transform: translate3d(14%, 10%, 0) scale(1.3) rotate(30deg); }
  }
  .aurora-noise {
    position: absolute; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.08; mix-blend-mode: overlay;
  }
  @media (prefers-reduced-motion: reduce) {
    .aurora-blob { animation: none; }
  }
</style>
