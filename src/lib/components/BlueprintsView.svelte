<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import IdChip from "$lib/components/IdChip.svelte";

  let creating = $state(false);
  let titleDraft = $state("");
  let titleInput: HTMLInputElement | undefined = $state();
  let renamingId = $state<number | null>(null);
  let renameDraft = $state("");

  let activeBlueprints = $derived(app.blueprints.filter((b) => !b.archived));
  let archivedBlueprints = $derived(app.blueprints.filter((b) => b.archived));

  function startCreate() {
    creating = true;
    titleDraft = "";
    queueMicrotask(() => titleInput?.focus());
  }
  function cancelCreate() {
    creating = false;
    titleDraft = "";
  }
  async function commitCreate() {
    const t = titleDraft.trim();
    if (!t) {
      cancelCreate();
      return;
    }
    await app.newBlueprint(t);
    creating = false;
    titleDraft = "";
  }
  function onCreateKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitCreate();
    else if (e.key === "Escape") cancelCreate();
  }

  function startRename(id: number, current: string) {
    renamingId = id;
    renameDraft = current;
    queueMicrotask(() => {
      const el = document.querySelector(
        `input[data-rename-id="${id}"]`,
      ) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }
  async function commitRename() {
    if (renamingId === null) return;
    await app.renameBlueprint(renamingId, renameDraft);
    renamingId = null;
  }
  function cancelRename() {
    renamingId = null;
  }
  function onRenameKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") cancelRename();
  }

  function fmtDate(raw: string) {
    if (!raw) return "";
    const d = new Date(raw.replace(" ", "T") + "Z");
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
</script>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col px-8 py-10">
  <header class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Blueprints
      </h1>
      <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Freeform canvases for planning software designs. Cards, connections,
        notes — export any region as a PNG.
      </p>
    </div>
    <button
      type="button"
      class="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700 active:bg-sky-800 dark:bg-sky-500 dark:hover:bg-sky-600"
      onclick={startCreate}
    >
      + New blueprint
    </button>
  </header>

  {#if creating}
    <div class="mb-4 rounded-lg border border-neutral-200/70 bg-white/60 p-3 dark:border-neutral-700/70 dark:bg-neutral-900/40">
      <label class="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
        Blueprint title
        <input
          bind:this={titleInput}
          bind:value={titleDraft}
          type="text"
          placeholder="e.g. Auth service redesign"
          class="mt-1 w-full rounded-md border border-neutral-300/70 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
          onkeydown={onCreateKey}
        />
      </label>
      <div class="mt-2 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-neutral-300/70 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700/70 dark:text-neutral-200 dark:hover:bg-neutral-800"
          onclick={cancelCreate}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          onclick={commitCreate}
        >
          Create
        </button>
      </div>
    </div>
  {/if}

  {#if !app.blueprintsLoaded}
    <p class="text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
  {:else if app.blueprints.length === 0}
    <p class="text-sm text-neutral-400 dark:text-neutral-500">
      No blueprints yet. Create one to start designing.
    </p>
  {:else}
    <section class="mb-8">
      <h2 class="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Active
      </h2>
      {#if activeBlueprints.length === 0}
        <p class="px-2 text-sm italic text-neutral-400 dark:text-neutral-500">
          No active blueprints.
        </p>
      {:else}
        <ul class="flex flex-col gap-1">
          {#each activeBlueprints as b (b.id)}
            <li class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
              {#if renamingId === b.id}
                <input
                  data-rename-id={b.id}
                  bind:value={renameDraft}
                  onblur={commitRename}
                  onkeydown={onRenameKey}
                  class="flex-1 rounded-md border border-neutral-300/70 bg-white px-2 py-1 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
                />
              {:else}
                <button
                  type="button"
                  class="flex flex-1 items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm text-neutral-800 dark:text-neutral-200"
                  onclick={() => app.openBlueprint(b.id)}
                  ondblclick={() => startRename(b.id, b.title)}
                >
                  <span class="truncate">{b.title}</span>
                  <span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {b.nodeCount} {b.nodeCount === 1 ? "node" : "nodes"} ·
                    {fmtDate(b.updatedAt)}
                  </span>
                </button>
              {/if}
              <IdChip kind="blueprint" id={b.id} />
              <button
                type="button"
                class="rounded p-1 {b.pinned
                  ? 'text-amber-500'
                  : 'text-neutral-400 hover:text-amber-500'} hover:bg-amber-50 dark:hover:bg-amber-950/40"
                title={b.pinned ? "Unpin" : "Pin"}
                onclick={() => app.setBlueprintPinned(b.id, !b.pinned)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                  <path d="M10 2l2 4 4 .5-3 3 .8 4.5L10 12l-3.8 2 .8-4.5-3-3L8 6l2-4z"/>
                </svg>
              </button>
              <button
                type="button"
                class="rounded p-1 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                title="Archive blueprint"
                onclick={() => app.setBlueprintArchived(b.id, true)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/>
                </svg>
              </button>
              <button
                type="button"
                class="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                title="Delete blueprint"
                onclick={() => app.deleteBlueprint(b.id)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/>
                </svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if archivedBlueprints.length > 0}
      <section>
        <h2 class="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Archived
        </h2>
        <ul class="flex flex-col gap-1 opacity-80">
          {#each archivedBlueprints as b (b.id)}
            <li class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
              <button
                type="button"
                class="flex flex-1 items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm text-neutral-700 dark:text-neutral-300"
                onclick={() => app.openBlueprint(b.id)}
              >
                <span class="truncate">{b.title}</span>
                <span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {b.nodeCount} {b.nodeCount === 1 ? "node" : "nodes"}
                </span>
              </button>
              <button
                type="button"
                class="rounded p-1 text-neutral-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                title="Unarchive"
                onclick={() => app.setBlueprintArchived(b.id, false)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                  <path d="M10 3a1 1 0 01.707.293l5 5a1 1 0 11-1.414 1.414L11 6.414V16a1 1 0 11-2 0V6.414L5.707 9.707a1 1 0 01-1.414-1.414l5-5A1 1 0 0110 3z"/>
                </svg>
              </button>
              <button
                type="button"
                class="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                title="Delete blueprint"
                onclick={() => app.deleteBlueprint(b.id)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/>
                </svg>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</main>
