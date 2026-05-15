<script lang="ts">
  import { app } from "$lib/stores/app.svelte";

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

  let isSearching = $derived(query.trim().length > 0);

  // Show only the most-recent notes in the sidebar; everything is still
  // reachable from the home page's day-detail panel.
  let recentNotes = $derived(app.notes.slice(0, 8));
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
        <picture class="pointer-events-none">
          <source srcset="/logo-dark.png" media="(prefers-color-scheme: dark)" />
          <img
            src="/logo.png"
            alt="AlertMediaBigPicture"
            class="pointer-events-none h-12 w-auto max-w-full select-none"
            draggable="false"
            onerror={() => (logoFailed = true)}
          />
        </picture>
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
      onclick={() => app.openIndex()}
      aria-label="Open index"
      title="Index"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors"
      class:bg-neutral-300={app.view === "index"}
      class:dark:bg-neutral-700={app.view === "index"}
      class:text-neutral-800={app.view === "index"}
      class:dark:text-neutral-100={app.view === "index"}
      class:text-neutral-500={app.view !== "index"}
      class:dark:text-neutral-400={app.view !== "index"}
      class:hover:bg-neutral-200={app.view !== "index"}
      class:dark:hover:bg-neutral-700={app.view !== "index"}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path
          fill-rule="evenodd"
          d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 2a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h5a1 1 0 100-2H6z"
          clip-rule="evenodd"
        />
      </svg>
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
      <div class="mb-1 flex items-center justify-between px-2">
        <h2
          class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
        >
          Workflows
        </h2>
        <button
          type="button"
          class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="New workflow"
          onclick={() => app.newWorkflow()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path
              fill-rule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div class="mb-3">
        {#each app.workflows as w (w.id)}
          <button
            type="button"
            class="w-full rounded-md px-2 py-1 text-left transition-colors"
            class:bg-neutral-300={isWorkflowSelected(w.id)}
            class:dark:bg-neutral-700={isWorkflowSelected(w.id)}
            class:hover:bg-neutral-200={!isWorkflowSelected(w.id)}
            class:dark:hover:bg-neutral-800={!isWorkflowSelected(w.id)}
            onclick={() => app.selectWorkflow(w.id)}
          >
            <div class="flex items-center justify-between">
              <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">
                {w.title}
              </span>
              {#if w.stepCount > 0}
                <span class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {w.stepCount}
                </span>
              {/if}
            </div>
          </button>
        {/each}
      </div>

      <div class="mb-1 flex items-center justify-between px-2">
        <h2
          class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
        >
          Notes
        </h2>
        <button
          type="button"
          class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="New note for today"
          onclick={() => app.newNote()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path
              fill-rule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div class="mb-3">
        {#each recentNotes as n (n.id)}
          <button
            type="button"
            class="w-full rounded-md px-2 py-1 text-left transition-colors"
            class:bg-neutral-300={isNoteSelected(n.id)}
            class:dark:bg-neutral-700={isNoteSelected(n.id)}
            class:hover:bg-neutral-200={!isNoteSelected(n.id)}
            class:dark:hover:bg-neutral-800={!isNoteSelected(n.id)}
            onclick={() => app.selectNote(n.id)}
          >
            <div class="flex items-center justify-between">
              <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">
                {n.title}
              </span>
              <span
                class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500"
              >
                {n.date.slice(5)}
              </span>
            </div>
          </button>
        {/each}
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
