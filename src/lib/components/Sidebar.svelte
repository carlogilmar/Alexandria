<script lang="ts">
  import { app, todayIso } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import AddEntityModal from "$lib/components/AddEntityModal.svelte";
  import TagBadges from "$lib/components/TagBadges.svelte";

  let query = $state("");
  let searchInput: HTMLInputElement | undefined = $state();
  let logoFailed = $state(false);
  let addModalOpen = $state(false);

  // Git commit this bundle was built from (injected by Vite — see vite.config.js).
  const commitHash = __APP_COMMIT__;
  const commitMessage = __APP_COMMIT_MESSAGE__;
  const commitDate = __APP_COMMIT_DATE__;
  let commitOpen = $state(false);

  let commitDatePretty = $derived(
    commitDate
      ? new Date(commitDate).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
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

  // Exposed for ⌘F
  export function focus() {
    searchInput?.focus();
    searchInput?.select();
  }

  function isWorkflowSelected(id: number): boolean {
    return app.view === "workflow" && app.selectedWorkflow?.id === id;
  }

  function isNoteSelected(id: number): boolean {
    return app.view === "note" && app.selectedNote?.id === id;
  }

  function isArticleSelected(id: number): boolean {
    return app.view === "article" && app.selectedArticle?.id === id;
  }

  function isBoardSelected(id: number): boolean {
    return app.view === "feedback-board" && app.selectedFeedbackBoardId === id;
  }

  let isSearching = $derived(query.trim().length > 0);

  // The sidebar now shows ONLY pinned items per section. The full list of
  // every entity lives in Summary; pinning is the user's way to keep
  // important things one click away.
  let pinnedWorkflows = $derived(
    app.workflows.filter((w) => w.pinned && !w.archived),
  );
  let pinnedArticles = $derived(
    app.articles.filter((a) => a.pinned && !a.archived),
  );
  let pinnedNotes = $derived(app.notes.filter((n) => n.pinned && !n.archived));
  let pinnedBoards = $derived(
    app.feedbackBoards.filter((b) => b.pinned && !b.archived),
  );
  let pinnedFlashcards = $derived(
    app.flashcards.filter((c) => c.pinned && !c.archived),
  );

  function isFlashcardSelected(id: number): boolean {
    return app.view === "flashdeck" && app.selectedFlashcardId === id;
  }

  // Today's-list quick access: detect by date string match.
  //
  // The wall clock is NOT reactive — with `$derived(todayIso())` an app left
  // open across midnight kept matching *yesterday's* list even after the new
  // day's list was created. Tick the date on an interval and when the window
  // regains focus so this section always reflects the actual current day.
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
  // Strictly today's active lists only — never a previous day's. If several
  // exist, take the first-created (lowest id), matching the backend's
  // `list_today` (ORDER BY id ASC LIMIT 1). With no match the template shows
  // the "Create today's list" affordance instead.
  let todaysList = $derived.by(() => {
    const candidates = app.lists.filter(
      (l) => l.date === today && !l.archived,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (b.id < a.id ? b : a));
  });
</script>

<aside
  class="relative isolate flex h-screen w-60 shrink-0 flex-col overflow-hidden border-r px-3 pb-2 pt-12"
  class:dark={theme.isSidebarDark}
  style="background-color: var(--sidebar-bg); border-color: var(--sidebar-border);"
  data-tauri-drag-region
>
  {#if theme.sidebarAurora}
    <!-- Animated aurora backdrop: drifting blurred color blobs + a noise
         grain, painted behind the content (negative z inside the isolated
         stacking context). Colors come from the selected tint. -->
    <div class="aurora" aria-hidden="true">
      {#each theme.sidebarAurora as c, i (i)}
        <div
          class="aurora-blob aurora-blob-{i}"
          style="background: radial-gradient(circle at 50% 50%, {c} 0%, transparent 65%);"
        ></div>
      {/each}
      <div class="aurora-noise"></div>
    </div>
  {/if}
  <div class="mb-3 flex h-14 items-center">
    <button
      type="button"
      onclick={() => app.goHome(true)}
      aria-label="Go to home — today"
      class="flex h-full flex-1 items-center rounded-md px-1 transition-colors hover:bg-neutral-200/40 dark:hover:bg-neutral-700/30"
    >
      {#if !logoFailed}
        <img
          src={theme.resolved === "dark" || theme.isSidebarDark
            ? "/logo-dark.png"
            : "/logo.png"}
          alt="Alexandria"
          class="pointer-events-none h-12 w-auto max-w-full select-none"
          draggable="false"
          onerror={() => (logoFailed = true)}
        />
      {:else}
        <span
          class="text-sm font-semibold tracking-tight text-neutral-700 dark:text-neutral-200"
        >
          Alexandria
        </span>
      {/if}
    </button>
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
      title="Collapse sidebar"
      aria-label="Collapse sidebar"
      onclick={() => app.toggleSidebar()}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
      </svg>
    </button>
  </div>

  <div class="mb-2 px-1">
    <input
      bind:this={searchInput}
      bind:value={query}
      type="search"
      placeholder="Search todos…"
      title="Searches todos. Press ⌘K to search everything."
      class="w-full rounded-md border border-neutral-300/60 bg-white/60 px-2 py-1 text-xs outline-none transition-shadow placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    />
    <button
      type="button"
      class="mt-1 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-200/50 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-300"
      onclick={() => (app.paletteOpen = true)}
    >
      Search everything
      <kbd class="rounded border border-neutral-300/70 px-1 font-mono text-[10px] dark:border-neutral-600/70">⌘K</kbd>
    </button>
  </div>

  <nav class="flex-1 overflow-y-auto">
    {#if isSearching}
      <div class="mb-2 px-2 pt-1">
        <p
          class="pb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
        >
          {app.searchResults.length === 0 ? "No results" : "Results"}
        </p>
      </div>
      {#each app.searchResults as hit (hit.id)}
        <button
          type="button"
          class="mb-1 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-800"
          onclick={() => {
            query = "";
            app.goToHit(hit);
          }}
        >
          <div class="flex items-center gap-2">
            {#if hit.completed}
              <span class="text-[10px] text-neutral-400">✓</span>
            {/if}
            <span
              class="truncate text-sm text-neutral-700 dark:text-neutral-300"
              class:line-through={hit.completed}
              class:text-neutral-400={hit.completed}
            >
              {hit.text}
            </span>
          </div>
          <p class="text-[11px] text-neutral-400 dark:text-neutral-500">
            {hit.listDate} · {hit.listTitle}
          </p>
        </button>
      {/each}
    {:else}
      <!-- Today's list quick access -->
      {#if todaysList}
        <button
          type="button"
          class="mb-3 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm font-medium transition-colors"
          class:border-blue-500={app.view === "list" && app.selected?.id === todaysList.id}
          class:bg-blue-50={app.view === "list" && app.selected?.id === todaysList.id}
          class:dark:border-blue-500={app.view === "list" && app.selected?.id === todaysList.id}
          class:dark:bg-blue-950={app.view === "list" && app.selected?.id === todaysList.id}
          class:border-neutral-200={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:bg-white={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:hover:bg-neutral-100={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:dark:border-neutral-700={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:dark:bg-neutral-900={!(app.view === "list" && app.selected?.id === todaysList.id)}
          class:dark:hover:bg-neutral-800={!(app.view === "list" && app.selected?.id === todaysList.id)}
          onclick={() => todaysList && app.select(todaysList.id)}
          title="Today's list — ⌘N to create one for any day"
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
              <path fill-rule="evenodd" d="M6 2a1 1 0 011 1v1h6V3a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1zm-1 6v9h10V8H5z" clip-rule="evenodd"/>
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-neutral-500 dark:text-neutral-400">Today's list</p>
            <p class="truncate text-xs text-neutral-700 dark:text-neutral-200">
              {todaysList.done}/{todaysList.total === 0 ? "—" : todaysList.total}
              {todaysList.total > 0 ? "done" : "empty"}
            </p>
          </div>
        </button>
      {:else}
        <button
          type="button"
          class="mb-3 flex w-full items-center gap-2 rounded-md border border-dashed border-neutral-300/70 px-2 py-2 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-100/60 hover:text-neutral-700 dark:border-neutral-700/70 dark:text-neutral-400 dark:hover:bg-neutral-800/40 dark:hover:text-neutral-200"
          onclick={() => app.newList()}
          title="Create today's list"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          Create today's list
        </button>
      {/if}

      <!-- Single + Add button (opens modal for kind picker) -->
      <button
        type="button"
        class="mb-4 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
        onclick={() => (addModalOpen = true)}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
        </svg>
        Add
      </button>

      <!-- Pinned workflows -->
      {#if pinnedWorkflows.length > 0}
        <h2 class="mb-1 px-2 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Workflows
        </h2>
        <div class="mb-3">
          {#each pinnedWorkflows as w (w.id)}
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left transition-colors"
              class:bg-neutral-300={isWorkflowSelected(w.id)}
              class:dark:bg-neutral-700={isWorkflowSelected(w.id)}
              class:hover:bg-neutral-200={!isWorkflowSelected(w.id)}
              class:dark:hover:bg-neutral-800={!isWorkflowSelected(w.id)}
              onclick={() => app.selectWorkflow(w.id)}
            >
              <div class="flex items-center justify-between gap-2">
                <span class="flex min-w-0 flex-1 items-center gap-1">
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                    <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                  </svg>
                  <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{w.title}</span>
                </span>
                {#if w.stepCount > 0}
                  <span class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{w.stepCount}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Pinned articles -->
      {#if pinnedArticles.length > 0}
        <h2 class="mb-1 px-2 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Articles
        </h2>
        <div class="mb-3">
          {#each pinnedArticles as a (a.id)}
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left transition-colors"
              class:bg-neutral-300={isArticleSelected(a.id)}
              class:dark:bg-neutral-700={isArticleSelected(a.id)}
              class:hover:bg-neutral-200={!isArticleSelected(a.id)}
              class:dark:hover:bg-neutral-800={!isArticleSelected(a.id)}
              onclick={() => app.selectArticle(a.id)}
            >
              <div class="flex items-center gap-1">
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                  <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                </svg>
                <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{a.title}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Pinned notes -->
      {#if pinnedNotes.length > 0}
        <h2 class="mb-1 px-2 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Notes
        </h2>
        <div class="mb-3">
          {#each pinnedNotes as n (n.id)}
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left transition-colors"
              class:bg-neutral-300={isNoteSelected(n.id)}
              class:dark:bg-neutral-700={isNoteSelected(n.id)}
              class:hover:bg-neutral-200={!isNoteSelected(n.id)}
              class:dark:hover:bg-neutral-800={!isNoteSelected(n.id)}
              onclick={() => app.selectNote(n.id)}
            >
              <div class="flex items-center justify-between gap-2">
                <span class="flex min-w-0 flex-1 items-center gap-1">
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                    <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                  </svg>
                  <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{n.title}</span>
                </span>
                <span class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{n.date.slice(5)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Pinned boards -->
      {#if pinnedBoards.length > 0}
        <h2 class="mb-1 px-2 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Boards
        </h2>
        <div class="mb-3">
          {#each pinnedBoards as b (b.id)}
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left transition-colors"
              class:bg-neutral-300={isBoardSelected(b.id)}
              class:dark:bg-neutral-700={isBoardSelected(b.id)}
              class:hover:bg-neutral-200={!isBoardSelected(b.id)}
              class:dark:hover:bg-neutral-800={!isBoardSelected(b.id)}
              onclick={() => app.openFeedbackBoard(b.id)}
            >
              <div class="flex items-center gap-1">
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                  <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                </svg>
                <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">
                  <TagBadges text={b.title} />
                </span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Pinned flashcards -->
      {#if pinnedFlashcards.length > 0}
        <h2 class="mb-1 px-2 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Cards
        </h2>
        <div class="mb-3">
          {#each pinnedFlashcards as c (c.id)}
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left transition-colors"
              class:bg-neutral-300={isFlashcardSelected(c.id)}
              class:dark:bg-neutral-700={isFlashcardSelected(c.id)}
              class:hover:bg-neutral-200={!isFlashcardSelected(c.id)}
              class:dark:hover:bg-neutral-800={!isFlashcardSelected(c.id)}
              onclick={() => app.openFlashcardInDeck(c.id)}
            >
              <div class="flex items-center gap-1">
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                  <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                </svg>
                <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">
                  <TagBadges text={c.title} />
                </span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      {#if pinnedWorkflows.length === 0 && pinnedArticles.length === 0 && pinnedNotes.length === 0 && pinnedBoards.length === 0 && pinnedFlashcards.length === 0}
        <p class="px-2 text-[11px] italic text-neutral-400 dark:text-neutral-500">
          Pin items from Summary to keep them one click away here.
        </p>
      {/if}
    {/if}
  </nav>

  {#if addModalOpen}
    <AddEntityModal onClose={() => (addModalOpen = false)} />
  {/if}

  <div
    class="mt-2 border-t border-neutral-300/40 px-2 pt-2 text-[11px] text-neutral-400 dark:border-neutral-700/40 dark:text-neutral-500"
  >
    <div class="flex justify-between">
      <span>Lists</span><span>{app.stats.totalLists}</span>
    </div>
    <div class="flex justify-between">
      <span>Todos</span><span>{app.stats.totalTodos}</span>
    </div>
    <div class="flex justify-between">
      <span>Streak</span>
      <span>
        {app.stats.streak}
        {app.stats.streak === 1 ? "day" : "days"}
      </span>
    </div>
    <button
      type="button"
      class="mt-1.5 flex w-full items-center justify-between rounded px-1 py-1 text-left text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
      onclick={() => (app.helpOpen = true)}
    >
      <span>Shortcuts</span>
      <span class="font-mono text-[10px]">?</span>
    </button>
    <div class="relative">
      <button
        type="button"
        class="mt-1.5 flex w-full items-center justify-between rounded px-1 py-0.5 text-[10px] text-neutral-300 transition-colors hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-600 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-300"
        title="Show the commit this build was made from"
        onclick={() => (commitOpen = !commitOpen)}
      >
        <span>build</span>
        <span class="font-mono">{commitHash}</span>
      </button>

      {#if commitOpen}
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default"
          aria-label="Close commit details"
          onclick={() => (commitOpen = false)}
        ></button>
        <div
          class="absolute bottom-7 left-0 right-0 z-50 rounded-lg border border-neutral-200/70 bg-white/95 p-3 text-left shadow-lg backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/95"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="text-[10px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              Build commit
            </span>
            <span class="select-text font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
              {commitHash}
            </span>
          </div>
          {#if commitDatePretty}
            <p class="mb-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
              {commitDatePretty}
            </p>
          {/if}
          {#if commitMessage}
            <pre
              class="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-200">{commitMessage}</pre>
          {:else}
            <p class="text-[11px] italic text-neutral-400 dark:text-neutral-500">
              No commit message available.
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</aside>

<style>
  .aurora {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    overflow: hidden;
  }
  .aurora-blob {
    position: absolute;
    width: 200%;
    aspect-ratio: 1;
    border-radius: 50%;
    filter: blur(36px);
    opacity: 0.45;
    mix-blend-mode: screen;
    animation: aurora-drift 18s ease-in-out infinite alternate;
    will-change: transform;
  }
  .aurora-blob-0 {
    top: -30%;
    left: -55%;
    animation-duration: 8s;
  }
  .aurora-blob-1 {
    top: 15%;
    left: -20%;
    animation-duration: 11s;
    animation-delay: -3.5s;
  }
  .aurora-blob-2 {
    top: 55%;
    left: -60%;
    animation-duration: 9.5s;
    animation-delay: -6.5s;
  }
  @keyframes aurora-drift {
    from {
      transform: translate3d(-12%, -8%, 0) scale(1) rotate(0deg);
    }
    to {
      transform: translate3d(14%, 10%, 0) scale(1.3) rotate(30deg);
    }
  }
  /* Film-grain noise (inline SVG feTurbulence) keeps the gradients from
     banding and gives the surface texture. */
  .aurora-noise {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.08;
    mix-blend-mode: overlay;
  }
  @media (prefers-reduced-motion: reduce) {
    .aurora-blob {
      animation: none;
    }
  }
</style>
