<script lang="ts">
  import type { Todo } from "$lib/ipc";

  type Props = {
    todo: Todo;
    onToggle: () => void;
    onEdit: (text: string) => void;
    onDelete: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragEnd: () => void;
    isDragging: boolean;
  };

  let {
    todo,
    onToggle,
    onEdit,
    onDelete,
    onDragStart,
    onDragOver,
    onDragEnd,
    isDragging,
  }: Props = $props();

  let editing = $state(false);
  let draft = $state("");
  let input: HTMLInputElement | undefined = $state();

  function startEdit() {
    draft = todo.text;
    editing = true;
    queueMicrotask(() => input?.focus());
  }

  function commitEdit() {
    const next = draft.trim();
    editing = false;
    if (next && next !== todo.text) {
      onEdit(next);
    }
  }

  function cancelEdit() {
    editing = false;
    draft = todo.text;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    else if (e.key === "Escape") cancelEdit();
  }
</script>

<li
  class="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-neutral-100/70"
  class:opacity-40={isDragging}
  draggable="true"
  ondragstart={onDragStart}
  ondragover={onDragOver}
  ondragend={onDragEnd}
>
  <span
    class="cursor-grab text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
    aria-hidden="true"
  >
    ⋮⋮
  </span>

  <button
    type="button"
    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
    class:border-neutral-300={!todo.completed}
    class:hover:border-neutral-500={!todo.completed}
    class:border-neutral-700={todo.completed}
    class:bg-neutral-700={todo.completed}
    aria-label={todo.completed ? "Mark as incomplete" : "Mark as complete"}
    onclick={onToggle}
  >
    {#if todo.completed}
      <svg viewBox="0 0 20 20" fill="white" class="h-3 w-3">
        <path
          fill-rule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
          clip-rule="evenodd"
        />
      </svg>
    {/if}
  </button>

  {#if editing}
    <input
      bind:this={input}
      bind:value={draft}
      onblur={commitEdit}
      onkeydown={onKey}
      class="flex-1 rounded border-none bg-transparent px-1 py-0.5 outline-none ring-2 ring-blue-500/40 focus:ring-blue-500"
    />
  {:else}
    <button
      type="button"
      class="flex-1 text-left text-[15px] leading-tight"
      class:text-neutral-400={todo.completed}
      class:line-through={todo.completed}
      ondblclick={startEdit}
      onclick={(e) => {
        // single click on the text (not the checkbox) opens edit mode after a brief grace
        if (e.detail === 1) startEdit();
      }}
    >
      {todo.text}
    </button>
  {/if}

  <button
    type="button"
    class="rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
    aria-label="Delete todo"
    onclick={onDelete}
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
      <path
        fill-rule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z"
        clip-rule="evenodd"
      />
    </svg>
  </button>
</li>
