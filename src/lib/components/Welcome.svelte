<script lang="ts">
  import { onMount } from "svelte";
  import { app, todayIso } from "$lib/stores/app.svelte";
  import type { DayStats, ListSummary, NoteSummary, Todo } from "$lib/ipc";
  import IdChip from "$lib/components/IdChip.svelte";
  import { reveal } from "$lib/anim";

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

  // ----- Greeting -----
  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 18
        ? "Good afternoon"
        : "Good evening";
  const longDate = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // ----- Today card -----
  let todoTotal = $derived(app.homeTodos.length);
  let todoDone = $derived(app.homeTodos.filter((t) => t.completed).length);
  let progressPct = $derived(todoTotal ? Math.round((todoDone / todoTotal) * 100) : 0);
  let newTaskText = $state("");

  async function addTask() {
    const t = newTaskText.trim();
    if (!t) return;
    newTaskText = "";
    await app.addHomeTodo(t);
  }
  function onTaskKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void addTask();
    }
  }
  async function headerAction() {
    if (app.homeListId === null) await app.createHomeToday();
    else app.select(app.homeListId);
  }

  // ----- Jump back in (recent entities across kinds) -----
  type RKind = "note" | "article" | "blueprint" | "board" | "storyboard";
  type Recent = { kind: RKind; id: number; title: string; ts: string };
  const toTs = (raw: string) => (raw.length <= 10 ? raw + "T00:00:00" : raw.replace(" ", "T"));
  let recent = $derived.by<Recent[]>(() => {
    const items: Recent[] = [
      ...app.notes.filter((n) => !n.archived).map((n) => ({ kind: "note" as const, id: n.id, title: n.title, ts: toTs(n.date) })),
      ...app.articles.filter((a) => !a.archived).map((a) => ({ kind: "article" as const, id: a.id, title: a.title, ts: toTs(a.updatedAt) })),
      ...app.blueprints.filter((b) => !b.archived).map((b) => ({ kind: "blueprint" as const, id: b.id, title: b.title, ts: toTs(b.updatedAt) })),
      ...app.storyboards.filter((s) => !s.archived).map((s) => ({ kind: "storyboard" as const, id: s.id, title: s.title, ts: toTs(s.updatedAt) })),
      ...app.feedbackBoards.filter((b) => !b.archived).map((b) => ({ kind: "board" as const, id: b.id, title: b.title, ts: toTs(b.updatedAt) })),
    ];
    return items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)).slice(0, 6);
  });
  function openRecent(r: Recent) {
    if (r.kind === "note") app.selectNote(r.id);
    else if (r.kind === "article") app.selectArticle(r.id);
    else if (r.kind === "blueprint") app.openBlueprint(r.id);
    else if (r.kind === "storyboard") app.openStoryboard(r.id);
    else app.openFeedbackBoard(r.id);
  }
  const HUE: Record<RKind, number> = { note: 217, article: 268, blueprint: 200, board: 350, storyboard: 158 };
  const RICON: Record<RKind, string> = {
    note: '<path d="M5 3h7l3 3v11H5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h5M8 11h5M8 14h3" stroke="currentColor" stroke-width="1.5"/>',
    article: '<rect x="3.5" y="4" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 8h8M6 11h8M6 14h5" stroke="currentColor" stroke-width="1.5"/>',
    blueprint: '<rect x="3" y="3" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="12" y="12" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5h4v6.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    board: '<rect x="3" y="3" width="4" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="3" width="4" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="3.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    storyboard: '<rect x="3" y="5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 5v10M13 5v10" stroke="currentColor" stroke-width="1.5"/>',
  };
  const RLABEL: Record<RKind, string> = { note: "Note", article: "Article", blueprint: "Blueprint", board: "Board", storyboard: "Storyboard" };
  function fmtAgo(ts: string): string {
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  // ----- Contribution calendar (kept from the previous Home) -----
  const PAST_WEEKS = 53;
  const FUTURE_WEEKS = 4;
  const TOTAL_WEEKS = PAST_WEEKS + FUTURE_WEEKS;

  type Cell = {
    date: string;
    state: "future-empty" | "future-planned" | "past";
    total: number;
    done: number;
    activity: number;
    level: number;
  };

  function isoDate(d: Date): string {
    return d.toLocaleDateString("en-CA");
  }
  function levelFor(count: number): number {
    if (count <= 0) return 0;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 6) return 3;
    return 4;
  }
  function classifyForDate(today: Date, d: Date, s: DayStats | undefined, activity: number): Cell {
    const iso = isoDate(d);
    if (d > today) {
      const hasList = !!s && s.total > 0;
      return { date: iso, state: hasList ? "future-planned" : "future-empty", total: s?.total ?? 0, done: s?.done ?? 0, activity: 0, level: 0 };
    }
    return { date: iso, state: "past", total: s?.total ?? 0, done: s?.done ?? 0, activity, level: levelFor(activity) };
  }

  let grid = $derived.by<{ cells: Cell[]; months: { col: number; label: string }[] }>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endSunday = new Date(today);
    endSunday.setDate(today.getDate() + (7 - today.getDay()) + FUTURE_WEEKS * 7);
    const startSunday = new Date(endSunday);
    startSunday.setDate(endSunday.getDate() - TOTAL_WEEKS * 7);

    const byDate = new Map<string, DayStats>(app.dailyStats.map((s) => [s.date, s]));
    const byActivity = new Map<string, number>(app.activityStats.map((a) => [a.date, a.count]));

    const cells: Cell[] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    const cursor = new Date(startSunday);
    for (let i = 0; i < TOTAL_WEEKS * 7; i++) {
      const iso = isoDate(cursor);
      cells.push(classifyForDate(today, cursor, byDate.get(iso), byActivity.get(iso) ?? 0));
      if (cursor.getDay() === 0 && cursor.getMonth() !== lastMonth) {
        lastMonth = cursor.getMonth();
        const col = Math.floor(i / 7);
        if (col >= 1) months.push({ col, label: cursor.toLocaleDateString(undefined, { month: "short" }) });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return { cells, months };
  });

  let totalContrib = $derived(app.activityStats.reduce((s, a) => s + a.count, 0));
  let today = todayIso();
  let gridScroll: HTMLDivElement | undefined = $state();

  onMount(() => {
    void app.loadHomeToday();
    requestAnimationFrame(() => {
      if (gridScroll) gridScroll.scrollLeft = gridScroll.scrollWidth;
    });
  });

  // `app.lists` may load AFTER this mounts (init is async), or change while
  // we're away — reload today's todos whenever the resolved today-list id
  // differs from what we have. Guarded so it never loops.
  $effect(() => {
    const t = todayIso();
    const cand = app.lists.filter((l) => l.date === t && !l.archived);
    const id = cand.length ? cand.reduce((a, b) => (b.id < a.id ? b : a)).id : null;
    if (id !== app.homeListId) void app.loadHomeToday();
  });

  // ----- Day detail panel (kept) -----
  let selectedDate = $state<string | null>(app.homeFocusedDate);
  $effect(() => {
    if (app.homeFocusedDate) {
      selectedDate = app.homeFocusedDate;
      app.homeFocusedDate = null;
    }
  });
  let selectedListsForDay = $derived<ListSummary[]>(
    selectedDate ? app.lists.filter((l) => l.date === selectedDate) : [],
  );
  let selectedNotesForDay = $derived<NoteSummary[]>(
    selectedDate ? app.notes.filter((n) => n.date === selectedDate) : [],
  );
  let selectedDateLabel = $derived(
    selectedDate
      ? new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : "",
  );
  function pickCell(cell: Cell) {
    selectedDate = cell.date;
  }
  function cellLabel(cell: Cell): string {
    if (cell.state === "future-empty") return "Plan a list";
    if (cell.state === "future-planned") return "Planned";
    return `${cell.activity} ${cell.activity === 1 ? "contribution" : "contributions"}`;
  }
  let tip = $state<{ x: number; y: number; text: string } | null>(null);
  function showTip(e: Event, cell: Cell) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tip = { x: r.left + r.width / 2, y: r.top - 6, text: cellLabel(cell) };
  }
  async function createForSelectedDay() {
    if (!selectedDate) return;
    await app.newList(undefined, selectedDate);
  }
  async function createNoteForSelectedDay() {
    if (!selectedDate) return;
    await app.newNote(selectedDate);
  }
</script>

<main class="mx-auto flex w-full max-w-3xl flex-col px-8 pb-16 pt-12">
  <header class="mb-7 flex items-end justify-between" use:reveal={{ delay: 40 }}>
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">{greeting}</h1>
      <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{longDate}</p>
    </div>
    <button
      type="button"
      class="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600"
      onclick={headerAction}
    >
      {app.homeListId === null ? "＋ New list" : "Open today's list"}
    </button>
  </header>

  {#if showStartHere}
    <section class="mb-8 rounded-2xl border border-blue-200/70 bg-blue-50/50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20" use:reveal={{ delay: 80 }}>
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">Welcome to Alexandria 👋</h2>
          <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">A personal knowledge system. Everything lives on your device. Here's how to start:</p>
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
    </section>
  {/if}

  <!-- TODAY -->
  <section class="mb-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900" use:reveal={{ delay: 120 }}>
    {#if app.homeListId === null}
      <div class="flex flex-col items-center gap-3 py-6 text-center">
        <p class="text-sm text-neutral-500 dark:text-neutral-400">No list for today yet. Start one to plan your day.</p>
        <button type="button" class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600" onclick={() => app.createHomeToday()}>＋ Create today's list</button>
        {#if app.backlogPending > 0}
          <button type="button" class="text-xs text-neutral-400 hover:text-blue-500 dark:text-neutral-500" onclick={() => app.openBacklog()}>
            You have <span class="font-semibold text-blue-500">{app.backlogPending}</span> {app.backlogPending === 1 ? "task" : "tasks"} in your backlog →
          </button>
        {/if}
      </div>
    {:else}
      <div class="mb-3 flex items-center gap-3">
        <h2 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">Today</h2>
        {#if app.backlogPending > 0}
          <button type="button" class="ml-auto inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:border-blue-400 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-100" onclick={() => app.openBacklog()} title="Open backlog">
            Backlog <span class="font-semibold text-blue-500">{app.backlogPending}</span> →
          </button>
        {/if}
        <span class="text-xs tabular-nums text-neutral-400 dark:text-neutral-500" class:ml-auto={app.backlogPending === 0}>{todoDone}/{todoTotal} done</span>
      </div>
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div class="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out dark:bg-emerald-400" style="width: {progressPct}%"></div>
      </div>
      <div class="flex flex-col">
        {#each app.homeTodos as todo (todo.id)}
          <button type="button" class="flex items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40" onclick={() => app.toggleHomeTodo(todo)}>
            <span
              class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border text-white"
              class:border-neutral-300={!todo.completed}
              class:dark:border-neutral-600={!todo.completed}
              class:border-emerald-500={todo.completed}
              class:bg-emerald-500={todo.completed}
              class:dark:border-emerald-400={todo.completed}
              class:dark:bg-emerald-400={todo.completed}
            >
              {#if todo.completed}
                <svg viewBox="0 0 20 20" fill="currentColor" class="hcheck h-3 w-3"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L4.3 10.7a1 1 0 011.4-1.4l2.8 2.79 6.8-6.79a1 1 0 011.4 0z" clip-rule="evenodd"/></svg>
              {/if}
            </span>
            <span class="text-sm" class:text-neutral-800={!todo.completed} class:dark:text-neutral-200={!todo.completed} class:text-neutral-400={todo.completed} class:line-through={todo.completed} class:dark:text-neutral-500={todo.completed}>{todo.text}</span>
          </button>
        {/each}
        <div class="flex items-center gap-3 px-1 pb-0.5 pt-1.5">
          <span class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">+</span>
          <input bind:value={newTaskText} onkeydown={onTaskKey} placeholder="Add a task…" class="flex-1 border-none bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-200" />
        </div>
      </div>
    {/if}
  </section>

  <!-- JUMP BACK IN -->
  {#if recent.length > 0}
    <section class="mb-9">
      <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500" use:reveal={{ delay: 200 }}>Jump back in</p>
      <div class="grid gap-2.5" style="grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));">
        {#each recent as r, i (r.kind + r.id)}
          <button
            type="button"
            class="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900"
            onclick={() => openRecent(r)}
            use:reveal={{ delay: 240 + i * 45, y: 8 }}
          >
            <span class="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg" style="background: hsl({HUE[r.kind]} 70% 55% / .14); color: hsl({HUE[r.kind]} 62% 48%)">
              <svg viewBox="0 0 20 20" class="h-4 w-4">{@html RICON[r.kind]}</svg>
            </span>
            <span class="min-w-0">
              <span class="block truncate text-[13.5px] font-semibold text-neutral-800 dark:text-neutral-100">{r.title || "Untitled"}</span>
              <span class="block text-[11px] text-neutral-400 dark:text-neutral-500">{RLABEL[r.kind]} · {fmtAgo(r.ts)}</span>
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ACTIVITY -->
  <section use:reveal={{ delay: 360 }}>
    <div class="mb-3 flex items-end justify-between">
      <div class="flex items-baseline gap-2.5">
        <h2 class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Activity</h2>
        <span class="text-xs text-neutral-400 dark:text-neutral-500"><b class="font-semibold text-neutral-700 dark:text-neutral-200">{totalContrib.toLocaleString()}</b> contributions in the last year</span>
      </div>
      <div class="flex items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500">
        <span class="inline-flex items-center gap-1">
          Less
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-neutral-200 dark:bg-neutral-800"></span>
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-900"></span>
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300 dark:bg-emerald-700"></span>
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-600"></span>
          <span class="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400"></span>
          More
        </span>
        <span class="inline-flex items-center gap-1"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-300 dark:bg-indigo-500/70"></span> planned</span>
        <span class="inline-flex items-center gap-1"><span class="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-blue-500"></span> today</span>
      </div>
    </div>

    <div bind:this={gridScroll} class="overflow-x-auto rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div class="inline-block">
        <div class="mb-1 grid h-3 text-[10px] text-neutral-400 dark:text-neutral-500" style="grid-template-columns: repeat({TOTAL_WEEKS}, 14px); column-gap: 2px;">
          {#each Array(TOTAL_WEEKS) as _, col}
            {@const m = grid.months.find((mm) => mm.col === col)}
            <div class="flex items-end justify-start">{m ? m.label : ""}</div>
          {/each}
        </div>
        <div class="grid" style="grid-template-columns: repeat({TOTAL_WEEKS}, 14px); grid-template-rows: repeat(7, 14px); gap: 2px; grid-auto-flow: column;">
          {#each grid.cells as cell (cell.date)}
            <button
              type="button"
              aria-label={cellLabel(cell)}
              class="h-3 w-3 rounded-sm transition-transform hover:scale-125"
              class:bg-transparent={cell.state === "future-empty"}
              class:ring-1={cell.state === "future-empty"}
              class:ring-inset={cell.state === "future-empty"}
              class:ring-neutral-300={cell.state === "future-empty"}
              class:dark:ring-neutral-600={cell.state === "future-empty"}
              class:bg-indigo-300={cell.state === "future-planned"}
              class:dark:bg-indigo-500={cell.state === "future-planned"}
              class:bg-neutral-200={cell.state === "past" && cell.level === 0}
              class:dark:bg-neutral-800={cell.state === "past" && cell.level === 0}
              class:bg-emerald-200={cell.state === "past" && cell.level === 1}
              class:dark:bg-emerald-900={cell.state === "past" && cell.level === 1}
              class:bg-emerald-300={cell.state === "past" && cell.level === 2}
              class:dark:bg-emerald-700={cell.state === "past" && cell.level === 2}
              class:bg-emerald-500={cell.state === "past" && cell.level === 3}
              class:dark:bg-emerald-600={cell.state === "past" && cell.level === 3}
              class:bg-emerald-600={cell.state === "past" && cell.level === 4}
              class:dark:bg-emerald-400={cell.state === "past" && cell.level === 4}
              class:ring-2={cell.date === today}
              class:ring-blue-500={cell.date === today}
              class:dark:ring-blue-400={cell.date === today}
              class:outline-2={selectedDate === cell.date}
              class:outline={selectedDate === cell.date}
              class:outline-neutral-900={selectedDate === cell.date}
              class:dark:outline-neutral-100={selectedDate === cell.date}
              onmouseenter={(e) => showTip(e, cell)}
              onmouseleave={() => (tip = null)}
              onfocus={(e) => showTip(e, cell)}
              onblur={() => (tip = null)}
              onclick={() => pickCell(cell)}
            ></button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  {#if tip}
    <div class="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900" style="left: {tip.x}px; top: {tip.y}px;">
      {tip.text}
    </div>
  {/if}

  {#if selectedDate}
    <section class="mt-8 rounded-xl border border-neutral-200/60 bg-white/60 p-5 dark:border-neutral-700/60 dark:bg-neutral-900/40">
      <header class="mb-3 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">{selectedDateLabel}</h3>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">{selectedDate}</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600" onclick={createForSelectedDay}>+ New list</button>
          <button type="button" class="rounded-md border border-neutral-300/60 bg-white/60 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-800" onclick={createNoteForSelectedDay}>+ New note</button>
          <button type="button" class="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200" aria-label="Close" onclick={() => (selectedDate = null)}>
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          </button>
        </div>
      </header>

      {#if selectedListsForDay.length === 0 && selectedNotesForDay.length === 0}
        <p class="text-sm text-neutral-400 dark:text-neutral-500">Nothing on this day yet.</p>
      {:else}
        {#if selectedListsForDay.length > 0}
          <p class="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Lists</p>
          <ul class="mb-3 flex flex-col gap-1">
            {#each selectedListsForDay as list (list.id)}
              <li class="flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <button type="button" class="flex flex-1 items-center justify-between rounded-md px-2 py-2 text-left" onclick={() => app.select(list.id)}>
                  <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">{list.title}</span>
                  <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{#if list.total > 0}{list.done}/{list.total}{:else}empty{/if}</span>
                </button>
                <IdChip kind="list" id={list.id} />
              </li>
            {/each}
          </ul>
        {/if}

        {#if selectedNotesForDay.length > 0}
          <p class="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Notes</p>
          <ul class="flex flex-col gap-1">
            {#each selectedNotesForDay as note (note.id)}
              <li class="flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <button type="button" class="flex flex-1 items-center justify-between rounded-md px-2 py-2 text-left" onclick={() => app.selectNote(note.id)}>
                  <span class="truncate text-sm text-neutral-800 dark:text-neutral-200">{note.title}</span>
                  <span class="ml-3 shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">note</span>
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

<style>
  /* The checkmark pops when a task is completed (each insert replays it). */
  .hcheck { animation: hcheck-pop 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
  @keyframes hcheck-pop {
    0% { transform: scale(0.4); }
    60% { transform: scale(1.25); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .hcheck { animation: none; }
  }
</style>
