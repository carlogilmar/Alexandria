<script lang="ts">
  import { fade } from "svelte/transition";
  import { app } from "$lib/stores/app.svelte";

  const shortcuts: { keys: string; label: string }[] = [
    { keys: "⌘ N", label: "New list (date = today)" },
    { keys: "⌘ F", label: "Focus search" },
    { keys: "⌘ E", label: "Save current list as .md" },
    { keys: "⌘ ⇧ C", label: "Copy current list to clipboard" },
    { keys: "?", label: "Show / hide this help" },
    { keys: "Esc", label: "Close inspector or this help" },
    { keys: "Enter", label: "Commit edit · Esc to cancel" },
  ];
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm dark:bg-black/50"
  in:fade={{ duration: 120 }}
  out:fade={{ duration: 120 }}
>
  <button
    type="button"
    class="absolute inset-0 cursor-default"
    aria-label="Close help"
    onclick={() => (app.helpOpen = false)}
  ></button>
  <div
    class="relative w-full max-w-md rounded-2xl border border-neutral-200/60 bg-white/95 p-6 shadow-2xl dark:border-neutral-700/60 dark:bg-neutral-900/95"
  >
    <header class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Keyboard shortcuts
      </h2>
      <button
        type="button"
        class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
        aria-label="Close"
        onclick={() => (app.helpOpen = false)}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path
            fill-rule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </header>

    <ul class="space-y-2">
      {#each shortcuts as s (s.keys)}
        <li class="flex items-center justify-between gap-3">
          <span class="text-sm text-neutral-700 dark:text-neutral-200">{s.label}</span>
          <kbd
            class="rounded-md border border-neutral-300/60 bg-neutral-100/80 px-2 py-0.5 font-mono text-[11px] text-neutral-700 dark:border-neutral-600/60 dark:bg-neutral-800/80 dark:text-neutral-200"
          >
            {s.keys}
          </kbd>
        </li>
      {/each}
    </ul>

    <p class="mt-5 text-[11px] text-neutral-400 dark:text-neutral-500">
      Click a row to open its details · drag the ⋮⋮ handle to reorder
    </p>
  </div>
</div>
