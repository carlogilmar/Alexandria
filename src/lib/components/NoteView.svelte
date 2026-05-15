<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";
  import IdChip from "$lib/components/IdChip.svelte";

  let editingTitle = $state(false);
  let titleDraft = $state("");
  let titleInput: HTMLInputElement | undefined = $state();

  let prettyDate = $derived(
    app.selectedNote
      ? new Date(app.selectedNote.date + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : "",
  );

  function startTitleEdit() {
    if (!app.selectedNote) return;
    titleDraft = app.selectedNote.title;
    editingTitle = true;
    queueMicrotask(() => titleInput?.focus());
  }

  async function commitTitleEdit() {
    editingTitle = false;
    const next = titleDraft.trim();
    if (!next || !app.selectedNote || next === app.selectedNote.title) return;
    await app.renameSelectedNote(next);
  }

  function cancelTitleEdit() {
    editingTitle = false;
  }

  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitTitleEdit();
    else if (e.key === "Escape") cancelTitleEdit();
  }

  async function commitBody(next: string) {
    await app.updateSelectedNoteBody(next);
  }
</script>

{#if app.selectedNote}
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
            {app.selectedNote.title}
          </button>
        {/if}
        <p class="mt-1 flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          <span>Note · {prettyDate} · {app.selectedNote.date}</span>
          <IdChip kind="note" id={app.selectedNote.id} />
        </p>
      </div>
      <div class="ml-4 flex shrink-0 items-center gap-3">
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          aria-label="Delete this note"
          onclick={() => app.deleteSelectedNote()}
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
    </header>

    {#key app.selectedNote.id}
      <MarkdownEditor
        value={app.selectedNote.body}
        placeholder="Write your note in markdown…"
        minHeight="18rem"
        onCommit={commitBody}
      />
    {/key}
  </main>
{/if}
