<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import IdChip from "$lib/components/IdChip.svelte";
  import type {
    ArticleSummary,
    ListSummary,
    NoteSummary,
    WorkflowSummary,
  } from "$lib/ipc";

  type Tab =
    | "articles"
    | "notes"
    | "workflows"
    | "lists"
    | "archived";
  let tab = $state<Tab>("articles");

  // Sort helpers — most recent first. Notes/lists fall back to date.
  function byUpdated<T extends { updatedAt: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
  }
  function byDate<T extends { date: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }

  let activeArticles = $derived<ArticleSummary[]>(
    byUpdated(app.articles.filter((a) => !a.archived)),
  );
  let activeNotes = $derived<NoteSummary[]>(
    byDate(app.notes.filter((n) => !n.archived)),
  );
  let activeWorkflows = $derived<WorkflowSummary[]>(
    app.workflows.filter((w) => !w.archived),
  );
  let activeLists = $derived<ListSummary[]>(
    byDate(app.lists.filter((l) => !l.archived)),
  );

  // Archived tab: union of all kinds, tagged for rendering.
  type ArchivedRow =
    | { kind: "article"; entity: ArticleSummary }
    | { kind: "note"; entity: NoteSummary }
    | { kind: "workflow"; entity: WorkflowSummary }
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
    ...app.lists
      .filter((l) => l.archived)
      .map((l) => ({ kind: "list", entity: l }) as ArchivedRow),
  ]);

  let counts = $derived({
    articles: activeArticles.length,
    notes: activeNotes.length,
    workflows: activeWorkflows.length,
    lists: activeLists.length,
    archived: archivedRows.length,
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "articles", label: "Articles" },
    { key: "notes", label: "Notes" },
    { key: "workflows", label: "Workflows" },
    { key: "lists", label: "Lists" },
    { key: "archived", label: "Archived" },
  ];

  // Per-kind row actions.
  function openItem(kind: ArchivedRow["kind"], id: number) {
    if (kind === "article") app.selectArticle(id);
    else if (kind === "note") app.selectNote(id);
    else if (kind === "workflow") app.selectWorkflow(id);
    else app.select(id);
  }
  function archiveItem(kind: ArchivedRow["kind"], id: number) {
    if (kind === "article") app.setArticleArchived(id, true);
    else if (kind === "note") app.setNoteArchived(id, true);
    else if (kind === "workflow") app.setWorkflowArchived(id, true);
    else app.setListArchived(id, true);
  }
  function unarchiveItem(kind: ArchivedRow["kind"], id: number) {
    if (kind === "article") app.setArticleArchived(id, false);
    else if (kind === "note") app.setNoteArchived(id, false);
    else if (kind === "workflow") app.setWorkflowArchived(id, false);
    else app.setListArchived(id, false);
  }
  function deleteItem(kind: ArchivedRow["kind"], id: number) {
    if (kind === "article") app.deleteArticleById(id);
    else if (kind === "note") app.deleteNoteById(id);
    else if (kind === "workflow") app.deleteWorkflowById(id);
    // Lists: skip permanent delete for now (use Archive instead).
  }

  function togglePin(
    kind: ArchivedRow["kind"],
    id: number,
    currentlyPinned: boolean,
  ) {
    const next = !currentlyPinned;
    if (kind === "article") app.setArticlePinnedById(id, next);
    else if (kind === "note") app.setNotePinnedById(id, next);
    else if (kind === "workflow") app.setWorkflowPinnedById(id, next);
    else app.setListPinnedById(id, next);
  }

  const KIND_HUE: Record<ArchivedRow["kind"], number> = {
    note: 217,
    article: 268,
    workflow: 32,
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
</script>

<main class="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-8 py-10">
  <header class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
      Summary
    </h1>
    <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
      Everything you have, most-recent first. Open, archive when content's
      gone stale, or delete permanently.
    </p>
  </header>

  <div class="mb-4 flex flex-wrap gap-1.5 border-b border-neutral-200/70 dark:border-neutral-700/70">
    {#each TABS as t}
      <button
        type="button"
        class="-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
        class:border-blue-600={tab === t.key}
        class:text-blue-700={tab === t.key}
        class:dark:border-blue-400={tab === t.key}
        class:dark:text-blue-300={tab === t.key}
        class:border-transparent={tab !== t.key}
        class:text-neutral-500={tab !== t.key}
        class:hover:text-neutral-700={tab !== t.key}
        class:dark:text-neutral-400={tab !== t.key}
        class:dark:hover:text-neutral-200={tab !== t.key}
        onclick={() => (tab = t.key)}
      >
        {t.label}
        <span
          class="rounded-full bg-neutral-200/60 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-600 dark:bg-neutral-700/40 dark:text-neutral-300"
        >
          {counts[t.key]}
        </span>
      </button>
    {/each}
  </div>

  {#if tab === "articles"}
    {#if activeArticles.length === 0}
      <p class="text-sm text-neutral-400 dark:text-neutral-500">No articles yet.</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each activeArticles as a (a.id)}
          <li class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background: hsl({KIND_HUE.article} 78% 55%);"></span>
            <button
              type="button"
              class="flex-1 truncate text-left text-sm text-neutral-800 dark:text-neutral-200"
              onclick={() => openItem("article", a.id)}
            >
              {a.title}
              {#if a.pinned}<span class="ml-1 text-amber-500">📌</span>{/if}
            </button>
            <span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
              {formatUpdated(a.updatedAt)}
            </span>
            <IdChip kind="article" id={a.id} />
            <button
              type="button"
              class="rounded p-1 transition-colors"
              class:text-amber-500={a.pinned}
              class:hover:bg-amber-50={a.pinned}
              class:dark:hover:bg-amber-950={a.pinned}
              class:text-neutral-400={!a.pinned}
              class:hover:bg-neutral-200={!a.pinned}
              class:dark:hover:bg-neutral-700={!a.pinned}
              class:hover:text-amber-500={!a.pinned}
              title={a.pinned ? "Unpin" : "Pin to sidebar"}
              onclick={() => togglePin("article", a.id, a.pinned)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
              </svg>
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
              title="Archive"
              onclick={() => archiveItem("article", a.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/></svg>
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              title="Delete permanently"
              onclick={() => deleteItem("article", a.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tab === "notes"}
    {#if activeNotes.length === 0}
      <p class="text-sm text-neutral-400 dark:text-neutral-500">No notes yet.</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each activeNotes as n (n.id)}
          <li class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background: hsl({KIND_HUE.note} 78% 55%);"></span>
            <button
              type="button"
              class="flex-1 truncate text-left text-sm text-neutral-800 dark:text-neutral-200"
              onclick={() => openItem("note", n.id)}
            >
              {n.title}
              {#if n.pinned}<span class="ml-1 text-amber-500">📌</span>{/if}
            </button>
            <span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{n.date}</span>
            <IdChip kind="note" id={n.id} />
            <button
              type="button"
              class="rounded p-1 transition-colors"
              class:text-amber-500={n.pinned}
              class:hover:bg-amber-50={n.pinned}
              class:dark:hover:bg-amber-950={n.pinned}
              class:text-neutral-400={!n.pinned}
              class:hover:bg-neutral-200={!n.pinned}
              class:dark:hover:bg-neutral-700={!n.pinned}
              class:hover:text-amber-500={!n.pinned}
              title={n.pinned ? "Unpin" : "Pin to sidebar"}
              onclick={() => togglePin("note", n.id, n.pinned)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
              </svg>
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
              title="Archive"
              onclick={() => archiveItem("note", n.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/></svg>
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              title="Delete permanently"
              onclick={() => deleteItem("note", n.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tab === "workflows"}
    {#if activeWorkflows.length === 0}
      <p class="text-sm text-neutral-400 dark:text-neutral-500">No workflows yet.</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each activeWorkflows as w (w.id)}
          <li class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background: hsl({KIND_HUE.workflow} 78% 55%);"></span>
            <button
              type="button"
              class="flex-1 truncate text-left text-sm text-neutral-800 dark:text-neutral-200"
              onclick={() => openItem("workflow", w.id)}
            >
              {w.title}
              {#if w.pinned}<span class="ml-1 text-amber-500">📌</span>{/if}
            </button>
            <span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
              {w.stepCount} {w.stepCount === 1 ? "step" : "steps"}
            </span>
            <IdChip kind="workflow" id={w.id} />
            <button
              type="button"
              class="rounded p-1 transition-colors"
              class:text-amber-500={w.pinned}
              class:hover:bg-amber-50={w.pinned}
              class:dark:hover:bg-amber-950={w.pinned}
              class:text-neutral-400={!w.pinned}
              class:hover:bg-neutral-200={!w.pinned}
              class:dark:hover:bg-neutral-700={!w.pinned}
              class:hover:text-amber-500={!w.pinned}
              title={w.pinned ? "Unpin" : "Pin to sidebar"}
              onclick={() => togglePin("workflow", w.id, w.pinned)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
              </svg>
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
              title="Archive"
              onclick={() => archiveItem("workflow", w.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/></svg>
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              title="Delete permanently"
              onclick={() => deleteItem("workflow", w.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tab === "lists"}
    {#if activeLists.length === 0}
      <p class="text-sm text-neutral-400 dark:text-neutral-500">No lists yet.</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each activeLists as l (l.id)}
          <li class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background: hsl({KIND_HUE.list} 78% 55%);"></span>
            <button
              type="button"
              class="flex-1 truncate text-left text-sm text-neutral-800 dark:text-neutral-200"
              onclick={() => openItem("list", l.id)}
            >
              {l.title}
              {#if l.pinned}<span class="ml-1 text-amber-500">📌</span>{/if}
            </button>
            <span class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
              {l.date} · {l.total > 0 ? `${l.done}/${l.total}` : "empty"}
            </span>
            <IdChip kind="list" id={l.id} />
            <button
              type="button"
              class="rounded p-1 transition-colors"
              class:text-amber-500={l.pinned}
              class:hover:bg-amber-50={l.pinned}
              class:dark:hover:bg-amber-950={l.pinned}
              class:text-neutral-400={!l.pinned}
              class:hover:bg-neutral-200={!l.pinned}
              class:dark:hover:bg-neutral-700={!l.pinned}
              class:hover:text-amber-500={!l.pinned}
              title={l.pinned ? "Unpin" : "Pin to sidebar"}
              onclick={() => togglePin("list", l.id, l.pinned)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                <path d="M10 1.5a.75.75 0 01.75.75v1.293l3.116 3.116a.75.75 0 01.184.74l-.842 2.526L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.792-1.575-.842-2.526a.75.75 0 01.184-.74L9.25 3.543V2.25A.75.75 0 0110 1.5z"/>
              </svg>
            </button>
            <button
              type="button"
              class="rounded p-1 text-neutral-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
              title="Archive"
              onclick={() => archiveItem("list", l.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 5h12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V9zm4 2a1 1 0 100 2h4a1 1 0 100-2H8z"/></svg>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <!-- Archived -->
    {#if archivedRows.length === 0}
      <p class="text-sm text-neutral-400 dark:text-neutral-500">
        Nothing archived yet. Archive items from the other tabs to hide them
        without deleting.
      </p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each archivedRows as row (row.kind + ":" + row.entity.id)}
          {@const e = row.entity}
          <li class="flex items-center gap-2 rounded-md px-2 py-1.5 opacity-80 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background: hsl({KIND_HUE[row.kind]} 78% 55%);"></span>
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
            <IdChip kind={row.kind} id={e.id} />
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
  {/if}
</main>
