<script lang="ts">
  import type { Todo } from "$lib/ipc";

  type Props = {
    todo: Todo;
    selected?: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onOpenDetails: () => void;
    onDragStart: (e: DragEvent) => void;
  };

  let {
    todo,
    selected = false,
    onToggle,
    onDelete,
    onOpenDetails,
    onDragStart,
  }: Props = $props();

  let rowEl: HTMLDivElement | undefined = $state();

  function handleDragStart(e: DragEvent) {
    if (rowEl && e.dataTransfer) {
      // Use the full row as the drag preview, not just the tiny handle.
      e.dataTransfer.setDragImage(rowEl, 12, 16);
    }
    onDragStart(e);
  }
</script>

<div
  bind:this={rowEl}
  class="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-200/40 dark:hover:bg-neutral-700/30"
  class:bg-blue-100={selected}
  class:dark:bg-blue-900={selected}
>
  <span
    draggable="true"
    role="button"
    tabindex="-1"
    ondragstart={handleDragStart}
    aria-label="Drag to reorder"
    title="Drag to reorder"
    class="select-none cursor-grab text-neutral-400 hover:text-neutral-700 active:cursor-grabbing dark:text-neutral-500 dark:hover:text-neutral-200"
  >
    ⋮⋮
  </span>

  <button
    type="button"
    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
    class:border-neutral-300={!todo.completed}
    class:hover:border-neutral-500={!todo.completed}
    class:dark:border-neutral-500={!todo.completed}
    class:dark:hover:border-neutral-300={!todo.completed}
    class:border-neutral-700={todo.completed}
    class:bg-neutral-700={todo.completed}
    class:dark:border-neutral-200={todo.completed}
    class:dark:bg-neutral-200={todo.completed}
    aria-label={todo.completed ? "Mark as incomplete" : "Mark as complete"}
    onclick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
  >
    {#if todo.completed}
      <svg
        viewBox="0 0 20 20"
        class="h-3 w-3 fill-white dark:fill-neutral-900"
      >
        <path
          fill-rule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
          clip-rule="evenodd"
        />
      </svg>
    {/if}
  </button>

  <button
    type="button"
    class="flex-1 cursor-pointer text-left text-[15px] leading-tight transition-colors"
    class:text-neutral-400={todo.completed}
    class:dark:text-neutral-500={todo.completed}
    class:line-through={todo.completed}
    onclick={onOpenDetails}
  >
    {todo.text}
  </button>

  <button
    type="button"
    class="rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400"
    aria-label="Delete todo"
    onclick={(e) => {
      e.stopPropagation();
      onDelete();
    }}
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
      <path
        fill-rule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z"
        clip-rule="evenodd"
      />
    </svg>
  </button>
</div>
