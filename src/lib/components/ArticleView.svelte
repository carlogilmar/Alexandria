<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { formatTimestamp } from "$lib/format";
  import ArticleEditor from "$lib/components/ArticleEditor.svelte";

  let editingTitle = $state(false);
  let titleDraft = $state("");
  let titleInput: HTMLInputElement | undefined = $state();

  function startTitleEdit() {
    if (!app.selectedArticle) return;
    titleDraft = app.selectedArticle.title;
    editingTitle = true;
    queueMicrotask(() => titleInput?.focus());
  }

  async function commitTitleEdit() {
    editingTitle = false;
    const next = titleDraft.trim();
    if (!next || !app.selectedArticle || next === app.selectedArticle.title) {
      return;
    }
    await app.renameSelectedArticle(next);
  }

  function cancelTitleEdit() {
    editingTitle = false;
  }

  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitTitleEdit();
    else if (e.key === "Escape") cancelTitleEdit();
  }

  async function commitBody(next: string) {
    await app.updateSelectedArticleBody(next);
  }
</script>

{#if app.selectedArticle}
  <main class="mx-auto flex min-h-full w-full max-w-3xl flex-col px-8 py-10">
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
            {app.selectedArticle.title}
          </button>
        {/if}
        <p class="mt-1 flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          <span>Article · {app.selectedArticle.id}</span>
        </p>
      </div>
      <div class="ml-4 flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="rounded-md p-1.5 transition-colors"
          class:text-yellow-500={app.quickArticleId === app.selectedArticle.id}
          class:hover:bg-yellow-50={app.quickArticleId === app.selectedArticle.id}
          class:dark:hover:bg-yellow-950={app.quickArticleId === app.selectedArticle.id}
          class:text-neutral-400={app.quickArticleId !== app.selectedArticle.id}
          class:hover:bg-neutral-200={app.quickArticleId !== app.selectedArticle.id}
          class:dark:text-neutral-500={app.quickArticleId !== app.selectedArticle.id}
          class:dark:hover:bg-neutral-700={app.quickArticleId !== app.selectedArticle.id}
          aria-label="Quick article"
          title={app.quickArticleId === app.selectedArticle.id
            ? "Quick article (⌘⇧A) — click to clear"
            : "Set as quick article (open with ⌘⇧A)"}
          onclick={() =>
            app.selectedArticle &&
            app.toggleQuickArticle(app.selectedArticle.id)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path d="M10 1.6l2.47 5.006 5.525.803-3.998 3.897.944 5.503L10 14.213l-4.941 2.596.944-5.503L2.005 7.41l5.525-.803L10 1.6z"/>
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 transition-colors"
          class:text-amber-500={app.selectedArticle.pinned}
          class:hover:bg-amber-50={app.selectedArticle.pinned}
          class:dark:hover:bg-amber-950={app.selectedArticle.pinned}
          class:text-neutral-400={!app.selectedArticle.pinned}
          class:hover:bg-neutral-200={!app.selectedArticle.pinned}
          class:dark:text-neutral-500={!app.selectedArticle.pinned}
          class:dark:hover:bg-neutral-700={!app.selectedArticle.pinned}
          aria-label={app.selectedArticle.pinned ? "Unpin" : "Pin"}
          title={app.selectedArticle.pinned ? "Unpin" : "Pin to sidebar"}
          onclick={() => app.toggleSelectedArticlePin()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          aria-label="Delete this article"
          onclick={() => app.deleteSelectedArticle()}
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

    {#key app.selectedArticle.id}
      <ArticleEditor
        value={app.selectedArticle.body}
        placeholder={"Write your article in markdown. Embed any element on its own line — e.g. {{note:5}} or {{workflow:3}}. Use a ```mermaid fence for inline diagrams."}
        minHeight="24rem"
        onCommit={commitBody}
      />
    {/key}

    <footer class="mt-auto pt-8 text-xs text-neutral-400 dark:text-neutral-500">
      Last updated {formatTimestamp(app.selectedArticle.updatedAt)}
    </footer>
  </main>
{/if}
