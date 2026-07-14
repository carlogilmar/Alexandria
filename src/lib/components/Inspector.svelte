<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { Tag, Todo } from "$lib/ipc";
  import IdChip from "$lib/components/IdChip.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";

  type Props = { todo: Todo };
  let { todo }: Props = $props();

  let textDraft = $state("");
  let tagInput = $state("");
  let highlightIdx = $state(0);
  let tagListEl: HTMLUListElement | undefined = $state();

  // Sync the title draft from the prop. Inspector is wrapped in {#key} on the
  // parent so this effectively runs once per selected todo.
  $effect(() => {
    textDraft = todo.text;
  });

  let suggestions = $derived.by<Tag[]>(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    const already = new Set(app.selectedTodoTags.map((t) => t.name));
    return app.allTags
      .filter((t) => !already.has(t.name) && t.name.toLowerCase().includes(q))
      .slice(0, 5);
  });

  $effect(() => {
    if (suggestions.length === 0) highlightIdx = 0;
    else if (highlightIdx >= suggestions.length)
      highlightIdx = suggestions.length - 1;
  });

  function close() {
    app.selectTodo(null);
  }

  async function commitText() {
    const next = textDraft.trim();
    if (!next || next === todo.text) {
      textDraft = todo.text;
      return;
    }
    await app.updateSelectedText(next);
  }

  async function commitNotes(next: string) {
    if ((next ?? "") === (todo.notes ?? "")) return;
    await app.updateSelectedNotes(next);
  }

  async function commitTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await app.addTagToSelected(trimmed);
    tagInput = "";
    highlightIdx = 0;
  }

  async function onTagKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        const chosen = suggestions[highlightIdx] ?? suggestions[0];
        await commitTag(chosen.name);
      } else if (tagInput.trim()) {
        await commitTag(tagInput);
      }
    } else if (e.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      highlightIdx = (highlightIdx + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      highlightIdx =
        (highlightIdx - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Escape") {
      if (tagInput) {
        e.preventDefault();
        e.stopPropagation();
        tagInput = "";
      }
    }
  }
</script>

<!-- Task detail modal (was a right sidebar). Esc closes it via the global
     handler in +page.svelte; backdrop click closes here. -->
<div
  role="dialog"
  aria-modal="true"
  aria-label="Task details"
  class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm dark:bg-black/50"
>
  <button
    type="button"
    class="absolute inset-0 cursor-default"
    aria-label="Close"
    onclick={close}
  ></button>

  <div
    class="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-700/80 dark:bg-neutral-900"
  >
    <header
      class="flex shrink-0 items-center gap-2 border-b border-neutral-200/60 px-5 py-3 dark:border-neutral-700/60"
    >
      <h2 class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Task
      </h2>
      <IdChip kind="todo" id={todo.id} />
      {#if todo.completed}
        <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          done
        </span>
      {/if}
      <button
        type="button"
        class="ml-auto rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
        aria-label="Close details"
        onclick={close}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <!-- Title -->
      <input
        bind:value={textDraft}
        onblur={commitText}
        onkeydown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") {
            e.stopPropagation();
            textDraft = todo.text;
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Task title"
        class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold tracking-tight text-neutral-900 outline-none transition-colors hover:bg-neutral-100/60 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:text-neutral-100 dark:hover:bg-neutral-800/60 dark:focus:bg-neutral-900"
        class:line-through={todo.completed}
      />

      <!-- Description — same click-to-edit markdown editor as notes/articles. -->
      <div class="mt-4">
        <p class="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Description
        </p>
        {#key todo.id}
          <MarkdownEditor
            value={todo.notes ?? ""}
            minHeight="9rem"
            placeholder="Add a description — click Edit to write markdown. Links, ```mermaid diagrams and - [ ] checklists all work."
            onCommit={commitNotes}
          />
        {/key}
      </div>

      <!-- Tags -->
      <div class="relative mt-6">
        <p class="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Tags
        </p>
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
          bind:value={tagInput}
          onkeydown={onTagKey}
          placeholder="Add tag and press Enter"
          autocomplete="off"
          class="w-full rounded-md border border-neutral-200/60 bg-white/60 px-2 py-1 text-xs outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        {#if suggestions.length > 0}
          <ul
            bind:this={tagListEl}
            class="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-hidden rounded-md border border-neutral-200/80 bg-white/95 py-1 text-xs shadow-lg backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-900/95"
          >
            {#each suggestions as s, i (s.id)}
              <li>
                <button
                  type="button"
                  class="block w-full px-2 py-1 text-left text-neutral-700 dark:text-neutral-200"
                  class:bg-blue-100={highlightIdx === i}
                  class:dark:bg-blue-900={highlightIdx === i}
                  onmouseenter={() => (highlightIdx = i)}
                  onclick={() => commitTag(s.name)}
                >
                  #{s.name}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
</div>
