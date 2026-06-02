<script lang="ts">
  import { onMount } from "svelte";
  import { app, todayIso } from "$lib/stores/app.svelte";
  import type {
    ArticleSummary,
    DayStats,
    ListSummary,
    NoteSummary,
    TodoHit,
  } from "$lib/ipc";
  import IdChip from "$lib/components/IdChip.svelte";

  type Bucket = "lists" | "tasks" | "workflows" | "notes" | "articles";
  let openBucket = $state<Bucket | null>(null);

  // First-run orientation. Shown until there's any content or the user dismisses
  // it (persisted). Helps a brand-new user understand what to do.
  let startDismissed = $state(
    typeof localStorage !== "undefined" &&
      localStorage.getItem("startHereDismissed") === "1",
  );
  let isEmpty = $derived(
    app.lists.length === 0 &&
      app.notes.length === 0 &&
      app.articles.length === 0 &&
      app.workflows.length === 0 &&
      app.flashcards.length === 0 &&
      app.feedbackBoards.length === 0,
  );
  let showStartHere = $derived(isEmpty && !startDismissed);
  function dismissStart() {
    startDismissed = true;
    if (typeof localStorage !== "undefined")
      localStorage.setItem("startHereDismissed", "1");
  }

  function toggleBucket(b: Bucket) {
    openBucket = openBucket === b ? null : b;
  }

  // Sorted views of each collection for the expanded panels.
  let sortedLists = $derived<ListSummary[]>(
    [...app.lists].sort((a, b) => (a.date < b.date ? 1 : -1)),
  );
  let sortedNotes = $derived<NoteSummary[]>(
    [...app.notes].sort((a, b) => (a.date < b.date ? 1 : -1)),
  );
  let sortedWorkflows = $derived(app.workflows);
  let sortedArticles = $derived<ArticleSummary[]>(app.articles);
  let sortedTasks = $derived<TodoHit[]>(app.allTodos);

  // Calendar grid spans PAST_WEEKS of history plus FUTURE_WEEKS of runway,
  // so you can plan lists for upcoming days. Future cells stay clickable but
  // never take the done/partial completion colors.
  const PAST_WEEKS = 53;
  const FUTURE_WEEKS = 4;
  const TOTAL_WEEKS = PAST_WEEKS + FUTURE_WEEKS;

  type Cell = {
    date: string;
    state: "future-empty" | "future-planned" | "empty" | "partial" | "done";
    total: number;
    done: number;
  };

  function isoDate(d: Date): string {
    return d.toLocaleDateString("en-CA");
  }

  function classifyForDate(today: Date, d: Date, s: DayStats | undefined): Cell {
    const iso = isoDate(d);
    const hasData = !!s && s.total > 0;
    if (d > today) {
      return {
        date: iso,
        state: hasData ? "future-planned" : "future-empty",
        total: s?.total ?? 0,
        done: s?.done ?? 0,
      };
    }
    if (!hasData) {
      return { date: iso, state: "empty", total: 0, done: 0 };
    }
    return {
      date: iso,
      state: s!.done === s!.total ? "done" : "partial",
      total: s!.total,
      done: s!.done,
    };
  }

  let grid = $derived.by<{ cells: Cell[]; months: { col: number; label: string }[] }>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endSunday = new Date(today);
    endSunday.setDate(today.getDate() + (7 - today.getDay()) + FUTURE_WEEKS * 7);
    const startSunday = new Date(endSunday);
    startSunday.setDate(endSunday.getDate() - TOTAL_WEEKS * 7);

    const byDate = new Map<string, DayStats>(
      app.dailyStats.map((s) => [s.date, s]),
    );

    const cells: Cell[] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;

    const cursor = new Date(startSunday);
    for (let i = 0; i < TOTAL_WEEKS * 7; i++) {
      const cell = classifyForDate(today, cursor, byDate.get(isoDate(cursor)));
      cells.push(cell);
      if (cursor.getDay() === 0 && cursor.getMonth() !== lastMonth) {
        lastMonth = cursor.getMonth();
        const col = Math.floor(i / 7);
        if (col >= 1) {
          months.push({
            col,
            label: cursor.toLocaleDateString(undefined, { month: "short" }),
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return { cells, months };
  });

  let today = todayIso();

  // ----- Grid scroll -----
  // The grid is wider than the welcome's content column, so on mount we scroll
  // the grid container all the way to the right — today is at column 52, so
  // this guarantees today is visible immediately when the page opens.
  let gridScroll: HTMLDivElement | undefined = $state();

  onMount(() => {
    requestAnimationFrame(() => {
      if (gridScroll) {
        gridScroll.scrollLeft = gridScroll.scrollWidth;
      }
    });
  });

  // ----- Day detail panel -----
  // Initialize from the store's focused-date (set when the logo is clicked).
  // After consuming it once, clear so subsequent home visits don't override
  // any manual selection the user makes here.
  let selectedDate = $state<string | null>(app.homeFocusedDate);
  $effect(() => {
    if (app.homeFocusedDate) {
      selectedDate = app.homeFocusedDate;
      app.homeFocusedDate = null;
    }
  });

  let selectedListsForDay = $derived<ListSummary[]>(
    selectedDate
      ? app.lists.filter((l) => l.date === selectedDate)
      : [],
  );

  let selectedNotesForDay = $derived<NoteSummary[]>(
    selectedDate
      ? app.notes.filter((n) => n.date === selectedDate)
      : [],
  );

  let selectedDateLabel = $derived(
    selectedDate
      ? new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "",
  );

  function pickCell(cell: Cell) {
    // Future days are selectable too — picking one opens the day panel so you
    // can plan a list/note for it.
    selectedDate = cell.date;
  }

  async function createForSelectedDay() {
    if (!selectedDate) return;
    await app.newList(undefined, selectedDate);
  }

  async function createNoteForSelectedDay() {
    if (!selectedDate) return;
    await app.newNote(selectedDate);
  }

  async function createForToday() {
    await app.newList(undefined, today);
  }
</script>

<main class="mx-auto flex w-full max-w-3xl flex-col px-8 pb-16 pt-12">
  <header class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Welcome back
      </h1>
      <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Today and how things are going over time.
      </p>
    </div>
    <button
      type="button"
      class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600"
      onclick={createForToday}
    >
      + New list for today
    </button>
  </header>

  {#if showStartHere}
    <section class="mb-8 rounded-2xl border border-blue-200/70 bg-blue-50/50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">Welcome to Alexandria 👋</h2>
          <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            A personal knowledge system. Everything lives on your device. Here's how to start:
          </p>
        </div>
        <button type="button" class="rounded-md p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700/40" aria-label="Dismiss" onclick={dismissStart}>
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <ul class="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-200">
        <li class="flex items-center gap-2"><kbd class="rounded border border-neutral-300/70 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-600/70">＋ Add</kbd> a note, article, workflow, or flashcard from the sidebar.</li>
        <li class="flex items-center gap-2"><kbd class="rounded border border-neutral-300/70 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-600/70">⌘K</kbd> search everything and jump to any section.</li>
        <li class="flex items-center gap-2"><kbd class="rounded border border-neutral-300/70 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-600/70">?</kbd> see all shortcuts and the formatting reference.</li>
      </ul>
      <p class="mt-3 text-xs text-neutral-500 dark:text-neutral-500">
        The icons top-right are your sections: <strong>Alexandria</strong> (canvas), <strong>Summary</strong>, <strong>Visualization</strong>, <strong>Feedback</strong>, <strong>Activity</strong>, <strong>Flash Deck</strong> — hover any for its name &amp; shortcut.
      </p>
    </section>
  {/if}

  <section class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
    {#each [
      { key: "lists", label: "Lists", value: app.lists.length },
      { key: "tasks", label: "Tasks", value: app.allTodos.length },
      { key: "workflows", label: "Workflows", value: app.workflows.length },
      { key: "notes", label: "Notes", value: app.notes.length },
      { key: "articles", label: "Articles", value: app.articles.length },
    ] as card (card.key)}
      <button
        type="button"
        onclick={() => toggleBucket(card.key as Bucket)}
        class="rounded-xl border p-4 text-left transition-colors"
        class:border-blue-400={openBucket === card.key}
        class:bg-blue-50={openBucket === card.key}
        class:dark:border-blue-500={openBucket === card.key}
        class:dark:bg-blue-950={openBucket === card.key}
        class:border-neutral-200={openBucket !== card.key}
        class:bg-white={openBucket !== card.key}
        class:dark:border-neutral-700={openBucket !== card.key}
        class:dark:bg-neutral-900={openBucket !== card.key}
      >
        <p
          class="text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
        >
          {card.label}
        </p>
        <p
          class="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100"
        >
          {card.value}
        </p>
      </button>
    {/each}
  </section>

  {#if openBucket}
    <section
      class="mb-8 rounded-xl border border-neutral-200/60 bg-white/60 p-4 dark:border-neutral-700/60 dark:bg-neutral-900/40"
    >
      <header class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {#if openBucket === "lists"}All lists
          {:else if openBucket === "tasks"}All tasks
          {:else if openBucket === "workflows"}All workflows
          {:else if openBucket === "notes"}All notes
          {:else if openBucket === "articles"}All articles
          {/if}
        </h3>
        <button
          type="button"
          class="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
          aria-label="Close"
          onclick={() => (openBucket = null)}
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

      <div class="max-h-96 overflow-y-auto">
        {#if openBucket === "lists"}
          {#if sortedLists.length === 0}
            <p class="text-sm text-neutral-400 dark:text-neutral-500">No lists yet.</p>
          {:else}
            <ul class="flex flex-col gap-1">
              {#each sortedLists as l (l.id)}
                <li class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onclick={() => app.select(l.id)}
                  >
                    <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                      {l.title}
                    </span>
                    <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                      {l.date} · {l.total > 0 ? `${l.done}/${l.total}` : "empty"}
                    </span>
                  </button>
                  <IdChip kind="list" id={l.id} />
                </li>
              {/each}
            </ul>
          {/if}
        {:else if openBucket === "tasks"}
          {#if sortedTasks.length === 0}
            <p class="text-sm text-neutral-400 dark:text-neutral-500">No tasks yet.</p>
          {:else}
            <ul class="flex flex-col gap-1">
              {#each sortedTasks as t (t.id)}
                <li class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onclick={() => app.goToHit(t)}
                  >
                    <span
                      class="truncate text-sm text-neutral-800 dark:text-neutral-200"
                      class:line-through={t.completed}
                      class:text-neutral-400={t.completed}
                    >
                      {t.text}
                    </span>
                    <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                      {t.listDate} · {t.listTitle}
                    </span>
                  </button>
                  <IdChip kind="todo" id={t.id} />
                </li>
              {/each}
            </ul>
          {/if}
        {:else if openBucket === "workflows"}
          {#if sortedWorkflows.length === 0}
            <p class="text-sm text-neutral-400 dark:text-neutral-500">No workflows yet.</p>
          {:else}
            <ul class="flex flex-col gap-1">
              {#each sortedWorkflows as w (w.id)}
                <li class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onclick={() => app.selectWorkflow(w.id)}
                  >
                    <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                      {w.title}
                    </span>
                    <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                      {w.stepCount}
                      {w.stepCount === 1 ? "step" : "steps"}
                    </span>
                  </button>
                  <IdChip kind="workflow" id={w.id} />
                </li>
              {/each}
            </ul>
          {/if}
        {:else if openBucket === "notes"}
          {#if sortedNotes.length === 0}
            <p class="text-sm text-neutral-400 dark:text-neutral-500">No notes yet.</p>
          {:else}
            <ul class="flex flex-col gap-1">
              {#each sortedNotes as n (n.id)}
                <li class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onclick={() => app.selectNote(n.id)}
                  >
                    <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                      {n.title}
                    </span>
                    <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                      {n.date}
                    </span>
                  </button>
                  <IdChip kind="note" id={n.id} />
                </li>
              {/each}
            </ul>
          {/if}
        {:else if openBucket === "articles"}
          {#if sortedArticles.length === 0}
            <p class="text-sm text-neutral-400 dark:text-neutral-500">No articles yet.</p>
          {:else}
            <ul class="flex flex-col gap-1">
              {#each sortedArticles as a (a.id)}
                <li class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onclick={() => app.selectArticle(a.id)}
                  >
                    <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                      {a.title}
                    </span>
                    {#if a.pinned}
                      <span class="ml-3 shrink-0 text-[11px] text-amber-500">pinned</span>
                    {/if}
                  </button>
                  <IdChip kind="article" id={a.id} />
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    </section>
  {/if}

  <section>
    <div class="mb-3 flex items-end justify-between">
      <h2 class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Last year
      </h2>
      <div
        class="flex items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500"
      >
        <span class="inline-flex items-center gap-1">
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-neutral-300 dark:bg-neutral-700"
          ></span> empty
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400"></span>
          partial
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500"
          ></span> all done
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-300 dark:bg-indigo-500/70"
          ></span> planned
        </span>
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-blue-500"
          ></span> today
        </span>
      </div>
    </div>

    <div bind:this={gridScroll} class="overflow-x-auto">
      <div class="inline-block">
        <div
          class="mb-1 grid h-3 text-[10px] text-neutral-400 dark:text-neutral-500"
          style="grid-template-columns: repeat({TOTAL_WEEKS}, 14px); column-gap: 2px;"
        >
          {#each Array(TOTAL_WEEKS) as _, col}
            {@const m = grid.months.find((mm) => mm.col === col)}
            <div class="flex items-end justify-start">
              {m ? m.label : ""}
            </div>
          {/each}
        </div>
        <div
          class="grid"
          style="grid-template-columns: repeat({TOTAL_WEEKS}, 14px); grid-template-rows: repeat(7, 14px); gap: 2px; grid-auto-flow: column;"
        >
          {#each grid.cells as cell (cell.date)}
            <button
              type="button"
              aria-label={`${cell.date} — ${cell.state}`}
              class="h-3 w-3 rounded-sm transition-transform hover:scale-125"
              class:bg-neutral-300={cell.state === "empty"}
              class:dark:bg-neutral-700={cell.state === "empty"}
              class:bg-transparent={cell.state === "future-empty"}
              class:ring-1={cell.state === "future-empty"}
              class:ring-inset={cell.state === "future-empty"}
              class:ring-neutral-300={cell.state === "future-empty"}
              class:dark:ring-neutral-600={cell.state === "future-empty"}
              class:bg-indigo-300={cell.state === "future-planned"}
              class:dark:bg-indigo-500={cell.state === "future-planned"}
              class:bg-rose-400={cell.state === "partial"}
              class:bg-emerald-500={cell.state === "done"}
              class:ring-2={cell.date === today}
              class:ring-blue-500={cell.date === today}
              class:dark:ring-blue-400={cell.date === today}
              class:outline-2={selectedDate === cell.date}
              class:outline={selectedDate === cell.date}
              class:outline-neutral-900={selectedDate === cell.date}
              class:dark:outline-neutral-100={selectedDate === cell.date}
              title={cell.date === today
                ? `Today (${cell.date}) — ${cell.state === "done" ? "all done" : cell.state === "partial" ? `${cell.done}/${cell.total}` : "no todos yet"}`
                : cell.state === "future-empty"
                  ? `${cell.date} — plan a list`
                  : cell.state === "future-planned"
                    ? `${cell.date} — planned (${cell.done}/${cell.total})`
                    : cell.state === "empty"
                      ? `${cell.date} — no list`
                      : `${cell.date} — ${cell.done}/${cell.total}`}
              onclick={() => pickCell(cell)}
            ></button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  {#if selectedDate}
    <section
      class="mt-8 rounded-xl border border-neutral-200/60 bg-white/60 p-5 dark:border-neutral-700/60 dark:bg-neutral-900/40"
    >
      <header class="mb-3 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {selectedDateLabel}
          </h3>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">{selectedDate}</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            onclick={createForSelectedDay}
          >
            + New list
          </button>
          <button
            type="button"
            class="rounded-md border border-neutral-300/60 bg-white/60 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onclick={createNoteForSelectedDay}
          >
            + New note
          </button>
          <button
            type="button"
            class="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
            aria-label="Close"
            onclick={() => (selectedDate = null)}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </header>

      {#if selectedListsForDay.length === 0 && selectedNotesForDay.length === 0}
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          Nothing on this day yet.
        </p>
      {:else}
        {#if selectedListsForDay.length > 0}
          <p
            class="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
          >
            Lists
          </p>
          <ul class="mb-3 flex flex-col gap-1">
            {#each selectedListsForDay as list (list.id)}
              <li class="flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <button
                  type="button"
                  class="flex flex-1 items-center justify-between rounded-md px-2 py-2 text-left"
                  onclick={() => app.select(list.id)}
                >
                  <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                    {list.title}
                  </span>
                  <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {#if list.total > 0}
                      {list.done}/{list.total}
                    {:else}
                      empty
                    {/if}
                  </span>
                </button>
                <IdChip kind="list" id={list.id} />
              </li>
            {/each}
          </ul>
        {/if}

        {#if selectedNotesForDay.length > 0}
          <p
            class="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
          >
            Notes
          </p>
          <ul class="flex flex-col gap-1">
            {#each selectedNotesForDay as note (note.id)}
              <li class="flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <button
                  type="button"
                  class="flex flex-1 items-center justify-between rounded-md px-2 py-2 text-left"
                  onclick={() => app.selectNote(note.id)}
                >
                  <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                    {note.title}
                  </span>
                  <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                    note
                  </span>
                </button>
                <IdChip kind="note" id={note.id} />
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </section>
  {/if}
</main>
