<script lang="ts">
  import { fade } from "svelte/transition";
  import { app } from "$lib/stores/app.svelte";

  type Section = { title: string; items: { keys: string; label: string }[] };
  const sections: Section[] = [
    {
      title: "Find & navigate",
      items: [
        { keys: "⌘ K", label: "Search everything · jump anywhere (command palette)" },
        { keys: "⌘ 1", label: "Home — today & activity" },
        { keys: "⌘ 2", label: "Alexandria — your canvas" },
        { keys: "⌘ 3", label: "Summary — catalog of everything" },
        { keys: "⌘ 4", label: "Visualization — graph of links" },
        { keys: "⌘ 5", label: "Feedback — kanban boards" },
        { keys: "⌘ 6", label: "Activity — when you've worked" },
        { keys: "⌘ 7", label: "Flash Deck — flashcards" },
        { keys: "⌘ [", label: "Back to the previous view" },
        { keys: "⌘ \\", label: "Collapse / show the sidebar" },
      ],
    },
    {
      title: "Lists & editing",
      items: [
        { keys: "⌘ N", label: "New list (today)" },
        { keys: "⌘ F", label: "Focus the sidebar todo search" },
        { keys: "⌘ E", label: "Save current list as .md" },
        { keys: "⌘ ⇧ C", label: "Copy current list to clipboard" },
        { keys: "Tab", label: "Indent (inserts spaces) in editors" },
        { keys: "⌘ ↩", label: "Submit comment · description" },
        { keys: "Enter", label: "Commit edit" },
        { keys: "Esc", label: "Cancel edit · close panel · close help" },
      ],
    },
    {
      title: "General",
      items: [
        { keys: "?", label: "Show / hide this help" },
      ],
    },
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

    <div class="flex flex-col gap-4">
      {#each sections as section (section.title)}
        <section>
          <h3 class="mb-2 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            {section.title}
          </h3>
          <ul class="space-y-1.5">
            {#each section.items as s (s.keys)}
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
        </section>
      {/each}
    </div>

    <div class="mt-4 border-t border-neutral-200/60 pt-3 dark:border-neutral-700/60">
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-md px-1 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-100"
        onclick={() => {
          app.helpOpen = false;
          app.formattingHelpOpen = true;
        }}
      >
        <span>Markdown & formatting reference</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  </div>
</div>
