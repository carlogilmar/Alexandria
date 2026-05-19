<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";

  let query = $state("");
  let searchInput: HTMLInputElement | undefined = $state();
  let logoFailed = $state(false);

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

  // Each sidebar section shows all pinned items first, then the most-recent
  // unpinned ones up to RECENT_LIMIT. Older unpinned items live on the
  // welcome page's bucket cards.
  const RECENT_LIMIT = 6;

  function partition<T extends { pinned: boolean }>(
    items: T[],
    limit: number,
  ): { pinned: T[]; recent: T[] } {
    const pinned = items.filter((i) => i.pinned);
    const recent = items.filter((i) => !i.pinned).slice(0, limit);
    return { pinned, recent };
  }

  let workflowsShown = $derived(partition(app.workflows, RECENT_LIMIT));
  let notesShown = $derived(partition(app.notes, RECENT_LIMIT));
  let articlesShown = $derived(partition(app.articles, RECENT_LIMIT));
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

  <button
    type="button"
    onclick={() => app.openIndex()}
    class="mx-1 mb-3 flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors"
    class:bg-blue-600={app.view === "index"}
    class:text-white={app.view === "index"}
    class:hover:bg-blue-700={app.view === "index"}
    class:bg-blue-50={app.view !== "index"}
    class:text-blue-700={app.view !== "index"}
    class:hover:bg-blue-100={app.view !== "index"}
    class:dark:bg-blue-900={app.view === "index"}
    class:dark:hover:bg-blue-800={app.view === "index"}
    class:dark:bg-blue-950={app.view !== "index"}
    class:dark:text-blue-200={app.view !== "index"}
    class:dark:hover:bg-blue-900={app.view !== "index"}
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0">
      <path
        fill-rule="evenodd"
        d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 2a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h5a1 1 0 100-2H6z"
        clip-rule="evenodd"
      />
    </svg>
    <span class="flex-1">Index — Summary</span>
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
      <!-- Workflows -->
      <div class="mb-1 flex items-center justify-between px-2">
        <h2 class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Workflows
        </h2>
        <button
          type="button"
          class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="New workflow"
          onclick={() => app.newWorkflow()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
      <div class="mb-3">
        {#each [...workflowsShown.pinned, ...workflowsShown.recent] as w (w.id)}
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
                {#if w.pinned}
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                    <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                  </svg>
                {/if}
                <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{w.title}</span>
              </span>
              {#if w.stepCount > 0}
                <span class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{w.stepCount}</span>
              {/if}
            </div>
          </button>
        {/each}
        {#if workflowsShown.pinned.length === 0 && workflowsShown.recent.length === 0}
          <p class="px-2 text-[11px] italic text-neutral-400 dark:text-neutral-500">No workflows yet.</p>
        {/if}
      </div>

      <!-- Articles -->
      <div class="mb-1 flex items-center justify-between px-2">
        <h2 class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Articles
        </h2>
        <button
          type="button"
          class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="New article"
          onclick={() => app.newArticle()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
      <div class="mb-3">
        {#each [...articlesShown.pinned, ...articlesShown.recent] as a (a.id)}
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
              {#if a.pinned}
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                  <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                </svg>
              {/if}
              <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{a.title}</span>
            </div>
          </button>
        {/each}
        {#if articlesShown.pinned.length === 0 && articlesShown.recent.length === 0}
          <p class="px-2 text-[11px] italic text-neutral-400 dark:text-neutral-500">No articles yet.</p>
        {/if}
      </div>

      <!-- Notes -->
      <div class="mb-1 flex items-center justify-between px-2">
        <h2 class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Notes
        </h2>
        <button
          type="button"
          class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="New note for today"
          onclick={() => app.newNote()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
      <div class="mb-3">
        {#each [...notesShown.pinned, ...notesShown.recent] as n (n.id)}
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
                {#if n.pinned}
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 shrink-0 text-amber-500" aria-label="pinned">
                    <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
                  </svg>
                {/if}
                <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{n.title}</span>
              </span>
              <span class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{n.date.slice(5)}</span>
            </div>
          </button>
        {/each}
        {#if notesShown.pinned.length === 0 && notesShown.recent.length === 0}
          <p class="px-2 text-[11px] italic text-neutral-400 dark:text-neutral-500">No notes yet.</p>
        {/if}
      </div>
    {/if}
  </nav>

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
