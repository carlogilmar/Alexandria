<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "$lib/stores/app.svelte";
  import type { WeeklyActivity } from "$lib/ipc";

  type Granularity = "year" | "halfyear" | "ytd";
  let granularity = $state<Granularity>("year");

  // Cell size for the SVG inside each grid cell. The OUTER layout is now a
  // CSS grid that auto-wraps to fit the container width — vertical scroll
  // only, no horizontal.
  const CELL = 110;
  const PAD = 14;

  // Hue palette mirroring the rest of the app.
  const HUE = { note: 217, article: 268, workflow: 32, list: 158 };

  function rangeFor(g: Granularity): { from: string; to: string } {
    const today = new Date();
    const fromDate = new Date(today);
    if (g === "year") fromDate.setDate(today.getDate() - 52 * 7);
    else if (g === "halfyear") fromDate.setDate(today.getDate() - 26 * 7);
    else {
      // Year-to-date: from Jan 1st of the current year.
      fromDate.setMonth(0, 1);
    }
    const toIso = today.toLocaleDateString("en-CA");
    const fromIso = fromDate.toLocaleDateString("en-CA");
    return { from: fromIso, to: toIso };
  }

  async function loadFor(g: Granularity) {
    const { from, to } = rangeFor(g);
    await app.refreshWeeklyActivity(from, to);
  }

  $effect(() => {
    void loadFor(granularity);
  });

  onMount(() => {
    void loadFor(granularity);
  });

  // Only show weeks with at least one item. The CSS grid below
  // auto-wraps to fit the container; we never need horizontal scroll.
  let visibleWeeks = $derived(
    app.weeklyActivity.filter(
      (w) => w.notes + w.articles + w.workflows + w.lists > 0,
    ),
  );

  // Stats for visual scaling — computed only over visible (non-empty) weeks.
  let totals = $derived(
    visibleWeeks.map((w) => w.notes + w.articles + w.workflows + w.lists),
  );
  let avgTotal = $derived(
    totals.length === 0 ? 0 : totals.reduce((a, b) => a + b, 0) / totals.length,
  );

  // Today snap (YYYY-MM-DD).
  let todayIso = $derived(new Date().toLocaleDateString("en-CA"));

  let hovered = $state<WeeklyActivity | null>(null);

  // Deterministic per-week jitter — same week always gets the same offsets.
  function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function jitter(weekStart: string, slot: number): { dx: number; dy: number } {
    const seed = hash(weekStart + ":" + slot);
    // Two pseudo-random numbers in [-1, 1].
    const ax = ((seed % 1000) / 1000) * 2 - 1;
    const ay = (((seed >> 10) % 1000) / 1000) * 2 - 1;
    return { dx: ax * 5, dy: ay * 5 };
  }

  // Each kind anchors to one quadrant of the cell.
  // 0 = note (TL), 1 = article (TR), 2 = workflow (BL), 3 = list (BR)
  function anchor(slot: number): { ax: number; ay: number } {
    const half = (CELL - PAD * 2) / 4;
    const q1 = PAD + half;
    const q2 = CELL - PAD - half;
    if (slot === 0) return { ax: q1, ay: q1 };
    if (slot === 1) return { ax: q2, ay: q1 };
    if (slot === 2) return { ax: q1, ay: q2 };
    return { ax: q2, ay: q2 };
  }

  // Per-figure radius from count: base + sqrt(count) * step, capped.
  function radius(count: number): number {
    const base = 3;
    const step = 4.5;
    const cap = (CELL - PAD * 2) / 2 - 4;
    const r = base + Math.sqrt(Math.max(count, 0)) * step;
    return Math.min(r, cap);
  }

  // Figure renderer paths (centered at 0,0).
  function pathFor(kind: "note" | "article" | "workflow" | "list", r: number): string {
    if (kind === "note") {
      // circle
      return `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    if (kind === "article") {
      // rounded square
      const k = r;
      const rad = r / 3;
      return `M ${-k + rad} ${-k}
              L ${k - rad} ${-k}
              Q ${k} ${-k} ${k} ${-k + rad}
              L ${k} ${k - rad}
              Q ${k} ${k} ${k - rad} ${k}
              L ${-k + rad} ${k}
              Q ${-k} ${k} ${-k} ${k - rad}
              L ${-k} ${-k + rad}
              Q ${-k} ${-k} ${-k + rad} ${-k} Z`;
    }
    if (kind === "workflow") {
      return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
    }
    // hexagon
    const sides = 6;
    let d = "";
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      d += (i === 0 ? "M " : "L ") + Math.cos(a) * r + " " + Math.sin(a) * r + " ";
    }
    return d + "Z";
  }

  function isAboveAverage(total: number): boolean {
    return total > avgTotal * 1.25;
  }

  // For empty kinds we still render a small ghost dot so the composition
  // never looks empty.
  const GHOST = 2;

  function totalOf(w: WeeklyActivity): number {
    return w.notes + w.articles + w.workflows + w.lists;
  }

  function fmtWeek(w: WeeklyActivity): string {
    const d = new Date(w.weekStart + "T00:00:00");
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    return (
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " – " +
      end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    );
  }
  function fmtWeekShort(weekStart: string): string {
    const d = new Date(weekStart + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ISO date math used by the "isToday" check below.
  function addDays(iso: string, days: number): string {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-CA");
  }
</script>

<main class="flex h-screen w-full flex-col bg-neutral-50 dark:bg-neutral-950">
  <header class="flex items-center justify-between border-b border-neutral-200/70 px-6 py-4 dark:border-neutral-700/70">
    <div>
      <h1 class="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Activity
      </h1>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        Each cell is one week. Four figures = notes · articles · workflows · lists.
      </p>
    </div>
    <div class="overflow-hidden rounded-md border border-neutral-300/70 bg-white/85 text-xs shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/80">
      {#each [
        { v: "year" as Granularity, label: "52 weeks" },
        { v: "halfyear" as Granularity, label: "6 months" },
        { v: "ytd" as Granularity, label: "YTD" },
      ] as g}
        <button
          type="button"
          class="px-2.5 py-1 transition-colors"
          class:bg-blue-600={granularity === g.v}
          class:text-white={granularity === g.v}
          class:hover:bg-blue-700={granularity === g.v}
          class:text-neutral-600={granularity !== g.v}
          class:hover:bg-neutral-100={granularity !== g.v}
          class:dark:text-neutral-300={granularity !== g.v}
          class:dark:hover:bg-neutral-800={granularity !== g.v}
          onclick={() => (granularity = g.v)}
        >
          {g.label}
        </button>
      {/each}
    </div>
  </header>

  <div class="flex-1 overflow-y-auto p-6">
    {#if app.activityLoading && visibleWeeks.length === 0}
      <p class="text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
    {:else if visibleWeeks.length === 0}
      <p class="text-sm text-neutral-400 dark:text-neutral-500">
        No activity in this range yet.
      </p>
    {:else}
      <!-- CSS grid wraps to fit container width — vertical scroll only. -->
      <div
        class="grid gap-3"
        style="grid-template-columns: repeat(auto-fill, minmax({CELL}px, 1fr));"
      >
        {#each visibleWeeks as w (w.weekStart)}
          {@const total = totalOf(w)}
          {@const accent = isAboveAverage(total)}
          {@const isToday = w.weekStart <= todayIso && todayIso < addDays(w.weekStart, 7)}
          {@const aNote = anchor(0)}
          {@const jNote = jitter(w.weekStart, 0)}
          {@const aArt = anchor(1)}
          {@const jArt = jitter(w.weekStart, 1)}
          {@const aWf = anchor(2)}
          {@const jWf = jitter(w.weekStart, 2)}
          {@const aLs = anchor(3)}
          {@const jLs = jitter(w.weekStart, 3)}
          <button
            type="button"
            class="group relative aspect-square w-full overflow-visible rounded-lg border bg-white/40 dark:bg-neutral-900/40"
            class:border-blue-500={isToday}
            class:border-neutral-200={!isToday}
            class:dark:border-neutral-700={!isToday}
            onpointerenter={() => (hovered = w)}
            onpointerleave={() => (hovered = null)}
            aria-label={`Week of ${w.weekStart}, ${total} items`}
          >
            <svg
              viewBox={`0 0 ${CELL} ${CELL}`}
              xmlns="http://www.w3.org/2000/svg"
              shape-rendering="geometricPrecision"
              class="block h-full w-full"
            >
              <!-- Accent diagonal for above-average weeks -->
              {#if accent}
                <line
                  x1={PAD + 6}
                  y1={CELL - PAD - 6}
                  x2={CELL - PAD - 6}
                  y2={PAD + 6}
                  stroke="rgba(127,127,127,0.22)"
                  stroke-width="1"
                />
              {/if}

              <!-- Note (TL) -->
              {#if w.notes > 0}
                <path
                  d={pathFor("note", radius(w.notes))}
                  transform={`translate(${aNote.ax + jNote.dx},${aNote.ay + jNote.dy})`}
                  fill={`hsl(${HUE.note} 78% 55%)`}
                  opacity="0.9"
                />
              {:else}
                <circle cx={aNote.ax} cy={aNote.ay} r={GHOST} fill="none" stroke={`hsl(${HUE.note} 30% 60%)`} stroke-width="1"/>
              {/if}

              <!-- Article (TR) -->
              {#if w.articles > 0}
                <path
                  d={pathFor("article", radius(w.articles))}
                  transform={`translate(${aArt.ax + jArt.dx},${aArt.ay + jArt.dy})`}
                  fill={`hsl(${HUE.article} 78% 55%)`}
                  opacity="0.9"
                />
              {:else}
                <circle cx={aArt.ax} cy={aArt.ay} r={GHOST} fill="none" stroke={`hsl(${HUE.article} 30% 60%)`} stroke-width="1"/>
              {/if}

              <!-- Workflow (BL) -->
              {#if w.workflows > 0}
                <path
                  d={pathFor("workflow", radius(w.workflows))}
                  transform={`translate(${aWf.ax + jWf.dx},${aWf.ay + jWf.dy})`}
                  fill={`hsl(${HUE.workflow} 78% 55%)`}
                  opacity="0.9"
                />
              {:else}
                <circle cx={aWf.ax} cy={aWf.ay} r={GHOST} fill="none" stroke={`hsl(${HUE.workflow} 30% 60%)`} stroke-width="1"/>
              {/if}

              <!-- List (BR) -->
              {#if w.lists > 0}
                <path
                  d={pathFor("list", radius(w.lists))}
                  transform={`translate(${aLs.ax + jLs.dx},${aLs.ay + jLs.dy})`}
                  fill={`hsl(${HUE.list} 78% 55%)`}
                  opacity="0.9"
                />
              {:else}
                <circle cx={aLs.ax} cy={aLs.ay} r={GHOST} fill="none" stroke={`hsl(${HUE.list} 30% 60%)`} stroke-width="1"/>
              {/if}
            </svg>
            <!-- Week label underneath the composition -->
            <span class="absolute inset-x-0 bottom-1 select-none text-center text-[10px] text-neutral-400 dark:text-neutral-500">
              {fmtWeekShort(w.weekStart)}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Hover detail strip -->
  <footer class="border-t border-neutral-200/70 px-6 py-3 dark:border-neutral-700/70">
    {#if hovered}
      {@const total = totalOf(hovered)}
      <div class="flex items-center gap-3 text-sm">
        <span class="font-semibold text-neutral-900 dark:text-neutral-100">
          {fmtWeek(hovered)}
        </span>
        <span class="text-neutral-500 dark:text-neutral-400">·</span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-2.5 rounded-full" style="background: hsl({HUE.note} 78% 55%);"></span>
          {hovered.notes} notes
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-2.5 rounded-sm" style="background: hsl({HUE.article} 78% 55%);"></span>
          {hovered.articles} articles
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-2.5 rotate-45" style="background: hsl({HUE.workflow} 78% 55%);"></span>
          {hovered.workflows} workflows
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-2.5" style="background: hsl({HUE.list} 78% 55%); clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);"></span>
          {hovered.lists} lists
        </span>
        <span class="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          Total: <strong class="text-neutral-700 dark:text-neutral-200">{total}</strong>
        </span>
      </div>
    {:else}
      <p class="text-xs italic text-neutral-400 dark:text-neutral-500">
        Hover any cell to see its breakdown.
      </p>
    {/if}
  </footer>
</main>

