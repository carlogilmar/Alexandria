<script lang="ts">
  import { onMount } from "svelte";
  import {
    listToday,
    listTodos,
    createTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    reorderTodos,
    type List,
    type Todo,
  } from "$lib/ipc";
  import TodoRow from "$lib/components/TodoRow.svelte";

  let list = $state<List | null>(null);
  let todos = $state<Todo[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let quickAddText = $state("");
  let dragId = $state<number | null>(null);

  let total = $derived(todos.length);
  let done = $derived(todos.filter((t) => t.completed).length);

  let prettyDate = $derived(
    list
      ? new Date(list.date + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : "",
  );

  onMount(async () => {
    try {
      list = await listToday();
      todos = await listTodos(list.id);
    } catch (e) {
      loadError = String(e);
    } finally {
      loading = false;
    }
  });

  async function handleQuickAdd(e: SubmitEvent) {
    e.preventDefault();
    const text = quickAddText.trim();
    if (!text || !list) return;
    const created = await createTodo(list.id, text);
    todos = [...todos, created];
    quickAddText = "";
  }

  async function handleToggle(todo: Todo) {
    const updated = await toggleTodo(todo.id);
    todos = todos.map((t) => (t.id === updated.id ? updated : t));
  }

  async function handleEdit(todo: Todo, text: string) {
    const updated = await updateTodo(todo.id, { text });
    todos = todos.map((t) => (t.id === updated.id ? updated : t));
  }

  async function handleDelete(todo: Todo) {
    await deleteTodo(todo.id);
    todos = todos.filter((t) => t.id !== todo.id);
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
    const fromIdx = todos.findIndex((t) => t.id === dragId);
    const toIdx = todos.findIndex((t) => t.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = todos.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    todos = next;
  }

  async function handleDragEnd() {
    if (dragId === null || !list) {
      dragId = null;
      return;
    }
    dragId = null;
    const orderedIds = todos.map((t) => t.id);
    await reorderTodos(list.id, orderedIds);
  }
</script>

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-8 py-10">
  {#if loading}
    <p class="text-sm text-neutral-400">Loading…</p>
  {:else if loadError}
    <div
      class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <p class="font-medium">Couldn't load today's list.</p>
      <p class="mt-1 text-xs">{loadError}</p>
    </div>
  {:else if list}
    <header class="mb-6 flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{prettyDate}</h1>
        <p class="mt-1 text-xs uppercase tracking-widest text-neutral-400">
          {list.date}
        </p>
      </div>
      {#if total > 0}
        <p class="text-sm text-neutral-500">
          {done} / {total} done
        </p>
      {/if}
    </header>

    <form onsubmit={handleQuickAdd} class="mb-4">
      <input
        type="text"
        bind:value={quickAddText}
        placeholder="What needs doing?"
        class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] shadow-sm outline-none transition-shadow placeholder:text-neutral-400 focus:border-blue-300 focus:shadow focus:ring-2 focus:ring-blue-500/20"
      />
    </form>

    {#if todos.length === 0}
      <div class="mt-12 text-center text-neutral-400">
        <p class="text-sm">Nothing yet.</p>
        <p class="mt-1 text-xs">What's the first thing?</p>
      </div>
    {:else}
      <ul class="flex flex-col gap-0.5">
        {#each todos as todo (todo.id)}
          <TodoRow
            {todo}
            isDragging={dragId === todo.id}
            onToggle={() => handleToggle(todo)}
            onEdit={(text) => handleEdit(todo, text)}
            onDelete={() => handleDelete(todo)}
            onDragStart={(e) => handleDragStart(todo.id, e)}
            onDragOver={(e) => handleDragOver(todo.id, e)}
            onDragEnd={handleDragEnd}
          />
        {/each}
      </ul>
    {/if}
  {/if}
</main>
