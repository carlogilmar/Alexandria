<script lang="ts">
  import type { Todo } from "$lib/ipc";
  import IdChip from "$lib/components/IdChip.svelte";

  type Props = {
    todo: Todo;
    selected?: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onOpenDetails: () => void;
    onHandlePointerDown: (e: PointerEvent) => void;
    // Optional "move this task" action (Sprint 29): "backlog" sends a daily
    // task to the backlog; "today" pulls a backlog task into today's list.
    onMove?: () => void;
    moveDir?: "backlog" | "today";
  };

  let {
    todo,
    selected = false,
    onToggle,
    onDelete,
    onOpenDetails,
    onHandlePointerDown,
    onMove,
    moveDir = "backlog",
  }: Props = $props();
</script>

<div
  class="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-200/40 dark:hover:bg-neutral-700/30"
  class:bg-blue-100={selected}
  class:dark:bg-blue-900={selected}
>
  <span
    role="button"
    tabindex="-1"
    aria-label="Drag to reorder"
    title="Drag to reorder"
    onpointerdown={onHandlePointerDown}
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

  <span class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
    <IdChip kind="todo" id={todo.id} />
  </span>

  {#if onMove}
    <button
      type="button"
      class="rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
      aria-label={moveDir === "today" ? "Pull to today" : "Send to backlog"}
      title={moveDir === "today" ? "Pull to today" : "Send to backlog"}
      onclick={(e) => {
        e.stopPropagation();
        onMove?.();
      }}
    >
      {#if moveDir === "today"}
        <!-- calendar-plus: pull into today -->
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path
            fill-rule="evenodd"
            d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm5 8a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1v-1z"
            clip-rule="evenodd"
          />
        </svg>
      {:else}
        <!-- inbox / down-into-tray: send to backlog -->
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path
            d="M10 2a1 1 0 011 1v6.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L9 9.586V3a1 1 0 011-1z"
          />
          <path
            d="M3 13a1 1 0 011 1v1a1 1 0 001 1h10a1 1 0 001-1v-1a1 1 0 112 0v1a3 3 0 01-3 3H5a3 3 0 01-3-3v-1a1 1 0 011-1z"
          />
        </svg>
      {/if}
    </button>
  {/if}

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
