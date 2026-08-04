<script lang="ts">
  import { untrack } from "svelte";
  import { app } from "$lib/stores/app.svelte";
  import TagBadges from "$lib/components/TagBadges.svelte";
  import type {
    ArticleSummary,
    BlueprintSummary,
    FeedbackBoardSummary,
    Flashcard,
    NoteSummary,
    StoryboardSummary,
  } from "$lib/ipc";

  // The Library consolidates the old Summary + Blueprints + Feedback +
  // Storyboards index views. `initialKind` seeds the filter (so ⌘2/⌘5 can open
  // it pre-filtered to Blueprints / Boards).
  let { initialKind = "all" }: { initialKind?: Filter } = $props();

  type Kind =
    | "note"
    | "article"
    | "blueprint"
    | "board"
    | "storyboard"
    | "flashcard";
  type Filter = Kind | "all" | "pinned" | "archived";

  const KINDS: { key: Kind; label: string; hue: number; icon: string; creatable: boolean; renamable: boolean }[] = [
    { key: "note", label: "Notes", hue: 217, icon: "note", creatable: true, renamable: false },
    { key: "article", label: "Articles", hue: 268, icon: "article", creatable: true, renamable: false },
    { key: "blueprint", label: "Blueprints", hue: 200, icon: "blueprint", creatable: true, renamable: true },
    { key: "board", label: "Boards", hue: 350, icon: "board", creatable: true, renamable: true },
    { key: "storyboard", label: "Storyboards", hue: 158, icon: "storyboard", creatable: true, renamable: true },
    { key: "flashcard", label: "Flash cards", hue: 175, icon: "flashcard", creatable: false, renamable: false },
  ];
  const KINDMAP = Object.fromEntries(KINDS.map((k) => [k.key, k])) as Record<Kind, (typeof KINDS)[number]>;

  // Inline glyph paths per kind (currentColor line icons).
  const ICON: Record<string, string> = {
    note: '<path d="M5 3h7l3 3v11H5z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 8h5M8 11h5M8 14h3" stroke="currentColor" stroke-width="1.4"/>',
    article: '<rect x="3.5" y="4" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 8h8M6 11h8M6 14h5" stroke="currentColor" stroke-width="1.4"/>',
    blueprint: '<rect x="3" y="3" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="12" y="12" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 5.5h4v6.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    board: '<rect x="3" y="3" width="4" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="8.5" y="3" width="4" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="14" y="3" width="3.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    storyboard: '<rect x="3" y="5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 5v10M13 5v10" stroke="currentColor" stroke-width="1.4"/>',
    flashcard: '<rect x="3.5" y="5" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 9h6M7 12h4" stroke="currentColor" stroke-width="1.4"/>',
  };

  type Row = {
    kind: Kind;
    id: number;
    title: string;
    meta: string;
    pinned: boolean;
    archived: boolean;
    badge: boolean; // render title through TagBadges (#tags)
    hue: number;
    sortKey: string;
  };

  function fmtUpdated(raw: string): string {
    if (!raw) return "";
    const d = new Date(raw.replace(" ", "T") + "Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w + "s"}`;

  function articleRow(a: ArticleSummary): Row {
    return { kind: "article", id: a.id, title: a.title, meta: fmtUpdated(a.updatedAt), pinned: a.pinned, archived: a.archived, badge: false, hue: 268, sortKey: a.updatedAt };
  }
  function noteRow(n: NoteSummary): Row {
    return { kind: "note", id: n.id, title: n.title, meta: n.date, pinned: n.pinned, archived: n.archived, badge: false, hue: 217, sortKey: n.date };
  }
  function blueprintRow(b: BlueprintSummary): Row {
    return { kind: "blueprint", id: b.id, title: b.title, meta: `${plural(b.nodeCount, "node")} · ${fmtUpdated(b.updatedAt)}`, pinned: b.pinned, archived: b.archived, badge: false, hue: 200, sortKey: b.updatedAt };
  }
  function storyboardRow(s: StoryboardSummary): Row {
    return { kind: "storyboard", id: s.id, title: s.title, meta: `${plural(s.pageCount, "page")} · ${fmtUpdated(s.updatedAt)}`, pinned: s.pinned, archived: s.archived, badge: false, hue: 158, sortKey: s.updatedAt };
  }
  function boardRow(b: FeedbackBoardSummary): Row {
    return { kind: "board", id: b.id, title: b.title, meta: `${plural(b.cardCount, "card")} · ${fmtUpdated(b.updatedAt)}`, pinned: b.pinned, archived: b.archived, badge: true, hue: 350, sortKey: b.updatedAt };
  }
  function cardRow(c: Flashcard): Row {
    return { kind: "flashcard", id: c.id, title: c.title, meta: fmtUpdated(c.updatedAt), pinned: c.pinned, archived: c.archived, badge: true, hue: 175, sortKey: c.updatedAt };
  }

  let rows = $derived<Row[]>([
    ...app.articles.map(articleRow),
    ...app.notes.map(noteRow),
    ...app.blueprints.map(blueprintRow),
    ...app.storyboards.map(storyboardRow),
    ...app.feedbackBoards.map(boardRow),
    ...app.flashcards.map(cardRow),
  ]);

  let counts = $derived.by(() => {
    const c: Record<string, number> = { all: 0, pinned: 0, archived: 0 };
    for (const k of KINDS) c[k.key] = 0;
    for (const r of rows) {
      if (r.archived) { c.archived++; continue; }
      c.all++; c[r.kind]++;
      if (r.pinned) c.pinned++;
    }
    return c;
  });

  // ----- view state -----
  let filter = $state<Filter>(untrack(() => initialKind));
  function onCardKey(e: KeyboardEvent, k: Kind, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openItem(k, id);
    }
  }
  let q = $state("");
  let sort = $state<"recent" | "az" | "type">("recent");
  let view = $state<"grid" | "list">("grid");

  let filtered = $derived.by<Row[]>(() => {
    const query = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (filter === "archived") return r.archived;
      if (r.archived) return false;
      if (filter === "pinned") return r.pinned;
      if (filter !== "all" && r.kind !== filter) return false;
      return true;
    });
    if (query) list = list.filter((r) => r.title.toLowerCase().includes(query));
    const s = sort;
    return list.sort((a, b) =>
      s === "az"
        ? a.title.localeCompare(b.title)
        : s === "type"
          ? a.kind.localeCompare(b.kind) || (a.sortKey < b.sortKey ? 1 : -1)
          : a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0,
    );
  });

  // Pinned surfaces to the top of "all"/type views (not in pinned/archived).
  let groups = $derived.by<{ title: string; rows: Row[] }[]>(() => {
    if (filter === "pinned") return [{ title: "Pinned", rows: filtered }];
    if (filter === "archived") return [{ title: "Archived", rows: filtered }];
    const pinned = filtered.filter((r) => r.pinned);
    const rest = filtered.filter((r) => !r.pinned);
    const label = filter === "all" ? "All" : KINDMAP[filter as Kind].label;
    const out: { title: string; rows: Row[] }[] = [];
    if (pinned.length) out.push({ title: "Pinned", rows: pinned });
    out.push({ title: label, rows: rest });
    return out;
  });

  const chipList: { key: Filter; label: string; dot: string }[] = [
    { key: "all", label: "All", dot: "var(--lib-muted)" },
    { key: "pinned", label: "Pinned", dot: "#f0a92b" },
    ...KINDS.map((k) => ({ key: k.key as Filter, label: k.label, dot: `hsl(${k.hue} 66% 55%)` })),
    { key: "archived", label: "Archived", dot: "var(--lib-muted)" },
  ];

  // ----- actions -----
  function openItem(k: Kind, id: number) {
    if (k === "article") app.selectArticle(id);
    else if (k === "note") app.selectNote(id);
    else if (k === "board") app.openFeedbackBoard(id);
    else if (k === "blueprint") app.openBlueprint(id);
    else if (k === "storyboard") app.openStoryboard(id);
    else app.openFlashcardInDeck(id);
  }
  function togglePin(k: Kind, id: number, pinned: boolean) {
    const next = !pinned;
    if (k === "article") app.setArticlePinnedById(id, next);
    else if (k === "note") app.setNotePinnedById(id, next);
    else if (k === "board") app.setFeedbackBoardPinned(id, next);
    else if (k === "blueprint") app.setBlueprintPinned(id, next);
    else if (k === "storyboard") app.setStoryboardPinned(id, next);
    else app.toggleFlashcardPin(id);
  }
  function setArchived(k: Kind, id: number, val: boolean) {
    if (k === "article") app.setArticleArchived(id, val);
    else if (k === "note") app.setNoteArchived(id, val);
    else if (k === "board") app.setFeedbackBoardArchived(id, val);
    else if (k === "blueprint") app.setBlueprintArchived(id, val);
    else if (k === "storyboard") app.setStoryboardArchived(id, val);
    else app.setFlashcardArchived(id, val);
  }
  function deleteItem(k: Kind, id: number) {
    if (k === "article") app.deleteArticleById(id);
    else if (k === "note") app.deleteNoteById(id);
    else if (k === "board") app.deleteFeedbackBoard(id);
    else if (k === "blueprint") app.deleteBlueprint(id);
    else if (k === "storyboard") app.deleteStoryboard(id);
    else app.deleteFlashcardById(id);
  }
  function renameItem(k: Kind, id: number, current: string) {
    const next = prompt("Rename", current);
    if (next == null || next.trim() === "" || next === current) return;
    if (k === "blueprint") app.renameBlueprint(id, next.trim());
    else if (k === "board") app.renameFeedbackBoard(id, next.trim());
    else if (k === "storyboard") app.renameStoryboard(id, next.trim());
  }
</script>

<div class="lib flex h-full min-h-0 flex-col">
  <!-- toolbar -->
  <div class="flex items-center gap-2 px-6 pb-3 pt-4">
    <h1 class="whitespace-nowrap text-base font-semibold text-neutral-900 dark:text-neutral-100">Library</h1>
    <div class="relative ml-1 max-w-md flex-1">
      <svg viewBox="0 0 20 20" fill="currentColor" class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 103.4 9.83l3.63 3.64a.75.75 0 101.06-1.06l-3.64-3.63A5.5 5.5 0 009 3.5zM5 9a4 4 0 118 0 4 4 0 01-8 0z" clip-rule="evenodd"/></svg>
      <input
        bind:value={q}
        type="text"
        placeholder="Search your library…"
        class="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />
    </div>
    <div class="flex-1"></div>
    <select
      bind:value={sort}
      class="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
    >
      <option value="recent">Recently updated</option>
      <option value="az">Title A–Z</option>
      <option value="type">Type</option>
    </select>
    <div class="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
      <button
        class="px-2.5 py-1.5 text-sm {view === 'grid' ? 'bg-blue-500/15 text-neutral-900 dark:text-neutral-100' : 'bg-white text-neutral-500 dark:bg-neutral-900'}"
        title="Grid" onclick={() => (view = "grid")}>▦</button>
      <button
        class="px-2.5 py-1.5 text-sm {view === 'list' ? 'bg-blue-500/15 text-neutral-900 dark:text-neutral-100' : 'bg-white text-neutral-500 dark:bg-neutral-900'}"
        title="List" onclick={() => (view = "list")}>≣</button>
    </div>
    <button
      class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
      onclick={() => (app.addModalOpen = true)}
    >+ New</button>
  </div>

  <!-- filter chips (horizontal — coexists with the app sidebar) -->
  <div class="flex flex-wrap gap-1.5 border-b border-neutral-200 px-6 pb-3 dark:border-neutral-800">
    {#each chipList as c (c.key)}
      {#if c.key === "archived"}<span class="mx-1 self-center text-neutral-300 dark:text-neutral-700">|</span>{/if}
      <button
        class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {filter === c.key
          ? 'border-blue-400/50 bg-blue-500/15 text-neutral-900 dark:text-neutral-100'
          : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-400'}"
        onclick={() => (filter = c.key)}
      >
        <span class="h-2 w-2 shrink-0 rounded-full" style="background:{c.dot}"></span>
        {c.label}
        <span class="font-mono text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">{counts[c.key]}</span>
      </button>
    {/each}
  </div>

  <!-- content -->
  <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-4">
    {#if filtered.length === 0}
      <p class="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">Nothing here yet.</p>
    {:else}
      {#each groups as g (g.title)}
        <section class="mb-6">
          <div class="mb-3 flex items-center gap-2">
            <h2 class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{g.title}</h2>
            <span class="font-mono text-[11px] tabular-nums text-neutral-300 dark:text-neutral-600">{g.rows.length}</span>
            <span class="h-px flex-1 bg-neutral-200 dark:bg-neutral-800"></span>
          </div>

          {#if view === "grid"}
            <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));">
              {#each g.rows as r (r.kind + r.id)}
                <div
                  class="group relative flex min-h-[104px] cursor-pointer flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3.5 transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900"
                  style="border-left:3px solid hsl({r.hue} 68% 55%)"
                  role="button"
                  tabindex="0"
                  onclick={() => openItem(r.kind, r.id)}
                  onkeydown={(e) => onCardKey(e, r.kind, r.id)}
                >
                  <div class="flex items-center gap-1.5">
                    <span class="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide" style="color:hsl({r.hue} 60% 50%)">
                      <svg viewBox="0 0 20 20" class="h-3.5 w-3.5">{@html ICON[r.kind]}</svg>{KINDMAP[r.kind].label.replace(/s$/, "")}
                    </span>
                    <button
                      class="ml-auto rounded p-1 {r.pinned ? 'text-amber-500' : 'text-neutral-300 hover:text-amber-500 dark:text-neutral-600'}"
                      title={r.pinned ? "Unpin" : "Pin to sidebar"}
                      onclick={(e) => { e.stopPropagation(); togglePin(r.kind, r.id, r.pinned); }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M10 1.5a.75.75 0 01.75.75v1.29l3.12 3.12a.75.75 0 01.18.74l-.84 2.53L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.79-1.58-.84-2.53a.75.75 0 01.18-.74L9.25 3.54V2.25A.75.75 0 0110 1.5z"/></svg>
                    </button>
                  </div>
                  <h3 class="line-clamp-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    {#if r.badge}<TagBadges text={r.title} />{:else}{r.title || "Untitled"}{/if}
                  </h3>
                  <div class="mt-auto flex items-center text-[11.5px] text-neutral-400 dark:text-neutral-500">
                    <span class="truncate">{r.meta}</span>
                  </div>
                  <div class="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {#if filter === "archived"}
                      {@render actionBtn("restore", () => setArchived(r.kind, r.id, false), "Restore")}
                      {@render actionBtn("trash", () => deleteItem(r.kind, r.id), "Delete")}
                    {:else}
                      {#if KINDMAP[r.kind].renamable}{@render actionBtn("edit", () => renameItem(r.kind, r.id, r.title), "Rename")}{/if}
                      {@render actionBtn("archive", () => setArchived(r.kind, r.id, true), "Archive")}
                      {@render actionBtn("trash", () => deleteItem(r.kind, r.id), "Delete")}
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="flex flex-col">
              {#each g.rows as r (r.kind + r.id)}
                <div
                  class="group flex cursor-pointer items-center gap-3 rounded-lg py-2 pl-2.5 pr-2 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40"
                  style="border-left:3px solid hsl({r.hue} 68% 55%)"
                  role="button"
                  tabindex="0"
                  onclick={() => openItem(r.kind, r.id)}
                  onkeydown={(e) => onCardKey(e, r.kind, r.id)}
                >
                  <span class="inline-flex w-[100px] shrink-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide" style="color:hsl({r.hue} 60% 50%)">
                    <svg viewBox="0 0 20 20" class="h-3.5 w-3.5">{@html ICON[r.kind]}</svg>{KINDMAP[r.kind].label.replace(/s$/, "")}
                  </span>
                  <span class="flex-1 truncate text-sm text-neutral-800 dark:text-neutral-200">
                    {#if r.badge}<TagBadges text={r.title} />{:else}{r.title || "Untitled"}{/if}
                  </span>
                  <span class="shrink-0 text-[11.5px] text-neutral-400 dark:text-neutral-500">{r.meta}</span>
                  <button
                    class="rounded p-1 {r.pinned ? 'text-amber-500' : 'text-neutral-300 hover:text-amber-500 dark:text-neutral-600'}"
                    title={r.pinned ? "Unpin" : "Pin"}
                    onclick={(e) => { e.stopPropagation(); togglePin(r.kind, r.id, r.pinned); }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M10 1.5a.75.75 0 01.75.75v1.29l3.12 3.12a.75.75 0 01.18.74l-.84 2.53L15 11.5v.75a.75.75 0 01-.75.75H11v4l-1 1-1-1v-4H5.75A.75.75 0 015 12.25v-.75l1.79-1.58-.84-2.53a.75.75 0 01.18-.74L9.25 3.54V2.25A.75.75 0 0110 1.5z"/></svg>
                  </button>
                  <span class="flex gap-0.5 opacity-0 group-hover:opacity-100">
                    {#if filter === "archived"}
                      {@render actionBtn("restore", () => setArchived(r.kind, r.id, false), "Restore")}
                      {@render actionBtn("trash", () => deleteItem(r.kind, r.id), "Delete")}
                    {:else}
                      {#if KINDMAP[r.kind].renamable}{@render actionBtn("edit", () => renameItem(r.kind, r.id, r.title), "Rename")}{/if}
                      {@render actionBtn("archive", () => setArchived(r.kind, r.id, true), "Archive")}
                      {@render actionBtn("trash", () => deleteItem(r.kind, r.id), "Delete")}
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</div>

{#snippet actionBtn(icon: string, fn: () => void, label: string)}
  <button
    class="rounded-md border border-neutral-200 bg-white/70 p-1 text-neutral-400 hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/70 dark:hover:text-neutral-200"
    title={label}
    aria-label={label}
    onclick={(e) => { e.stopPropagation(); fn(); }}
  >
    <svg viewBox="0 0 20 20" class="h-3.5 w-3.5">
      {#if icon === "archive"}<path d="M3 4h14v3H3zM4 8h12v8H4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 11h4" stroke="currentColor" stroke-width="1.4"/>
      {:else if icon === "trash"}<path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" stroke-width="1.4"/>
      {:else if icon === "restore"}<path d="M4 9a6 6 0 116 6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 5v4h4" fill="none" stroke="currentColor" stroke-width="1.4"/>
      {:else}<path d="M13 4l3 3-8 8H5v-3z" fill="none" stroke="currentColor" stroke-width="1.4"/>{/if}
    </svg>
  </button>
{/snippet}

<style>
  .lib { --lib-muted: #8b97ad; }
</style>
