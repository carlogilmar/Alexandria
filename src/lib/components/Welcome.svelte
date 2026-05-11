<script lang="ts">
  import { app, todayIso } from "$lib/stores/app.svelte";
  import type { DayStats } from "$lib/ipc";

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

    // End of current week (next Sunday at 00:00). 53 weeks back from that.
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
      // Track month transitions on Sundays (start of each column).
      if (cursor.getDay() === 0 && cursor.getMonth() !== lastMonth) {
        lastMonth = cursor.getMonth();
        const col = Math.floor(i / 7);
        // Skip the very first column to avoid label crowding at the edge.
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
</script>

<main class="mx-auto flex w-full max-w-3xl flex-col px-8 pb-16 pt-12">
  <header class="mb-8">
    <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
      Welcome back
    </h1>
    <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
      A quick look at how things are going.
    </p>
  </header>

  <section class="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      </div>
    </div>

    <div class="overflow-x-auto">
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
            <div
              class="h-3 w-3 rounded-sm"
              class:bg-neutral-300={cell.state === "empty"}
              class:dark:bg-neutral-700={cell.state === "empty"}
              class:bg-transparent={cell.state === "future"}
              class:bg-rose-400={cell.state === "partial"}
              class:bg-emerald-500={cell.state === "done"}
              class:ring-2={cell.date === today}
              class:ring-blue-500={cell.date === today}
              class:dark:ring-blue-400={cell.date === today}
              title={cell.date === today
                ? `Today (${cell.date}) — ${cell.state === "done" ? "all done" : cell.state === "partial" ? `${cell.done}/${cell.total}` : "no todos yet"}`
                : cell.state === "future"
                  ? ""
                  : cell.state === "empty"
                    ? `${cell.date} — no list`
                    : `${cell.date} — ${cell.done}/${cell.total}`}
            ></div>
          {/each}
        </div>
      </div>
    </div>
  </section>
</main>
