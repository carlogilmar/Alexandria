<script lang="ts">
  import { fade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { app } from "$lib/stores/app.svelte";
  import TodoRow from "$lib/components/TodoRow.svelte";

  let quickAddText = $state("");
  let dragId = $state<number | null>(null);
  let qaInput: HTMLInputElement | undefined = $state();

  let total = $derived(app.todos.length);
  let done = $derived(app.todos.filter((t) => t.completed).length);

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

  // Inline title rename
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

  function handleDragStart(id: number, e: DragEvent) {
    dragId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(id));
    }
  }

  function handleDragOver(targetId: number, e: DragEvent) {
    e.preventDefault();
    if (dragId === null || dragId === targetId) return;
    const fromIdx = app.todos.findIndex((t) => t.id === dragId);
    const toIdx = app.todos.findIndex((t) => t.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = app.todos.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    app.reorderLocal(next.map((t) => t.id));
  }

  async function handleDragEnd() {
    if (dragId === null) return;
    dragId = null;
    await app.commitReorder();
  }
</script>

{#if app.selected}
  <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-8 py-10">
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
        <p class="mt-1 text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {prettyDate} · {app.selected.date}
        </p>
      </div>
      {#if total > 0}
        <p class="ml-4 shrink-0 text-sm text-neutral-500 dark:text-neutral-400">
          {done} / {total} done
        </p>
      {/if}
    </header>

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
            animate:flip={{ duration: 200 }}
            in:fade={{ duration: 150 }}
            out:fade={{ duration: 120 }}
            class:opacity-40={dragId === todo.id}
            draggable="true"
            ondragstart={(e) => handleDragStart(todo.id, e)}
            ondragover={(e) => handleDragOver(todo.id, e)}
            ondragend={handleDragEnd}
          >
            <TodoRow
              {todo}
              onToggle={() => app.toggle(todo)}
              onEdit={(text) => app.editTodo(todo, text)}
              onDelete={() => app.removeTodo(todo)}
            />
          </li>
        {/each}
      </ul>
    {/if}
  </main>
{/if}
