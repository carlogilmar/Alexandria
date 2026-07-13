<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import IdChip from "$lib/components/IdChip.svelte";
  import TagBadges from "$lib/components/TagBadges.svelte";
  import type {
    ArticleSummary,
    BlueprintSummary,
    FeedbackBoardSummary,
    Flashcard,
    ListSummary,
    NoteSummary,
    WorkflowSummary,
  } from "$lib/ipc";

  type Kind =
    | "article"
    | "note"
    | "workflow"
    | "board"
    | "blueprint"
    | "flashcard"
    | "list";
  // The kinds IdChip knows how to render (board/flashcard have no chip).
  type ChipKind = "article" | "note" | "workflow" | "blueprint" | "list";

  type Section =
    | "all"
    | "articles"
    | "notes"
    | "blueprints"
    | "workflows"
    | "boards"
    | "cards"
    | "lists"
    | "archived";
  let section = $state<Section>("all");

  // Normalized row — every kind maps onto this so a single snippet renders
  // them all (the seven tabs used to be near-identical copy-paste blocks).
  type Row = {
    kind: Kind;
    id: number;
    title: string;
    meta: string;
    pinned: boolean;
    badge: boolean; // render the title through TagBadges (#tags)
    deletable: boolean;
    chipKind: ChipKind | null;
    hue: number;
    sortKey: string; // for the "All" cross-kind sort (desc)
  };

  const KIND_HUE: Record<Kind, number> = {
    note: 217,
    article: 268,
    workflow: 32,
    board: 350,
    blueprint: 200,
    flashcard: 175,
    list: 158,
  };

  function formatUpdated(raw: string): string {
    if (!raw) return "";
    const d = new Date(raw.replace(" ", "T") + "Z");
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // ----- per-kind normalizers -----
  function articleRow(a: ArticleSummary): Row {
    return {
      kind: "article",
      id: a.id,
      title: a.title,
      meta: formatUpdated(a.updatedAt),
      pinned: a.pinned,
      badge: false,
      deletable: true,
      chipKind: "article",
      hue: KIND_HUE.article,
      sortKey: a.updatedAt,
    };
  }
  function noteRow(n: NoteSummary): Row {
    return {
      kind: "note",
      id: n.id,
      title: n.title,
      meta: n.date,
      pinned: n.pinned,
      badge: false,
      deletable: true,
      chipKind: "note",
      hue: KIND_HUE.note,
      sortKey: n.date,
    };
  }
  function blueprintRow(b: BlueprintSummary): Row {
    return {
      kind: "blueprint",
      id: b.id,
      title: b.title,
      meta: `${b.nodeCount} ${b.nodeCount === 1 ? "node" : "nodes"} · ${formatUpdated(b.updatedAt)}`,
      pinned: b.pinned,
      badge: false,
      deletable: true,
      chipKind: "blueprint",
      hue: KIND_HUE.blueprint,
      sortKey: b.updatedAt,
    };
  }
  function workflowRow(w: WorkflowSummary): Row {
    return {
      kind: "workflow",
      id: w.id,
      title: w.title,
      meta: `${w.stepCount} ${w.stepCount === 1 ? "step" : "steps"}`,
      pinned: w.pinned,
      badge: false,
      deletable: true,
      chipKind: "workflow",
      hue: KIND_HUE.workflow,
      sortKey: "", // no timestamp — sorts to the bottom of "All"
    };
  }
  function boardRow(b: FeedbackBoardSummary): Row {
    return {
      kind: "board",
      id: b.id,
      title: b.title,
      meta: `${b.cardCount} ${b.cardCount === 1 ? "card" : "cards"}`,
      pinned: b.pinned,
      badge: true,
      deletable: true,
      chipKind: null,
      hue: KIND_HUE.board,
      sortKey: b.updatedAt,
    };
  }
  function cardRow(c: Flashcard): Row {
    return {
      kind: "flashcard",
      id: c.id,
      title: c.title,
      meta: formatUpdated(c.updatedAt),
      pinned: c.pinned,
      badge: true,
      deletable: true,
      chipKind: null,
      hue: KIND_HUE.flashcard,
      sortKey: c.updatedAt,
    };
  }
  function listRow(l: ListSummary): Row {
    return {
      kind: "list",
      id: l.id,
      title: l.title,
      meta: `${l.date} · ${l.total > 0 ? `${l.done}/${l.total}` : "empty"}`,
      pinned: l.pinned,
      badge: false,
      deletable: false, // lists archive only (no permanent delete)
      chipKind: "list",
      hue: KIND_HUE.list,
      sortKey: l.date,
    };
  }

  let articleRows = $derived(
    app.articles.filter((a) => !a.archived).map(articleRow),
  );
  let noteRows = $derived(app.notes.filter((n) => !n.archived).map(noteRow));
  let blueprintRows = $derived(
    app.blueprints.filter((b) => !b.archived).map(blueprintRow),
  );
  let workflowRows = $derived(
    app.workflows.filter((w) => !w.archived).map(workflowRow),
  );
  let boardRows = $derived(
    app.feedbackBoards.filter((b) => !b.archived).map(boardRow),
  );
  let cardRows = $derived(app.flashcards.filter((c) => !c.archived).map(cardRow));
  let listRows = $derived(app.lists.filter((l) => !l.archived).map(listRow));

  // "All" — every active row, most-recent first.
  let allRows = $derived(
    [
      ...articleRows,
      ...noteRows,
      ...blueprintRows,
      ...workflowRows,
      ...boardRows,
      ...cardRows,
      ...listRows,
    ].sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0)),
  );

  let rows = $derived.by<Row[]>(() => {
    switch (section) {
      case "all":
        return allRows;
      case "articles":
        return articleRows;
      case "notes":
        return noteRows;
      case "blueprints":
        return blueprintRows;
      case "workflows":
        return workflowRows;
      case "boards":
        return boardRows;
      case "cards":
        return cardRows;
      case "lists":
        return listRows;
      default:
        return [];
    }
  });

  // ----- archived (its own shape: a kind label + unarchive) -----
  type ArchivedRow =
    | { kind: "article"; entity: ArticleSummary }
    | { kind: "note"; entity: NoteSummary }
    | { kind: "workflow"; entity: WorkflowSummary }
    | { kind: "board"; entity: FeedbackBoardSummary }
    | { kind: "blueprint"; entity: BlueprintSummary }
    | { kind: "flashcard"; entity: Flashcard }
    | { kind: "list"; entity: ListSummary };
  let archivedRows = $derived<ArchivedRow[]>([
    ...app.articles
      .filter((a) => a.archived)
      .map((a) => ({ kind: "article", entity: a }) as ArchivedRow),
    ...app.notes
      .filter((n) => n.archived)
      .map((n) => ({ kind: "note", entity: n }) as ArchivedRow),
    ...app.workflows
      .filter((w) => w.archived)
      .map((w) => ({ kind: "workflow", entity: w }) as ArchivedRow),
    ...app.feedbackBoards
      .filter((b) => b.archived)
      .map((b) => ({ kind: "board", entity: b }) as ArchivedRow),
    ...app.blueprints
      .filter((b) => b.archived)
      .map((b) => ({ kind: "blueprint", entity: b }) as ArchivedRow),
    ...app.flashcards
      .filter((c) => c.archived)
      .map((c) => ({ kind: "flashcard", entity: c }) as ArchivedRow),
    ...app.lists
      .filter((l) => l.archived)
      .map((l) => ({ kind: "list", entity: l }) as ArchivedRow),
  ]);

  let counts = $derived({
    all: allRows.length,
    articles: articleRows.length,
    notes: noteRows.length,
    blueprints: blueprintRows.length,
    workflows: workflowRows.length,
    boards: boardRows.length,
    cards: cardRows.length,
    lists: listRows.length,
    archived: archivedRows.length,
  });

  const SECTIONS: { key: Section; label: string }[] = [
    { key: "all", label: "All" },
    { key: "articles", label: "Articles" },
    { key: "notes", label: "Notes" },
    { key: "blueprints", label: "Blueprints" },
    { key: "workflows", label: "Workflows" },
    { key: "boards", label: "Boards" },
    { key: "cards", label: "Cards" },
    { key: "lists", label: "Lists" },
  ];

  // ----- row actions (shared across sections) -----
  function openItem(kind: Kind, id: number) {
    if (kind === "article") app.selectArticle(id);
    else if (kind === "note") app.selectNote(id);
    else if (kind === "workflow") app.selectWorkflow(id);
    else if (kind === "board") app.openFeedbackBoard(id);
    else if (kind === "blueprint") app.openBlueprint(id);
    else if (kind === "flashcard") app.openFlashcardInDeck(id);
    else app.select(id);
  }
  function archiveItem(kind: Kind, id: number) {
    if (kind === "article") app.setArticleArchived(id, true);
    else if (kind === "note") app.setNoteArchived(id, true);
    else if (kind === "workflow") app.setWorkflowArchived(id, true);
    else if (kind === "board") app.setFeedbackBoardArchived(id, true);
    else if (kind === "blueprint") app.setBlueprintArchived(id, true);
    else if (kind === "flashcard") app.setFlashcardArchived(id, true);
    else app.setListArchived(id, true);
  }
  function unarchiveItem(kind: Kind, id: number) {
    if (kind === "article") app.setArticleArchived(id, false);
    else if (kind === "note") app.setNoteArchived(id, false);
    else if (kind === "workflow") app.setWorkflowArchived(id, false);
    else if (kind === "board") app.setFeedbackBoardArchived(id, false);
    else if (kind === "blueprint") app.setBlueprintArchived(id, false);
    else if (kind === "flashcard") app.setFlashcardArchived(id, false);
    else app.setListArchived(id, false);
  }
  function deleteItem(kind: Kind, id: number) {
    if (kind === "article") app.deleteArticleById(id);
    else if (kind === "note") app.deleteNoteById(id);
    else if (kind === "workflow") app.deleteWorkflowById(id);
    else if (kind === "board") app.deleteFeedbackBoard(id);
    else if (kind === "blueprint") app.deleteBlueprint(id);
    else if (kind === "flashcard") app.deleteFlashcardById(id);
    // Lists: skip permanent delete for now (use Archive instead).
  }
  function togglePin(kind: Kind, id: number, currentlyPinned: boolean) {
    const next = !currentlyPinned;
    if (kind === "article") app.setArticlePinnedById(id, next);
    else if (kind === "note") app.setNotePinnedById(id, next);
    else if (kind === "workflow") app.setWorkflowPinnedById(id, next);
    else if (kind === "board") app.setFeedbackBoardPinned(id, next);
    else if (kind === "blueprint") app.setBlueprintPinned(id, next);
    else if (kind === "flashcard") app.toggleFlashcardPin(id);
    else app.setListPinnedById(id, next);
  }
</script>

{#snippet entityRow(r: Row)}
  <li class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
    <span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background: hsl({r.hue} 76% 54%);"></span>
    <button
      type="button"
      class="flex-1 truncate text-left text-sm text-neutral-800 dark:text-neutral-200"
      onclick={() => openItem(r.kind, r.id)}
    >
      {#if r.badge}<TagBadges text={r.title} />{:else}{r.title}{/if}
      {#if r.pinned}<span class="ml-1 text-amber-500">📌</span>{/if}
    </button>
    {#if section === "all"}
      <span class="shrink-0 text-[10px] uppercase tracking-widest text-neutral-300 dark:text-neutral-600">
        {r.kind}
      </span>
    {/if}
    {#if r.meta}
      <span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{r.meta}</span>
    {/if}
    {#if r.chipKind}
      <IdChip kind={r.chipKind} id={r.id} />
    {/if}
    <button
      type="button"
      class="rounded p-1 transition-colors"
      class:text-amber-500={r.pinned}
      class:hover:bg-amber-50={r.pinned}
      class:dark:hover:bg-amber-950={r.pinned}
      class:text-neutral-400={!r.pinned}
      class:hover:bg-neutral-200={!r.pinned}
      class:dark:hover:bg-neutral-700={!r.pinned}
      class:hover:text-amber-500={!r.pinned}
      title={r.pinned ? "Unpin" : "Pin to sidebar"}
      onclick={() => togglePin(r.kind, r.id, r.pinned)}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
      </svg>
    </button>
    <button
      type="button"
      class="rounded p-1 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
      title="Archive"
      onclick={() => archiveItem(r.kind, r.id)}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/></svg>
    </button>
    {#if r.deletable}
      <button
        type="button"
        class="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        title="Delete permanently"
        onclick={() => deleteItem(r.kind, r.id)}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>
      </button>
    {/if}
  </li>
{/snippet}

<main class="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 py-10">
  <header class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
      Summary
    </h1>
    <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
      Everything you have, most-recent first. Open, archive when content's
      gone stale, or delete permanently.
    </p>
  </header>

  <div class="flex gap-6">
    <!-- Section rail -->
    <nav class="w-40 shrink-0">
      {#each SECTIONS as s (s.key)}
        <button
          type="button"
          class="mb-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors"
          class:bg-blue-50={section === s.key}
          class:font-medium={section === s.key}
          class:text-blue-700={section === s.key}
          class:dark:bg-blue-950={section === s.key}
          class:dark:text-blue-300={section === s.key}
          class:text-neutral-600={section !== s.key}
          class:hover:bg-neutral-100={section !== s.key}
          class:dark:text-neutral-400={section !== s.key}
          class:dark:hover:bg-neutral-800={section !== s.key}
          onclick={() => (section = s.key)}
        >
          <span>{s.label}</span>
          <span class="shrink-0 text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
            {counts[s.key]}
          </span>
        </button>
      {/each}
      <div class="my-1.5 border-t border-neutral-200/70 dark:border-neutral-700/70"></div>
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors"
        class:bg-blue-50={section === "archived"}
        class:font-medium={section === "archived"}
        class:text-blue-700={section === "archived"}
        class:dark:bg-blue-950={section === "archived"}
        class:dark:text-blue-300={section === "archived"}
        class:text-neutral-600={section !== "archived"}
        class:hover:bg-neutral-100={section !== "archived"}
        class:dark:text-neutral-400={section !== "archived"}
        class:dark:hover:bg-neutral-800={section !== "archived"}
        onclick={() => (section = "archived")}
      >
        <span>Archived</span>
        <span class="shrink-0 text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
          {counts.archived}
        </span>
      </button>
    </nav>

    <!-- Content pane -->
    <div class="min-w-0 flex-1">
      {#if section === "archived"}
        {#if archivedRows.length === 0}
          <p class="text-sm text-neutral-400 dark:text-neutral-500">
            Nothing archived yet. Archive items from the other sections to hide
            them without deleting.
          </p>
        {:else}
          <ul class="flex flex-col gap-1">
            {#each archivedRows as row (row.kind + ":" + row.entity.id)}
              {@const e = row.entity}
              <li class="flex items-center gap-2 rounded-md px-2 py-1.5 opacity-80 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
                <span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background: hsl({KIND_HUE[row.kind]} 76% 54%);"></span>
                <p class="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  {row.kind}
                </p>
                <button
                  type="button"
                  class="flex-1 truncate text-left text-sm text-neutral-700 dark:text-neutral-300"
                  onclick={() => openItem(row.kind, e.id)}
                >
                  {e.title}
                </button>
                {#if row.kind !== "board" && row.kind !== "flashcard"}
                  <IdChip kind={row.kind} id={e.id} />
                {/if}
                <button
                  type="button"
                  class="rounded p-1 text-neutral-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                  title="Unarchive"
                  onclick={() => unarchiveItem(row.kind, e.id)}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M10 3a1 1 0 01.707.293l5 5a1 1 0 11-1.414 1.414L11 6.414V16a1 1 0 11-2 0V6.414L5.707 9.707a1 1 0 01-1.414-1.414l5-5A1 1 0 0110 3z"/></svg>
                </button>
                {#if row.kind !== "list"}
                  <button
                    type="button"
                    class="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    title="Delete permanently"
                    onclick={() => deleteItem(row.kind, e.id)}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {:else if rows.length === 0}
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          Nothing here yet.
        </p>
      {:else}
        <ul class="flex flex-col gap-1">
          {#each rows as r (r.kind + ":" + r.id)}
            {@render entityRow(r)}
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</main>
