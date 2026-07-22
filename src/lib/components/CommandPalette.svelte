<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";

  type Item = {
    key: string;
    group: string;
    label: string;
    sub?: string;
    hint?: string;
    run: () => void | Promise<void>;
  };

  let query = $state("");
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    queueMicrotask(() => input?.focus());
  });

  function close() {
    app.paletteOpen = false;
  }
  function act(fn: () => void | Promise<void>) {
    close();
    void fn();
  }

  // Destinations — double as the nav legend (label + what-it-is + shortcut).
  const destinations: Item[] = [
    { key: "go-home", group: "Go to", label: "Home", sub: "Today & your activity over time", hint: "⌘1", run: () => app.goHome(true) },
    { key: "go-map", group: "Go to", label: "Alexandria", sub: "Your canvas — place & connect entities", hint: "⌘2", run: () => app.openMap() },
    { key: "go-index", group: "Go to", label: "Summary", sub: "A catalog of everything you've made", hint: "⌘3", run: () => app.openIndex() },
    { key: "go-garden", group: "Go to", label: "Visualization", sub: "A graph of your notes, articles & links", hint: "⌘4", run: () => app.openGarden() },
    { key: "go-feedback", group: "Go to", label: "Feedback", sub: "Kanban boards", hint: "⌘5", run: () => app.openFeedback() },
    { key: "go-activity", group: "Go to", label: "Activity", sub: "When you've been working", hint: "⌘6", run: () => app.openActivity() },
    { key: "go-deck", group: "Go to", label: "Flash Deck", sub: "Your flashcards", hint: "⌘7", run: () => app.openFlashDeck() },
    { key: "go-blueprints", group: "Go to", label: "Blueprints", sub: "Design canvases for planning software", hint: "⌘8", run: () => app.openBlueprints() },
  ];

  const actions: Item[] = [
    { key: "new-note", group: "Create", label: "New note", run: () => app.newEntity("note", "") },
    { key: "new-article", group: "Create", label: "New article", run: () => app.newEntity("article", "") },
    { key: "new-workflow", group: "Create", label: "New workflow", run: () => app.newEntity("workflow", "") },
    { key: "new-card", group: "Create", label: "New flashcard", run: () => app.newEntity("flashcard", "") },
    { key: "new-board", group: "Create", label: "New feedback board", run: () => app.newFeedbackBoard("New board") },
    { key: "new-list", group: "Create", label: "Create today's list", run: () => app.newList() },
    { key: "backlog", group: "Go to", label: "Backlog", sub: "Unscheduled tasks, not tied to a day", run: () => app.openBacklog() },
    { key: "focus", group: "Settings", label: "Enter Focus mode", sub: "Aurora screensaver of today's list", run: () => app.enterFocus() },
    { key: "theme", group: "Settings", label: "Toggle theme (light / dark / system)", run: () => theme.cycle() },
    { key: "sidebar", group: "Settings", label: "Toggle sidebar", hint: "⌘\\", run: () => app.toggleSidebar() },
    { key: "fmt", group: "Help", label: "Formatting reference", run: () => (app.formattingHelpOpen = true) },
    { key: "shortcuts", group: "Help", label: "Keyboard shortcuts", hint: "?", run: () => (app.helpOpen = true) },
  ];

  // Entities pulled from already-loaded store state (no backend round-trip).
  let entities = $derived.by<Item[]>(() => {
    const out: Item[] = [];
    for (const n of app.notes) {
      if (n.archived) continue;
      out.push({ key: `note-${n.id}`, group: "Notes", label: n.title, sub: n.date, run: () => app.selectNote(n.id) });
    }
    for (const a of app.articles) {
      if (a.archived) continue;
      out.push({ key: `art-${a.id}`, group: "Articles", label: a.title, run: () => app.selectArticle(a.id) });
    }
    for (const w of app.workflows) {
      if (w.archived) continue;
      out.push({ key: `wf-${w.id}`, group: "Workflows", label: w.title, run: () => app.selectWorkflow(w.id) });
    }
    for (const c of app.flashcards) {
      if (c.archived) continue;
      out.push({ key: `fc-${c.id}`, group: "Flashcards", label: c.title, run: () => app.openFlashcardInDeck(c.id) });
    }
    for (const b of app.feedbackBoards) {
      if (b.archived) continue;
      out.push({ key: `bd-${b.id}`, group: "Boards", label: b.title, run: () => app.openFeedbackBoard(b.id) });
    }
    for (const l of app.lists) {
      if (l.archived) continue;
      out.push({ key: `ls-${l.id}`, group: "Lists", label: l.title, sub: l.date, run: () => app.select(l.id) });
    }
    for (const t of app.allTodos) {
      out.push({ key: `td-${t.id}`, group: "Todos", label: t.text, sub: t.listTitle, run: () => app.goToHit(t) });
    }
    return out;
  });

  let results = $derived.by<Item[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query: just the nav legend + create/settings actions.
      return [...destinations, ...actions];
    }
    const pool = [...destinations, ...actions, ...entities];
    const scored = pool
      .map((it) => {
        const hay = `${it.label} ${it.sub ?? ""} ${it.group}`.toLowerCase();
        const idx = hay.indexOf(q);
        return { it, idx };
      })
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx);
    return scored.slice(0, 50).map((x) => x.it);
  });

  // Keep selection in range as results change.
  $effect(() => {
    results;
    if (sel >= results.length) sel = Math.max(0, results.length - 1);
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      sel = Math.min(sel + 1, results.length - 1);
      scrollSel();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      sel = Math.max(sel - 1, 0);
      scrollSel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[sel];
      if (item) act(item.run);
    }
  }
  function scrollSel() {
    queueMicrotask(() => {
      listEl?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }
</script>

<button type="button" class="fixed inset-0 z-[80] cursor-default bg-neutral-900/40 backdrop-blur-sm dark:bg-neutral-950/60" aria-label="Close" onclick={close}></button>
<div class="fixed left-1/2 top-[12vh] z-[81] w-full max-w-xl -translate-x-1/2 px-4">
  <div class="overflow-hidden rounded-xl border border-neutral-200/70 bg-white shadow-2xl dark:border-neutral-700/70 dark:bg-neutral-900">
    <div class="flex items-center gap-2 border-b border-neutral-200/70 px-3 py-2.5 dark:border-neutral-700/70">
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z" clip-rule="evenodd"/></svg>
      <input
        bind:this={input}
        bind:value={query}
        onkeydown={onKey}
        type="text"
        placeholder="Search everything, or jump to a section…"
        class="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400 dark:text-neutral-100"
      />
      <kbd class="rounded border border-neutral-300/70 px-1.5 py-0.5 text-[10px] text-neutral-400 dark:border-neutral-700/70">esc</kbd>
    </div>
    <div bind:this={listEl} class="max-h-[55vh] overflow-y-auto py-1">
      {#if results.length === 0}
        <p class="px-3 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">No matches.</p>
      {:else}
        {#each results as item, i (item.key)}
          {#if i === 0 || results[i - 1].group !== item.group}
            <p class="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{item.group}</p>
          {/if}
          <button
            type="button"
            data-i={i}
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
            class:bg-blue-50={i === sel}
            class:dark:bg-blue-950={i === sel}
            onpointermove={() => (sel = i)}
            onclick={() => act(item.run)}
          >
            <span class="min-w-0 flex-1 truncate text-neutral-800 dark:text-neutral-200">{item.label}</span>
            {#if item.sub}<span class="shrink-0 truncate text-xs text-neutral-400 dark:text-neutral-500">{item.sub}</span>{/if}
            {#if item.hint}<kbd class="shrink-0 rounded border border-neutral-300/70 px-1.5 py-0.5 text-[10px] text-neutral-400 dark:border-neutral-700/70">{item.hint}</kbd>{/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>
