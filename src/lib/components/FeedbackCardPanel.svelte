<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { CARD_COLORS, cardAccent } from "$lib/cardColors";
  import TagBadges from "$lib/components/TagBadges.svelte";

  type Props = { cardId: number };
  let { cardId }: Props = $props();

  let card = $derived(app.feedbackCards.find((c) => c.id === cardId) ?? null);
  let columnName = $derived(
    app.feedbackColumns.find((col) => col.id === card?.columnId)?.name ?? "",
  );

  async function setColor(name: string | null) {
    if (!card) return;
    await app.setFeedbackCardColor(card.id, card.color === name ? null : name);
  }

  let titleDraft = $state("");
  let editingTitle = $state(false);
  let titleInput: HTMLInputElement | undefined = $state();

  let descDraft = $state("");
  let editingDesc = $state(false);
  let descArea: HTMLTextAreaElement | undefined = $state();

  let commentDraft = $state("");

  // Sync drafts with the card when it changes (and we're not editing).
  $effect(() => {
    if (!editingTitle && card) titleDraft = card.title;
  });
  $effect(() => {
    if (!editingDesc && card) descDraft = card.description;
  });

  function startTitleEdit() {
    if (!card) return;
    titleDraft = card.title;
    editingTitle = true;
    queueMicrotask(() => titleInput?.focus());
  }
  async function commitTitleEdit() {
    editingTitle = false;
    if (!card) return;
    if (titleDraft.trim() === card.title) return;
    await app.updateFeedbackCard(card.id, titleDraft, null);
  }
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitTitleEdit();
    else if (e.key === "Escape") {
      titleDraft = card?.title ?? "";
      editingTitle = false;
    }
  }

  function startDescEdit() {
    if (!card) return;
    descDraft = card.description;
    editingDesc = true;
    queueMicrotask(() => descArea?.focus());
  }
  async function commitDescEdit() {
    editingDesc = false;
    if (!card) return;
    if (descDraft === card.description) return;
    await app.updateFeedbackCard(card.id, null, descDraft);
  }
  function onDescKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      descDraft = card?.description ?? "";
      editingDesc = false;
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!body) return;
    await app.addFeedbackComment(body);
    commentDraft = "";
  }
  function onCommentKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submitComment();
    }
  }

  function close() {
    app.closeFeedbackCard();
  }
  // Esc closes the panel — unless focus is in a field (then the field's own
  // handler cancels its edit first).
  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    const t = e.target;
    if (
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    )
      return;
    close();
  }
  function deleteCard() {
    if (!card) return;
    void app.deleteFeedbackCard(card.id);
  }

  function fmt(raw: string): string {
    if (!raw) return "";
    const d = new Date(raw.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<svelte:window onkeydown={onKey} />

{#if card}
  <button
    type="button"
    aria-label="Close panel"
    class="fixed inset-0 z-40 cursor-default bg-neutral-900/30 dark:bg-neutral-950/50"
    onclick={close}
  ></button>
  <aside
    class="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-700/80 dark:bg-neutral-900"
  >
    <header class="flex items-start justify-between gap-2 border-b border-neutral-200/70 px-5 py-4 dark:border-neutral-700/70">
      <div class="min-w-0 flex-1">
        {#if editingTitle}
          <input
            bind:this={titleInput}
            bind:value={titleDraft}
            onblur={commitTitleEdit}
            onkeydown={onTitleKey}
            class="w-full rounded-md border-none bg-transparent text-lg font-semibold tracking-tight text-neutral-900 outline-none ring-2 ring-blue-500/40 focus:ring-blue-500 dark:text-neutral-100"
          />
        {:else}
          <button
            type="button"
            class="block w-full rounded-md text-left text-lg font-semibold tracking-tight text-neutral-900 transition-colors hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800/60"
            onclick={startTitleEdit}
            title="Click to rename · use #tags to categorize"
          >
            <TagBadges text={card.title} />
          </button>
        {/if}
        <p class="mt-0.5 text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {columnName}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title="Delete card"
          onclick={deleteCard}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/>
          </svg>
        </button>
        <button
          type="button"
          class="rounded p-1.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="Close"
          onclick={close}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      <h3 class="mb-1.5 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Color
      </h3>
      <div class="mb-5 flex items-center gap-1.5">
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-neutral-400 transition-transform hover:scale-110 dark:border-neutral-600"
          class:ring-2={!card.color}
          class:ring-blue-500={!card.color}
          title="No color"
          aria-label="No color"
          onclick={() => setColor(null)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" class="h-3.5 w-3.5"><path d="M4 16L16 4" stroke-width="1.5" /></svg>
        </button>
        {#each CARD_COLORS as c (c.name)}
          <button
            type="button"
            class="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/10"
            class:ring-2={card.color === c.name}
            class:ring-offset-1={card.color === c.name}
            class:ring-blue-500={card.color === c.name}
            class:dark:ring-offset-neutral-900={card.color === c.name}
            style="background: {cardAccent(c.name)};"
            title={c.name}
            aria-label={c.name}
            onclick={() => setColor(c.name)}
          ></button>
        {/each}
      </div>

      <h3 class="mb-1.5 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Description
      </h3>
      {#if editingDesc}
        <textarea
          bind:this={descArea}
          bind:value={descDraft}
          onblur={commitDescEdit}
          onkeydown={onDescKey}
          class="w-full resize-y rounded-md border border-neutral-200/60 bg-white/60 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100"
          rows="6"
          placeholder="Add a description in markdown…"
        ></textarea>
      {:else if card.description.trim()}
        <button
          type="button"
          class="w-full rounded-md border border-transparent px-3 py-2 text-left text-sm leading-relaxed text-neutral-800 transition-colors hover:border-neutral-200/60 dark:text-neutral-200 dark:hover:border-neutral-700/60"
          style="white-space: pre-wrap;"
          onclick={startDescEdit}
        >
          {card.description}
        </button>
      {:else}
        <button
          type="button"
          class="block w-full rounded-md border border-dashed border-neutral-300/60 px-3 py-3 text-left text-sm text-neutral-400 transition-colors hover:border-neutral-400 hover:bg-neutral-100/40 dark:border-neutral-700/60 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/30"
          onclick={startDescEdit}
        >
          Add a description…
        </button>
      {/if}

      <h3 class="mb-2 mt-6 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Comments
      </h3>
      {#if app.feedbackComments.length === 0}
        <p class="text-xs italic text-neutral-400 dark:text-neutral-500">
          No comments yet.
        </p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each app.feedbackComments as c (c.id)}
            <li class="rounded-md border border-neutral-200/70 bg-white/60 px-3 py-2 dark:border-neutral-700/70 dark:bg-neutral-900/40">
              <p class="mb-0.5 text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                {fmt(c.createdAt)}
                <button
                  type="button"
                  class="float-right rounded p-0.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  aria-label="Delete comment"
                  onclick={() => app.deleteFeedbackComment(c.id)}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </p>
              <p class="text-sm text-neutral-800 dark:text-neutral-200" style="white-space: pre-wrap;">
                {c.body}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <footer class="border-t border-neutral-200/70 px-5 py-3 dark:border-neutral-700/70">
      <textarea
        bind:value={commentDraft}
        onkeydown={onCommentKey}
        placeholder="Add a comment… (⌘↩ to submit)"
        class="w-full resize-none rounded-md border border-neutral-300/70 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
        rows="2"
      ></textarea>
      <div class="mt-1.5 flex justify-end">
        <button
          type="button"
          class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          disabled={commentDraft.trim().length === 0}
          onclick={submitComment}
        >
          Add comment
        </button>
      </div>
    </footer>
  </aside>
{/if}
