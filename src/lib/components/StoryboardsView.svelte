<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { formatTimestamp } from "$lib/format";

  let newTitle = $state("");

  let active = $derived(app.storyboards.filter((s) => !s.archived));
  let archived = $derived(app.storyboards.filter((s) => s.archived));
  let showArchived = $state(false);

  async function create() {
    const t = newTitle.trim();
    newTitle = "";
    await app.newStoryboard(t || "Untitled storyboard");
  }
</script>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col px-8 py-10">
  <header class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
      Storyboards
    </h1>
    <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
      Small diagrams + notes, page by page — document tiny things and present them.
    </p>
  </header>

  <form onsubmit={(e) => { e.preventDefault(); void create(); }} class="mb-6 flex gap-2">
    <input
      bind:value={newTitle}
      placeholder="New storyboard title…"
      class="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900"
    />
    <button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
      New storyboard
    </button>
  </form>

  {#if active.length === 0}
    <p class="mt-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
      No storyboards yet. Create one above.
    </p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each active as s (s.id)}
        <li class="group flex items-center gap-3 rounded-xl border border-neutral-200/70 bg-white/60 px-4 py-3 dark:border-neutral-700/60 dark:bg-neutral-900/40">
          <button type="button" class="min-w-0 flex-1 text-left" onclick={() => app.openStoryboard(s.id)}>
            <span class="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">{s.title}</span>
            <span class="text-xs text-neutral-400 dark:text-neutral-500">
              {s.pageCount} {s.pageCount === 1 ? "page" : "pages"} · {formatTimestamp(s.updatedAt)}
            </span>
          </button>
          <button type="button" title={s.pinned ? "Unpin" : "Pin"} aria-label="Pin"
            class="rounded p-1.5 transition-colors"
            class:text-amber-500={s.pinned}
            class:text-neutral-300={!s.pinned}
            onclick={() => app.setStoryboardPinned(s.id, !s.pinned)}>
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M9.05 2.6a1.5 1.5 0 012.9 0l1.2 3.68a1.5 1.5 0 001.43 1.04h3.87c1.5 0 2.12 1.92.9 2.8l-3.13 2.28a1.5 1.5 0 00-.54 1.68l1.2 3.67c.46 1.43-1.18 2.62-2.4 1.73l-3.13-2.27a1.5 1.5 0 00-1.76 0l-3.13 2.27c-1.22.89-2.86-.3-2.4-1.73l1.2-3.67a1.5 1.5 0 00-.54-1.68L1.75 10.1c-1.22-.88-.6-2.8.9-2.8h3.87a1.5 1.5 0 001.43-1.04L9.05 2.6z"/></svg>
          </button>
          <button type="button" title="Archive" aria-label="Archive"
            class="rounded p-1.5 text-neutral-300 opacity-0 transition-opacity hover:text-neutral-600 group-hover:opacity-100 dark:hover:text-neutral-300"
            onclick={() => app.setStoryboardArchived(s.id, true)}>
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 4h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V8zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/></svg>
          </button>
          <button type="button" title="Delete" aria-label="Delete"
            class="rounded p-1.5 text-neutral-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
            onclick={() => app.deleteStoryboard(s.id)}>
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9z" clip-rule="evenodd"/></svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if archived.length > 0}
    <button type="button" class="mt-6 self-start text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
      onclick={() => (showArchived = !showArchived)}>
      {showArchived ? "Hide" : "Show"} archived ({archived.length})
    </button>
    {#if showArchived}
      <ul class="mt-2 flex flex-col gap-1">
        {#each archived as s (s.id)}
          <li class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span class="min-w-0 flex-1 truncate">{s.title}</span>
            <button type="button" class="text-xs hover:text-blue-600" onclick={() => app.setStoryboardArchived(s.id, false)}>Restore</button>
            <button type="button" class="text-xs hover:text-red-500" onclick={() => app.deleteStoryboard(s.id)}>Delete</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>
