<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { checkinSrc, type WeeklyActivity } from "$lib/ipc";
  import CheckinLightbox from "$lib/components/CheckinLightbox.svelte";

  let lightboxIndex = $state<number | null>(null);

  type Granularity = "year" | "halfyear" | "ytd";
  let granularity = $state<Granularity>("year");

  // Two tabs: the Kandinsky activity grid, and the camera check-in gallery.
  type Tab = "activity" | "checkins";
  let tab = $state<Tab>("activity");
  $effect(() => {
    if (tab === "checkins") void app.refreshCheckins();
  });

  function fmtCheckin(iso: string): string {
    // Backend stores UTC "YYYY-MM-DD HH:MM:SS"; render in local locale.
    const d = new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Cell size for the SVG inside each grid cell. The OUTER layout is now a
  // CSS grid that auto-wraps to fit the container width — vertical scroll
  // only, no horizontal.
  const CELL = 110;
  const PAD = 14;

  // Hue palette mirroring the rest of the app.
  const HUE = { note: 217, article: 268, list: 158 };

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
      (w) => w.notes + w.articles + w.lists > 0,
    ),
  );

  // Stats for visual scaling — computed only over visible (non-empty) weeks.
  let totals = $derived(
    visibleWeeks.map((w) => w.notes + w.articles + w.lists),
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
  // 0 = note (TL), 1 = article (TR), 3 = list (BR)
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
  function pathFor(kind: "note" | "article" | "list", r: number): string {
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
    return w.notes + w.articles + w.lists;
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

<main class="flex h-full w-full flex-col bg-neutral-50 dark:bg-neutral-950">
  <header class="flex items-center justify-between border-b border-neutral-200/70 px-6 py-4 dark:border-neutral-700/70">
    <div>
      <h1 class="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Activity
      </h1>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {tab === "activity"
          ? "Each cell is one week. Three figures = notes · articles · lists."
          : "Camera check-ins captured when you create a today's list."}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <!-- Tab switch -->
      <div class="overflow-hidden rounded-md border border-neutral-300/70 bg-white/85 text-xs shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/80">
        {#each [
          { v: "activity" as Tab, label: "Grid" },
          { v: "checkins" as Tab, label: "Check-ins" },
        ] as t}
          <button
            type="button"
            class="px-2.5 py-1 transition-colors"
            class:bg-blue-600={tab === t.v}
            class:text-white={tab === t.v}
            class:text-neutral-600={tab !== t.v}
            class:hover:bg-neutral-100={tab !== t.v}
            class:dark:text-neutral-300={tab !== t.v}
            class:dark:hover:bg-neutral-800={tab !== t.v}
            onclick={() => (tab = t.v)}
          >
            {t.label}
          </button>
        {/each}
      </div>
      {#if tab === "activity"}
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
      {/if}
    </div>
  </header>

  {#if tab === "checkins"}
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Opt-in toggle + privacy note -->
      <div class="mb-6 flex items-start justify-between gap-4 rounded-xl border border-neutral-200/70 bg-white/60 p-4 dark:border-neutral-700/60 dark:bg-neutral-900/40">
        <div class="min-w-0">
          <p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">Camera check-ins</p>
          <p class="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            When on, creating a today's list snaps a ~1s webcam GIF. Uses your camera, stays on your Mac, never uploaded. Turn it off anytime.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={theme.checkinsEnabled}
          aria-label="Toggle camera check-ins"
          class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
          class:bg-blue-600={theme.checkinsEnabled}
          class:bg-neutral-300={!theme.checkinsEnabled}
          class:dark:bg-neutral-700={!theme.checkinsEnabled}
          onclick={() => theme.setCheckinsEnabled(!theme.checkinsEnabled)}
        >
          <span
            class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
            class:translate-x-5={theme.checkinsEnabled}
          ></span>
        </button>
      </div>

      {#if app.checkins.length === 0}
        <p class="mt-10 text-center text-sm text-neutral-400 dark:text-neutral-500">
          {theme.checkinsEnabled
            ? "No check-ins yet — create a today's list to snap your first one."
            : "No check-ins yet. Enable the toggle above to start."}
        </p>
      {:else}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {#each app.checkins as c, i (c.id)}
            <figure class="group relative overflow-hidden rounded-xl border border-neutral-200/70 bg-black/5 dark:border-neutral-700/60 dark:bg-white/5">
              <button
                type="button"
                title="Delete check-in"
                aria-label="Delete check-in"
                class="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/50 p-1 text-white/90 opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                onclick={() => app.deleteCheckin(c.id)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
              </button>
              <button
                type="button"
                class="block w-full cursor-zoom-in"
                aria-label="View check-in {fmtCheckin(c.createdAt)}"
                onclick={() => (lightboxIndex = i)}
              >
                <img src={checkinSrc(c.path)} alt="Check-in {fmtCheckin(c.createdAt)}" class="aspect-[4/3] w-full object-cover" />
              </button>
              <figcaption class="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                {fmtCheckin(c.createdAt)}
              </figcaption>
            </figure>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
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
  {/if}

  <!-- Hover detail strip (activity grid only) -->
  {#if tab === "activity"}
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
  {/if}
</main>

{#if lightboxIndex !== null}
  <CheckinLightbox
    checkins={app.checkins}
    startIndex={lightboxIndex}
    onClose={() => (lightboxIndex = null)}
  />
{/if}

