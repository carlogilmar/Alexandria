<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { Todo } from "$lib/ipc";

  type Props = { todo: Todo };
  let { todo }: Props = $props();

  let notesDraft = $state("");
  let tagInput = $state("");

  // Sync the editable draft from the prop. The Inspector is wrapped in {#key}
  // on the parent, so this effectively runs once per selected todo.
  $effect(() => {
    notesDraft = todo.notes ?? "";
  });

  function notesDirty() {
    return (notesDraft ?? "") !== (todo.notes ?? "");
  }

  async function commitNotes() {
    if (!notesDirty()) return;
    await app.updateSelectedNotes(notesDraft);
  }

  async function onTagKey(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const name = tagInput.trim();
    if (!name) return;
    await app.addTagToSelected(name);
    tagInput = "";
  }
</script>

<aside
  class="flex h-screen w-72 shrink-0 flex-col border-l border-neutral-300/40 px-4 pb-5 pt-12 dark:border-neutral-700/40"
>
  <header class="mb-4 flex items-center justify-between">
    <h2
      class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
    >
      Details
    </h2>
    <button
      type="button"
      class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
      aria-label="Close details"
      onclick={() => app.selectTodo(null)}
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

  <div class="mb-4">
    <p
      class="text-sm leading-snug text-neutral-800 dark:text-neutral-200"
      class:line-through={todo.completed}
      class:text-neutral-400={todo.completed}
    >
      {todo.text}
    </p>
  </div>

  <div class="mb-5">
    <label
      class="mb-1 block text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
      for="inspector-notes"
    >
      Notes
    </label>
    <textarea
      id="inspector-notes"
      bind:value={notesDraft}
      onblur={commitNotes}
      placeholder="Add notes…"
      rows="6"
      class="w-full resize-none rounded-md border border-neutral-200/60 bg-white/60 px-2 py-1.5 text-sm leading-snug outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    ></textarea>
  </div>

  <div>
    <label
      class="mb-1 block text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
      for="inspector-tags"
    >
      Tags
    </label>
    <div class="mb-2 flex flex-wrap gap-1">
      {#each app.selectedTodoTags as tag (tag.id)}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-neutral-200/70 px-2 py-0.5 text-[11px] text-neutral-700 dark:bg-neutral-700/70 dark:text-neutral-200"
        >
          #{tag.name}
          <button
            type="button"
            class="text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            aria-label="Remove tag"
            onclick={() => app.removeTagFromSelected(tag.id)}
          >
            ×
          </button>
        </span>
      {/each}
    </div>
    <input
      id="inspector-tags"
      bind:value={tagInput}
      onkeydown={onTagKey}
      placeholder="Add tag and press Enter"
      class="w-full rounded-md border border-neutral-200/60 bg-white/60 px-2 py-1 text-xs outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    />
  </div>
</aside>
