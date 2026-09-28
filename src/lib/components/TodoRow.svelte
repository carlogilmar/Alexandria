<script lang="ts">
  import type { Tag, Todo } from "$lib/ipc";
  import { fmtAge, fmtSpan, fmtWork, liveWorkSeconds, tagColor } from "$lib/tasktime";

  type Props = {
    todo: Todo;
    selected?: boolean;
    tags?: Tag[];
    now?: number;
    onToggle: () => void;
    onStart: () => void;
    onPause: () => void;
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
    tags = [],
    now = Date.now(),
    onToggle,
    onStart,
    onPause,
    onDelete,
    onOpenDetails,
    onHandlePointerDown,
    onMove,
    moveDir = "backlog",
  }: Props = $props();

  let isWip = $derived(todo.status === "wip");
  let isDone = $derived(todo.status === "done");

  // Start/pause button styling — built as a string because Svelte `class:`
  // directives can't hold the colons in Tailwind variant classes.
  let startBtnClass = $derived(
    isWip
      ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
      : "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300",
  );

  // Flow-time meta: "3d old" while active, "lived 3d" once closed.
  let ageText = $derived(
    isDone
      ? (() => {
          const s = fmtSpan(todo.createdAt, todo.completedAt);
          return s ? `lived ${s}` : "";
        })()
      : (() => {
          const a = fmtAge(todo.createdAt, now);
          return a ? `${a} old` : "";
        })(),
  );
  // Tracked work time. Ticks live while WIP.
  let workText = $derived(fmtWork(liveWorkSeconds(todo, now)));
</script>

<div
  class="group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-200/40 dark:hover:bg-neutral-700/30"
  class:bg-blue-100={selected}
  class:dark:bg-blue-900={selected}
>
  <span
    role="button"
    tabindex="-1"
    aria-label="Drag to reorder"
    title="Drag to reorder"
    onpointerdown={onHandlePointerDown}
    class="mt-0.5 select-none cursor-grab text-neutral-400 hover:text-neutral-700 active:cursor-grabbing dark:text-neutral-500 dark:hover:text-neutral-200"
  >
    ⋮⋮
  </span>

  <button
    type="button"
    class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
    class:border-neutral-300={!isDone}
    class:hover:border-neutral-500={!isDone}
    class:dark:border-neutral-500={!isDone}
    class:dark:hover:border-neutral-300={!isDone}
    class:border-neutral-700={isDone}
    class:bg-neutral-700={isDone}
    class:dark:border-neutral-200={isDone}
    class:dark:bg-neutral-200={isDone}
    aria-label={isDone ? "Mark as not done" : "Mark as done"}
    onclick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
  >
    {#if isDone}
      <svg viewBox="0 0 20 20" class="h-3 w-3 fill-white dark:fill-neutral-900">
        <path
          fill-rule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
          clip-rule="evenodd"
        />
      </svg>
    {/if}
  </button>

  <div class="min-w-0 flex-1">
    <button
      type="button"
      class="block w-full cursor-pointer text-left text-[15px] leading-tight transition-colors"
      class:text-neutral-400={isDone}
      class:dark:text-neutral-500={isDone}
      class:line-through={isDone}
      onclick={onOpenDetails}
    >
      {todo.text}
    </button>

    <!-- Flow-time + tags meta line -->
    <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      {#if isWip}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
          title="Time in progress"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"></span>
          <span class="tabular-nums">{workText || "0s"}</span>
        </span>
      {/if}
      {#if ageText}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-1.5 py-0.5 font-medium tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          title="How old this task is"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 opacity-60">
            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 8h12v7H4V8z" clip-rule="evenodd"/>
          </svg>
          {ageText}
        </span>
      {/if}
      {#if !isWip && workText}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 font-semibold tabular-nums text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"
          title="Time tracked"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 opacity-80">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V6z" clip-rule="evenodd"/>
          </svg>
          {workText}
        </span>
      {/if}
      {#each tags as tag (tag.id)}
        <span
          class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium"
          style="background-color: {tagColor(tag)}1f; color: {tagColor(tag)};"
        >
          <span class="h-1.5 w-1.5 rounded-full" style="background-color: {tagColor(tag)};"></span>
          {tag.name}
        </span>
      {/each}
    </div>
  </div>

  <!-- Start / pause (WIP) — hidden for done tasks. -->
  {#if !isDone}
    <button
      type="button"
      class="mt-0.5 rounded p-1 transition-colors {startBtnClass}"
      aria-label={isWip ? "Pause (back to to-do)" : "Start working"}
      title={isWip ? "Pause — back to To do" : "Start — move to Work in progress"}
      onclick={(e) => {
        e.stopPropagation();
        if (isWip) onPause();
        else onStart();
      }}
    >
      {#if isWip}
        <!-- pause -->
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path d="M6 4a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1zm8 0a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1z"/>
        </svg>
      {:else}
        <!-- play -->
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path d="M6.3 3.84A1 1 0 004.8 4.7v10.6a1 1 0 001.5.86l9-5.3a1 1 0 000-1.72l-9-5.3z"/>
        </svg>
      {/if}
    </button>
  {/if}

  {#if onMove}
    <button
      type="button"
      class="mt-0.5 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
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
    class="mt-0.5 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400"
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
