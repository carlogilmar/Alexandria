<script lang="ts">
  import { fade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { app } from "$lib/stores/app.svelte";
  import TodoRow from "$lib/components/TodoRow.svelte";
  import IdChip from "$lib/components/IdChip.svelte";

  let quickAddText = $state("");
  let dragId = $state<number | null>(null);
  let qaInput: HTMLInputElement | undefined = $state();
  let exportMenuOpen = $state(false);

  let total = $derived(app.todos.length);
  let done = $derived(app.todos.filter((t) => t.completed).length);
  let progressPct = $derived(total === 0 ? 0 : Math.round((done / total) * 100));
  let allDone = $derived(total > 0 && done === total);

  let prettyDate = $derived(
    app.selected
      ? new Date(app.selected.date + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : "",
  );

  // Focus quick-add input whenever the selected list changes.
  $effect(() => {
    if (app.selected) {
      queueMicrotask(() => qaInput?.focus());
    }
  });

  // ----- Pointer-based reorder -----
  // HTML5 drag-and-drop is unreliable in WKWebView, especially when the
  // drag source is inside an interactive element. We use pointer events
  // and elementFromPoint to find the row under the cursor.
  function handlePointerDown(id: number, e: PointerEvent) {
    if (e.button !== 0) return; // left button only
    e.preventDefault();
    dragId = id;
  }

  function findRowIdUnderPointer(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const li = el?.closest("li[data-todo-id]");
    if (!li) return null;
    const id = Number(li.getAttribute("data-todo-id"));
    return Number.isFinite(id) ? id : null;
  }

  function handlePointerMove(e: PointerEvent) {
    if (dragId === null) return;
    const targetId = findRowIdUnderPointer(e.clientX, e.clientY);
    if (targetId === null || targetId === dragId) return;
    const fromIdx = app.todos.findIndex((t) => t.id === dragId);
    const toIdx = app.todos.findIndex((t) => t.id === targetId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const next = app.todos.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    app.reorderLocal(next.map((t) => t.id));
  }

  async function handlePointerUp() {
    if (dragId === null) return;
    dragId = null;
    await app.commitReorder();
  }

  $effect(() => {
    if (dragId === null) return;
    const onMove = (e: PointerEvent) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  // ----- Title rename -----
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let titleInput: HTMLInputElement | undefined = $state();

  function startTitleEdit() {
    if (!app.selected) return;
    titleDraft = app.selected.title;
    editingTitle = true;
    queueMicrotask(() => titleInput?.focus());
  }

  async function commitTitleEdit() {
    editingTitle = false;
    const next = titleDraft.trim();
    if (!next || !app.selected || next === app.selected.title) return;
    await app.renameSelected(next);
  }

  function cancelTitleEdit() {
    editingTitle = false;
  }

  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitTitleEdit();
    else if (e.key === "Escape") cancelTitleEdit();
  }

  async function handleQuickAdd(e: SubmitEvent) {
    e.preventDefault();
    const text = quickAddText.trim();
    if (!text) return;
    await app.addTodo(text);
    quickAddText = "";
  }
</script>

{#if app.selected}
  <main class="mx-auto flex min-h-full w-full max-w-2xl flex-col px-8 py-10">
    <header class="mb-6 flex items-end justify-between">
      <div class="min-w-0 flex-1">
        {#if editingTitle}
          <input
            bind:this={titleInput}
            bind:value={titleDraft}
            onblur={commitTitleEdit}
            onkeydown={onTitleKey}
            class="w-full rounded-md border-none bg-transparent px-1 py-0 text-2xl font-semibold tracking-tight text-neutral-900 outline-none ring-2 ring-blue-500/40 focus:ring-blue-500 dark:text-neutral-100"
          />
        {:else}
          <button
            type="button"
            class="truncate rounded-md text-left text-2xl font-semibold tracking-tight text-neutral-900 transition-colors hover:bg-neutral-200/40 dark:text-neutral-100 dark:hover:bg-neutral-700/30"
            onclick={startTitleEdit}
          >
            {app.selected.title}
          </button>
        {/if}
        <p class="mt-1 flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          <span>{prettyDate} · {app.selected.date}</span>
          <IdChip kind="list" id={app.selected.id} />
        </p>
      </div>
      <div class="ml-4 flex shrink-0 items-center gap-3">
        {#if total > 0}
          <p
            class="text-sm font-medium"
            class:text-green-600={allDone}
            class:dark:text-green-400={allDone}
            class:text-neutral-500={!allDone}
            class:dark:text-neutral-400={!allDone}
          >
            {done} / {total}
          </p>
        {/if}
        <button
          type="button"
          class="rounded-md p-1.5 transition-colors"
          class:text-amber-500={app.selected.pinned}
          class:hover:bg-amber-50={app.selected.pinned}
          class:dark:hover:bg-amber-950={app.selected.pinned}
          class:text-neutral-400={!app.selected.pinned}
          class:hover:bg-neutral-200={!app.selected.pinned}
          class:dark:text-neutral-500={!app.selected.pinned}
          class:dark:hover:bg-neutral-700={!app.selected.pinned}
          aria-label={app.selected.pinned ? "Unpin" : "Pin"}
          title={app.selected.pinned ? "Unpin" : "Pin to sidebar"}
          onclick={() => app.toggleSelectedListPin()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          aria-label="Delete this list"
          onclick={() => app.deleteSelected()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path
              fill-rule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <div class="relative">
          <button
            type="button"
            class="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-200/40 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/30 dark:hover:text-neutral-200"
            onclick={() => (exportMenuOpen = !exportMenuOpen)}
          >
            Export…
          </button>
          {#if exportMenuOpen}
            <button
              type="button"
              class="fixed inset-0 z-10 cursor-default"
              aria-label="Close menu"
              onclick={() => (exportMenuOpen = false)}
            ></button>
            <div
              class="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-neutral-200/80 bg-white/95 py-1 text-sm shadow-lg backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-900/95"
            >
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onclick={() => {
                  exportMenuOpen = false;
                  app.copyCurrent();
                }}
              >
                Copy current list
                <span class="text-[11px] text-neutral-400">⌘⇧C</span>
              </button>
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onclick={() => {
                  exportMenuOpen = false;
                  app.saveCurrent();
                }}
              >
                Save current list…
                <span class="text-[11px] text-neutral-400">⌘E</span>
              </button>
              <div class="my-1 border-t border-neutral-200/70 dark:border-neutral-700/70"></div>
              <button
                type="button"
                class="block w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onclick={() => {
                  exportMenuOpen = false;
                  app.saveThisWeek();
                }}
              >
                Save this week…
              </button>
              <button
                type="button"
                class="block w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onclick={() => {
                  exportMenuOpen = false;
                  app.saveThisMonth();
                }}
              >
                Save this month…
              </button>
              <button
                type="button"
                class="block w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onclick={() => {
                  exportMenuOpen = false;
                  app.saveEverything();
                }}
              >
                Save everything…
              </button>
            </div>
          {/if}
        </div>
      </div>
    </header>

    {#if total > 0}
      <div
        class="mb-5 h-1 w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-700/50"
      >
        <div
          class="h-full rounded-full transition-all duration-300"
          class:bg-green-500={allDone}
          class:bg-blue-500={!allDone}
          style="width: {progressPct}%"
        ></div>
      </div>
    {/if}

    <form onsubmit={handleQuickAdd} class="mb-4">
      <input
        bind:this={qaInput}
        type="text"
        bind:value={quickAddText}
        placeholder="What needs doing?"
        class="w-full rounded-xl border border-neutral-200 bg-white/70 px-4 py-3 text-[15px] shadow-sm outline-none transition-shadow placeholder:text-neutral-400 focus:border-blue-300 focus:shadow focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />
    </form>

    {#if app.todos.length === 0}
      <div class="mt-12 text-center text-neutral-400 dark:text-neutral-500">
        <p class="text-sm">Nothing yet.</p>
        <p class="mt-1 text-xs">What's the first thing?</p>
      </div>
    {:else}
      <ul class="flex flex-col gap-0.5">
        {#each app.todos as todo (todo.id)}
          <li
            data-todo-id={todo.id}
            animate:flip={{ duration: 200 }}
            in:fade={{ duration: 150 }}
            out:fade={{ duration: 120 }}
            class:opacity-40={dragId === todo.id}
          >
            <TodoRow
              {todo}
              selected={app.selectedTodoId === todo.id}
              onToggle={() => app.toggle(todo)}
              onDelete={() => app.removeTodo(todo)}
              onOpenDetails={() => app.selectTodo(todo.id)}
              onHandlePointerDown={(e) => handlePointerDown(todo.id, e)}
            />
          </li>
        {/each}
      </ul>
    {/if}
  </main>
{/if}
