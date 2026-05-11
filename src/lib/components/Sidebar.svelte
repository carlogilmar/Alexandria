<script lang="ts">
  import { app, todayIso } from "$lib/stores/app.svelte";
  import type { ListSummary } from "$lib/ipc";

  type MonthGroup = {
    key: string;
    label: string;
    items: ListSummary[];
  };

  const today = todayIso();

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

  // Expose focus for ⌘F shortcut
  export function focus() {
    searchInput?.focus();
    searchInput?.select();
  }

  let todayLists = $derived(app.lists.filter((l) => l.date === today));
  let pastByMonth = $derived.by<MonthGroup[]>(() => {
    const others = app.lists.filter((l) => l.date !== today);
    const groups = new Map<string, MonthGroup>();
    for (const item of others) {
      const key = item.date.slice(0, 7);
      let group = groups.get(key);
      if (!group) {
        const label = new Date(item.date + "T00:00:00").toLocaleDateString(
          undefined,
          { month: "long", year: "numeric" },
        );
        group = { key, label, items: [] };
        groups.set(key, group);
      }
      group.items.push(item);
    }
    return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  });

  function dayLabel(date: string): string {
    return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function isSelected(id: number): boolean {
    return app.selected?.id === id;
  }

  let isSearching = $derived(query.trim().length > 0);
</script>

<aside
  class="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-300/40 px-3 pb-2 pt-12 dark:border-neutral-700/40"
  data-tauri-drag-region
>
  <div class="mb-3 flex h-7 items-center px-1">
    {#if !logoFailed}
      <picture class="pointer-events-none">
        <source srcset="/logo-dark.png" media="(prefers-color-scheme: dark)" />
        <img
          src="/logo.png"
          alt="AlertMediaBigPicture"
          class="pointer-events-none h-6 w-auto max-w-full select-none"
          draggable="false"
          onerror={() => (logoFailed = true)}
        />
      </picture>
    {:else}
      <span
        class="text-xs font-semibold tracking-tight text-neutral-700 dark:text-neutral-200"
      >
        AlertMediaBigPicture
      </span>
    {/if}
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
    class="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
    class:bg-neutral-300={app.view === "home"}
    class:dark:bg-neutral-700={app.view === "home"}
    class:hover:bg-neutral-200={app.view !== "home"}
    class:dark:hover:bg-neutral-800={app.view !== "home"}
    onclick={() => app.goHome()}
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-neutral-500 dark:text-neutral-400">
      <path
        d="M10 2l8 7h-2v8a1 1 0 01-1 1h-3v-5H8v5H5a1 1 0 01-1-1V9H2l8-7z"
      />
    </svg>
    <span class="font-medium text-neutral-800 dark:text-neutral-200">Home</span>
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
      <div class="mb-2 flex items-center justify-between px-2">
        <h2
          class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
        >
          Lists
        </h2>
        <button
          type="button"
          class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="New list"
          onclick={() => app.newList()}
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

      {#if todayLists.length > 0}
        <div class="mb-3">
          <p
            class="px-2 pb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
          >
            Today
          </p>
          {#each todayLists as t (t.id)}
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left transition-colors"
              class:bg-neutral-300={isSelected(t.id)}
              class:dark:bg-neutral-700={isSelected(t.id)}
              class:hover:bg-neutral-200={!isSelected(t.id)}
              class:dark:hover:bg-neutral-800={!isSelected(t.id)}
              onclick={() => app.select(t.id)}
            >
              <div class="flex items-center justify-between">
                <span
                  class="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200"
                  >{t.title}</span
                >
                {#if t.total > 0}
                  <span class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {t.done}/{t.total}
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}

      {#each pastByMonth as group (group.key)}
        <div class="mb-2">
          <p
            class="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
          >
            {group.label}
          </p>
          {#each group.items as item (item.id)}
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left transition-colors"
              class:bg-neutral-300={isSelected(item.id)}
              class:dark:bg-neutral-700={isSelected(item.id)}
              class:hover:bg-neutral-200={!isSelected(item.id)}
              class:dark:hover:bg-neutral-800={!isSelected(item.id)}
              onclick={() => app.select(item.id)}
            >
              <div class="flex items-center justify-between">
                <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">
                  {item.title}
                </span>
                {#if item.total > 0}
                  <span class="ml-2 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {item.done}/{item.total}
                  </span>
                {/if}
              </div>
              <p class="text-[11px] text-neutral-400 dark:text-neutral-500">{dayLabel(item.date)}</p>
            </button>
          {/each}
        </div>
      {/each}
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
