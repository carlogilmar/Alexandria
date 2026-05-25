<script lang="ts">
  import { app, todayIso } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import AddEntityModal from "$lib/components/AddEntityModal.svelte";

  let query = $state("");
  let searchInput: HTMLInputElement | undefined = $state();
  let logoFailed = $state(false);
  let addModalOpen = $state(false);

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

  // Today's-list quick access: detect by date string match.
  let today = $derived(todayIso());
  let todaysList = $derived(
    app.lists.find((l) => l.date === today && !l.archived) ?? null,
  );
</script>

<aside
  class="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-300/40 px-3 pb-2 pt-12 dark:border-neutral-700/40"
  data-tauri-drag-region
>
  <div class="mb-3 flex h-14 items-center gap-1">
    <button
      type="button"
      onclick={() => app.goHome(true)}
      aria-label="Go to home — today"
      class="flex h-full flex-1 items-center rounded-md px-1 transition-colors hover:bg-neutral-200/40 dark:hover:bg-neutral-700/30"
    >
      {#if !logoFailed}
        <img
          src={theme.resolved === "dark" ? "/logo-dark.png" : "/logo.png"}
          alt="AlertMediaBigPicture"
          class="pointer-events-none h-12 w-auto max-w-full select-none"
          draggable="false"
          onerror={() => (logoFailed = true)}
        />
      {:else}
        <span
          class="text-sm font-semibold tracking-tight text-neutral-700 dark:text-neutral-200"
        >
          AlertMediaBigPicture
        </span>
      {/if}
    </button>
    <button
      type="button"
      onclick={() => theme.cycle()}
      aria-label="Switch theme"
      title={`Theme: ${theme.preference} — click to switch`}
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
    >
      {#if theme.preference === "dark"}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path
            d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"
          />
        </svg>
      {:else if theme.preference === "light"}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path
            fill-rule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.95 2.05a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zm-2.05 4.95a1 1 0 01-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.95-.464a1 1 0 010-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414 0zM4 10a1 1 0 01-1 1H2a1 1 0 110-2h1a1 1 0 011 1zm.464-5.95a1 1 0 011.414 0l.707.707A1 1 0 015.171 6.17l-.707-.707a1 1 0 010-1.414zM10 6a4 4 0 100 8 4 4 0 000-8z"
            clip-rule="evenodd"
          />
        </svg>
      {:else}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path
            fill-rule="evenodd"
            d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-3v2h2a1 1 0 110 2H8a1 1 0 110-2h2v-2H5a2 2 0 01-2-2V5zm2 0v8h10V5H5z"
            clip-rule="evenodd"
          />
        </svg>
      {/if}
    </button>
  </div>

  <div class="mb-2 px-1">
    <input
      bind:this={searchInput}
      bind:value={query}
      type="search"
      placeholder="Search…"
      class="w-full rounded-md border border-neutral-300/60 bg-white/60 px-2 py-1 text-xs outline-none transition-shadow placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    />
  </div>

  <!-- Library of Alexandria — primary destination, top of sidebar.
       Cmd+2 (Cmd+1 = Home, via the logo button above). -->
  <button
    type="button"
    onclick={() => app.openMap()}
    class="mx-1 mb-3 flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors"
    class:bg-violet-600={app.view === "map"}
    class:text-white={app.view === "map"}
    class:hover:bg-violet-700={app.view === "map"}
    class:bg-violet-50={app.view !== "map"}
    class:text-violet-700={app.view !== "map"}
    class:hover:bg-violet-100={app.view !== "map"}
    class:dark:bg-violet-900={app.view === "map"}
    class:dark:hover:bg-violet-800={app.view === "map"}
    class:dark:bg-violet-950={app.view !== "map"}
    class:dark:text-violet-200={app.view !== "map"}
    class:dark:hover:bg-violet-900={app.view !== "map"}
    title="Alexandria — ⌘2"
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0">
      <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h2.5a2 2 0 011.6.8L10 5h5a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm4 4a1 1 0 100 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h4a1 1 0 100-2H7z" clip-rule="evenodd"/>
    </svg>
    <span class="flex-1">Alexandria</span>
  </button>

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

      {#if pinnedWorkflows.length === 0 && pinnedArticles.length === 0 && pinnedNotes.length === 0}
        <p class="px-2 text-[11px] italic text-neutral-400 dark:text-neutral-500">
          Pin items from Summary to keep them one click away here.
        </p>
      {/if}
    {/if}
  </nav>

  {#if addModalOpen}
    <AddEntityModal onClose={() => (addModalOpen = false)} />
  {/if}

  <!-- Bottom nav: Summary + Visualization. Cmd+3 / Cmd+4. -->
  <div class="mt-2 flex flex-col gap-1 border-t border-neutral-300/40 px-1 pt-2 dark:border-neutral-700/40">
    <button
      type="button"
      onclick={() => app.openIndex()}
      class="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors"
      class:bg-blue-600={app.view === "index"}
      class:text-white={app.view === "index"}
      class:hover:bg-blue-700={app.view === "index"}
      class:text-blue-700={app.view !== "index"}
      class:hover:bg-blue-50={app.view !== "index"}
      class:dark:bg-blue-900={app.view === "index"}
      class:dark:hover:bg-blue-800={app.view === "index"}
      class:dark:text-blue-200={app.view !== "index"}
      class:dark:hover:bg-blue-950={app.view !== "index"}
      title="Summary — ⌘3"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0">
        <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 2a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h5a1 1 0 100-2H6z" clip-rule="evenodd" />
      </svg>
      <span class="flex-1">Summary</span>
    </button>

    <button
      type="button"
      onclick={() => app.openGarden()}
      class="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors"
      class:bg-emerald-600={app.view === "garden"}
      class:text-white={app.view === "garden"}
      class:hover:bg-emerald-700={app.view === "garden"}
      class:text-emerald-700={app.view !== "garden"}
      class:hover:bg-emerald-50={app.view !== "garden"}
      class:dark:bg-emerald-900={app.view === "garden"}
      class:dark:hover:bg-emerald-800={app.view === "garden"}
      class:dark:text-emerald-200={app.view !== "garden"}
      class:dark:hover:bg-emerald-950={app.view !== "garden"}
      title="Visualization — ⌘4"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0">
        <path d="M10 2C7.5 2 5 4 5 6.5c0 1.4.7 2.6 1.8 3.4-.5.4-.8 1-.8 1.6 0 1.1.9 2 2 2h.5v3a1 1 0 102 0v-3h.5c1.1 0 2-.9 2-2 0-.6-.3-1.2-.8-1.6C14.3 9.1 15 7.9 15 6.5 15 4 12.5 2 10 2z"/>
      </svg>
      <span class="flex-1">Visualization</span>
    </button>
  </div>

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
  </div>
</aside>
