<script lang="ts">
  import { onMount } from "svelte";
  import { app, todayIso } from "$lib/stores/app.svelte";
  import type { DayStats, ListSummary } from "$lib/ipc";

  type Cell = {
    date: string;
    state: "future" | "empty" | "partial" | "done";
    total: number;
    done: number;
  };

  function isoDate(d: Date): string {
    return d.toLocaleDateString("en-CA");
  }

  function classifyForDate(today: Date, d: Date, s: DayStats | undefined): Cell {
    const iso = isoDate(d);
    if (d > today) {
      return { date: iso, state: "future", total: 0, done: 0 };
    }
    if (!s || s.total === 0) {
      return { date: iso, state: "empty", total: 0, done: 0 };
    }
    return {
      date: iso,
      state: s.done === s.total ? "done" : "partial",
      total: s.total,
      done: s.done,
    };
  }

  let grid = $derived.by<{ cells: Cell[]; months: { col: number; label: string }[] }>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endSunday = new Date(today);
    endSunday.setDate(today.getDate() + (7 - today.getDay()));
    const startSunday = new Date(endSunday);
    startSunday.setDate(endSunday.getDate() - 53 * 7);

    const byDate = new Map<string, DayStats>(
      app.dailyStats.map((s) => [s.date, s]),
    );

    const cells: Cell[] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;

    const cursor = new Date(startSunday);
    for (let i = 0; i < 53 * 7; i++) {
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

  let activeDays = $derived(
    app.dailyStats.filter((s) => s.total > 0).length,
  );
  let perfectDays = $derived(
    app.dailyStats.filter((s) => s.total > 0 && s.done === s.total).length,
  );

  let today = todayIso();
  let todaySummary = $derived(
    app.dailyStats.find((s) => s.date === today) ?? { total: 0, done: 0 },
  );

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
  let selectedDate = $state<string | null>(null);

  let selectedListsForDay = $derived<ListSummary[]>(
    selectedDate
      ? app.lists.filter((l) => l.date === selectedDate)
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
    if (cell.state === "future") return;
    selectedDate = cell.date;
  }

  async function createForSelectedDay() {
    if (!selectedDate) return;
    await app.newList("New list", selectedDate);
  }

  async function createForToday() {
    await app.newList("New list", today);
  }
</script>

<main class="mx-auto flex w-full max-w-3xl flex-col px-8 pb-16 pt-12">
  <header class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Welcome back
      </h1>
      <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        A quick look at how things are going.
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

  <section class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
    <div
      class="rounded-xl border border-neutral-200/60 bg-white/60 p-4 dark:border-neutral-700/60 dark:bg-neutral-900/40"
    >
      <p class="text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Today
      </p>
      <p class="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {todaySummary.done}<span class="text-neutral-400 dark:text-neutral-500"
          >/{todaySummary.total}</span
        >
      </p>
    </div>
    <div
      class="rounded-xl border border-neutral-200/60 bg-white/60 p-4 dark:border-neutral-700/60 dark:bg-neutral-900/40"
    >
      <p class="text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Streak
      </p>
      <p class="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {app.stats.streak}
        <span class="text-sm font-normal text-neutral-400 dark:text-neutral-500">
          {app.stats.streak === 1 ? "day" : "days"}
        </span>
      </p>
    </div>
    <div
      class="rounded-xl border border-neutral-200/60 bg-white/60 p-4 dark:border-neutral-700/60 dark:bg-neutral-900/40"
    >
      <p class="text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Total todos
      </p>
      <p class="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {app.stats.totalTodos}
      </p>
    </div>
    <div
      class="rounded-xl border border-neutral-200/60 bg-white/60 p-4 dark:border-neutral-700/60 dark:bg-neutral-900/40"
    >
      <p class="text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Perfect days
      </p>
      <p class="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {perfectDays}
        <span class="text-sm font-normal text-neutral-400 dark:text-neutral-500">
          / {activeDays}
        </span>
      </p>
    </div>
  </section>

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
          style="grid-template-columns: repeat(53, 14px); column-gap: 2px;"
        >
          {#each Array(53) as _, col}
            {@const m = grid.months.find((mm) => mm.col === col)}
            <div class="flex items-end justify-start">
              {m ? m.label : ""}
            </div>
          {/each}
        </div>
        <div
          class="grid"
          style="grid-template-columns: repeat(53, 14px); grid-template-rows: repeat(7, 14px); gap: 2px; grid-auto-flow: column;"
        >
          {#each grid.cells as cell (cell.date)}
            <button
              type="button"
              aria-label={`${cell.date} — ${cell.state}`}
              disabled={cell.state === "future"}
              class="h-3 w-3 rounded-sm transition-transform hover:scale-125 disabled:hover:scale-100"
              class:bg-neutral-300={cell.state === "empty"}
              class:dark:bg-neutral-700={cell.state === "empty"}
              class:bg-transparent={cell.state === "future"}
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
                : cell.state === "future"
                  ? ""
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

      {#if selectedListsForDay.length === 0}
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          No lists on this day yet.
        </p>
      {:else}
        <ul class="flex flex-col gap-1">
          {#each selectedListsForDay as list (list.id)}
            <li>
              <button
                type="button"
                class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>
