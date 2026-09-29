<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { DashboardTask, TodoTag, TodoStatus } from "$lib/ipc";
  import { fmtWork, tagColor } from "$lib/tasktime";

  // ----- date helpers -----
  const DAY = 86400000;
  function iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function startOfToday(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  const niceDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ----- controls state -----
  type Preset = "week" | "month" | "7" | "30" | "custom";
  const PRESETS: { k: Preset; label: string }[] = [
    { k: "week", label: "This week" }, { k: "month", label: "This month" },
    { k: "7", label: "Last 7 days" }, { k: "30", label: "Last 30 days" }, { k: "custom", label: "Custom" },
  ];
  const MEASURE_HINT = {
    list: "Counts each task on the day it was on a list (your plan).",
    done: "Counts each task on the day you completed it (throughput).",
  };
  let preset = $state<Preset>("week");
  let countBy = $state<"list" | "done">("list");
  let tagFilter = $state<Set<string>>(new Set());
  let customFrom = $state(iso(addDays(startOfToday(), -6)));
  let customTo = $state(iso(startOfToday()));
  let tagMenuOpen = $state(false);
  let tagQuery = $state("");
  let drill = $state<{ kind: "day" | "tag"; key: string; label: string } | null>(null);

  const today = startOfToday();

  let range = $derived.by<[Date, Date]>(() => {
    if (preset === "custom") return [new Date(customFrom + "T00:00:00"), new Date(customTo + "T00:00:00")];
    if (preset === "week") return [addDays(today, -((today.getDay() + 6) % 7)), today];
    if (preset === "month") return [new Date(today.getFullYear(), today.getMonth(), 1), today];
    if (preset === "7") return [addDays(today, -6), today];
    return [addDays(today, -29), today];
  });
  let from = $derived(iso(range[0]));
  let to = $derived(iso(range[1]));
  let rangeLen = $derived(Math.round((range[1].getTime() - range[0].getTime()) / DAY) + 1);
  let fetchFrom = $derived(iso(addDays(range[0], -rangeLen)));
  let prevFrom = $derived(iso(addDays(range[0], -rangeLen)));
  let prevTo = $derived(iso(addDays(range[0], -1)));

  $effect(() => {
    const ff = fetchFrom, t = to;
    if (app.dashboardFetchedFrom !== ff || app.dashboardFetchedTo !== t) app.loadDashboard(ff, t);
  });

  // Changing what we look at clears any active drill.
  function resetDrill() { drill = null; }
  function setPreset(p: Preset) { preset = p; resetDrill(); }
  function setCountBy(c: "list" | "done") { countBy = c; resetDrill(); }
  function toggleTag(name: string) {
    const n = new Set(tagFilter);
    n.has(name) ? n.delete(name) : n.add(name);
    tagFilter = n; resetDrill();
  }

  // ----- data -----
  let allTasks = $derived<DashboardTask[]>(app.dashboard?.tasks ?? []);
  let tagsByTodo = $derived.by<Map<number, TodoTag[]>>(() => {
    const m = new Map<number, TodoTag[]>();
    for (const r of app.dashboard?.tags ?? []) { const a = m.get(r.todoId) ?? []; a.push(r); m.set(r.todoId, a); }
    return m;
  });
  let allTagNames = $derived.by<TodoTag[]>(() => {
    const seen = new Map<string, TodoTag>();
    for (const r of app.dashboard?.tags ?? []) if (!seen.has(r.name)) seen.set(r.name, r);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  const refDate = (t: DashboardTask): string | null =>
    countBy === "done" ? (t.completedAt ? t.completedAt.slice(0, 10) : null) : (t.listDate || null);
  function inWin(t: DashboardTask, a: string, b: string): boolean {
    const rd = refDate(t);
    if (!rd || rd < a || rd > b) return false;
    if (tagFilter.size && !(tagsByTodo.get(t.id) ?? []).some((x) => tagFilter.has(x.name))) return false;
    return true;
  }
  let cur = $derived(allTasks.filter((t) => inWin(t, from, to)));
  let prev = $derived(allTasks.filter((t) => inWin(t, prevFrom, prevTo)));
  let days = $derived.by<string[]>(() => {
    const out: string[] = [];
    for (let d = new Date(range[0]); d <= range[1]; d = addDays(d, 1)) out.push(iso(d));
    return out;
  });

  // KPIs
  let kpi = $derived.by(() => {
    const done = cur.filter((t) => t.status === "done").length;
    const pdone = prev.filter((t) => t.status === "done").length;
    return {
      completed: done, pcompleted: pdone,
      planned: cur.length, pplanned: prev.length,
      rate: cur.length ? Math.round((done / cur.length) * 100) : 0,
      workSec: cur.reduce((s, t) => s + t.workSeconds, 0),
    };
  });
  function delta(c: number, p: number): { txt: string; dir: string } {
    if (p === 0) return { txt: c > 0 ? "new" : "", dir: "up" };
    const d = Math.round(((c - p) / p) * 100);
    if (d === 0) return { txt: "", dir: "flat" };
    return { txt: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%`, dir: d > 0 ? "up" : "down" };
  }

  // Mosaic
  let mosaic = $derived.by(() => {
    const maxW = Math.max(1, ...cur.map((t) => t.workSeconds));
    return [...cur]
      .sort((a, b) => b.workSeconds - a.workSeconds)
      .map((t) => ({ t, size: Math.round(20 + (t.workSeconds / maxW) * 36) }));
  });
  function taskColors(t: DashboardTask): string[] {
    return (tagsByTodo.get(t.id) ?? []).slice(0, 3).map((x) => tagColor(x));
  }
  function squareBg(c: string[]): string {
    if (c.length === 0) return "var(--st-empty)";
    if (c.length === 1) return c[0];
    if (c.length === 2) return `linear-gradient(135deg, ${c[0]} 0 50%, ${c[1]} 50% 100%)`;
    return `linear-gradient(135deg, ${c[0]} 0 33.33%, ${c[1]} 33.33% 66.66%, ${c[2]} 66.66% 100%)`;
  }
  function mosaicDim(t: DashboardTask): boolean {
    const d = drill;
    if (!d) return false;
    if (d.kind === "day") return refDate(t) !== d.key;
    return !(tagsByTodo.get(t.id) ?? []).some((x) => x.name === d.key);
  }

  // Tracked time per day
  let timePerDay = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const d of days) map[d] = 0;
    for (const t of cur) { const rd = refDate(t); if (rd && rd in map) map[rd] += t.workSeconds; }
    const max = Math.max(1, ...days.map((d) => map[d]));
    return { map, max, total: days.reduce((s, d) => s + map[d], 0) };
  });
  let xLabelStep = $derived(Math.max(1, Math.ceil(days.length / 8)));

  // Treemap (squarified) by tag, area = tracked time
  function squarify(items: { name: string; value: number; color: string }[], w: number, h: number) {
    const rects: { name: string; color: string; x: number; y: number; w: number; h: number }[] = [];
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const scale = (w * h) / total;
    let rest = items.map((i) => ({ ...i, a: i.value * scale }));
    let cur2 = { x: 0, y: 0, w, h };
    const worst = (row: { a: number }[], len: number) => {
      const sum = row.reduce((s, r) => s + r.a, 0);
      const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
      return Math.max((len * len * mx) / (sum * sum), (sum * sum) / (len * len * mn));
    };
    while (rest.length) {
      let row: (typeof rest) = [];
      const len = Math.min(cur2.w, cur2.h);
      while (rest.length) {
        const nx = [...row, rest[0]];
        if (row.length === 0 || worst(nx, len) <= worst(row, len)) row.push(rest.shift()!);
        else break;
      }
      const sum = row.reduce((s, r) => s + r.a, 0);
      if (cur2.w >= cur2.h) {
        const sw = sum / cur2.h; let oy = cur2.y;
        for (const r of row) { const rh = r.a / sw; rects.push({ name: r.name, color: r.color, x: cur2.x, y: oy, w: sw, h: rh }); oy += rh; }
        cur2 = { x: cur2.x + sw, y: cur2.y, w: cur2.w - sw, h: cur2.h };
      } else {
        const sh = sum / cur2.w; let ox = cur2.x;
        for (const r of row) { const rw = r.a / sh; rects.push({ name: r.name, color: r.color, x: ox, y: cur2.y, w: rw, h: sh }); ox += rw; }
        cur2 = { x: cur2.x, y: cur2.y + sh, w: cur2.w, h: cur2.h - sh };
      }
    }
    return rects;
  }
  let treemap = $derived.by(() => {
    const agg = new Map<string, number>();
    let untag = 0;
    for (const t of cur) {
      const tags = tagsByTodo.get(t.id) ?? [];
      if (tags.length === 0) { untag += t.workSeconds; continue; }
      for (const tg of tags) agg.set(tg.name, (agg.get(tg.name) ?? 0) + t.workSeconds / tags.length);
    }
    const items = [...agg.entries()]
      .map(([name, value]) => ({ name, value, color: tagColor({ id: 0, color: allTagNames.find((x) => x.name === name)?.color ?? null }) }))
      .filter((i) => i.value > 0);
    if (untag > 0) items.push({ name: "untagged", value: untag, color: "var(--st-empty)" });
    items.sort((a, b) => b.value - a.value);
    if (!items.length) return [];
    return squarify(items, 100, 100).map((r) => ({ ...r, value: agg.get(r.name) ?? untag }));
  });

  function drillDay(d: string) {
    if (timePerDay.map[d] <= 0 && !drill) return;
    const cur0 = drill;
    drill = cur0 && cur0.kind === "day" && cur0.key === d ? null : { kind: "day", key: d, label: niceDate(d) };
  }
  function drillTag(name: string) {
    if (name === "untagged") return;
    const cur0 = drill;
    drill = cur0 && cur0.kind === "tag" && cur0.key === name ? null : { kind: "tag", key: name, label: `#${name}` };
  }

  // Table (drill-filtered)
  const STATUS: Record<TodoStatus, { label: string; color: string }> = {
    open: { label: "To do", color: "#3b82f6" },
    wip: { label: "In progress", color: "#f59e0b" },
    done: { label: "Done", color: "#10b981" },
  };
  function drillMatch(t: DashboardTask): boolean {
    const d = drill;
    if (!d) return true;
    if (d.kind === "day") return refDate(t) === d.key;
    return (tagsByTodo.get(t.id) ?? []).some((x) => x.name === d.key);
  }
  let tableRows = $derived(
    cur.filter(drillMatch)
      .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))
      .slice(0, 80),
  );
  function cycle(t: DashboardTask): string {
    if (t.status !== "done" || !t.completedAt) return "—";
    const d = Math.round((new Date(t.completedAt.slice(0, 10)).getTime() - new Date(t.createdAt.slice(0, 10)).getTime()) / DAY);
    return d < 1 ? "<1d" : d + "d";
  }

  // ----- PNG export -----
  let contentEl: HTMLElement | undefined = $state();
  let copied = $state(false);
  async function exportPng() {
    if (!contentEl) return;
    try {
      const { toBlob } = await import("html-to-image");
      const dark = document.documentElement.classList.contains("dark");
      const bg = dark ? "#0d1017" : "#f4f5f7";
      const pad = 24, w = contentEl.offsetWidth, h = contentEl.offsetHeight;
      const opts = { pixelRatio: 2, backgroundColor: bg, width: w + pad * 2, height: h + pad * 2,
        style: { boxSizing: "content-box", width: `${w}px`, height: `${h}px`, padding: `${pad}px`, margin: "0", background: bg } };
      await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
      await toBlob(contentEl, opts).catch(() => null);
      const blob = await toBlob(contentEl, opts);
      if (!blob) return;
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      try { const { copyImageToClipboard } = await import("$lib/ipc"); await copyImageToClipboard(bytes); }
      catch { await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); }
      copied = true; setTimeout(() => (copied = false), 1500);
    } catch (e) { app.error = String(e); }
  }

  const chip = "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer";
  const chipOff = "border-neutral-200 bg-neutral-50 text-neutral-500 hover:text-neutral-800 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:text-neutral-100";
  let filteredTags = $derived(allTagNames.filter((t) => t.name.toLowerCase().includes(tagQuery.toLowerCase())));
</script>

<main class="mx-auto w-full max-w-6xl px-6 py-8" style="--st-empty:#d3d8e0">
  <div class="mb-5 flex items-end justify-between gap-4">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100" style="font-family: var(--serif, ui-serif, Georgia, serif)">Dashboard</h1>
      <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {range[0].toLocaleDateString(undefined, { month: "long", day: "numeric" })} –
        {range[1].toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        · by {countBy === "done" ? "completed" : "planned"} day
      </p>
    </div>
    <button type="button" class="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800" onclick={exportPng}>
      {#if copied}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-emerald-500"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clip-rule="evenodd"/></svg>Copied!
      {:else}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M4 3a2 2 0 00-2 2v8a2 2 0 002 2h1V5h9V4a1 1 0 00-1-1H4z"/><path d="M8 6a2 2 0 00-2 2v7a2 2 0 002 2h7a2 2 0 002-2V8a2 2 0 00-2-2H8z"/></svg>Copy as image
      {/if}
    </button>
  </div>

  <div bind:this={contentEl}>
  <!-- Controls -->
  <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div class="flex flex-wrap items-center gap-2.5">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Range</span>
      {#each PRESETS as p (p.k)}
        <button type="button" class="{chip} {preset === p.k ? 'border-transparent text-white' : chipOff}" style={preset === p.k ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => setPreset(p.k)}>{p.label}</button>
      {/each}
      {#if preset === "custom"}
        <span class="flex items-center gap-2">
          <input type="date" bind:value={customFrom} onchange={resetDrill} class="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
          <span class="text-neutral-400">→</span>
          <input type="date" bind:value={customTo} onchange={resetDrill} class="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
        </span>
      {/if}
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Measure by</span>
      <div class="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
        <button type="button" class="px-3 py-1.5 text-sm font-medium {countBy === 'list' ? 'text-white' : 'bg-neutral-50 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400'}" style={countBy === "list" ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => setCountBy("list")}>Planned day</button>
        <button type="button" class="border-l border-neutral-200 px-3 py-1.5 text-sm font-medium dark:border-neutral-700 {countBy === 'done' ? 'text-white' : 'bg-neutral-50 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400'}" style={countBy === "done" ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => setCountBy("done")}>Completed day</button>
      </div>
      <span class="text-xs italic text-neutral-400">{MEASURE_HINT[countBy]}</span>

      <div class="relative ml-auto">
        <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:text-neutral-100" onclick={() => (tagMenuOpen = !tagMenuOpen)}>
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path d="M2 5a3 3 0 013-3h4.6a3 3 0 012.1.9l5.4 5.4a2 2 0 010 2.8l-4.6 4.6a2 2 0 01-2.8 0L6.3 10.3A3 3 0 015 8.6V5zm3 .5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>
          Tags {#if tagFilter.size}<span class="rounded-full bg-[var(--accent,#4f46e5)] px-1.5 text-[11px] font-semibold text-white">{tagFilter.size}</span>{/if}
          <span class="text-[10px]">▾</span>
        </button>
        {#if tagMenuOpen}
          <button type="button" class="fixed inset-0 z-10 cursor-default" aria-label="Close" onclick={() => (tagMenuOpen = false)}></button>
          <div class="absolute right-0 z-20 mt-1.5 w-60 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <input placeholder="Search tags…" bind:value={tagQuery} class="mb-1.5 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
            <ul class="max-h-52 overflow-auto">
              {#each filteredTags as tg (tg.id)}
                <li>
                  <button type="button" class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" onclick={() => toggleTag(tg.name)}>
                    <span class="h-2.5 w-2.5 rounded-full" style="background:{tagColor(tg)}"></span>
                    <span class="text-neutral-700 dark:text-neutral-200">{tg.name}</span>
                    {#if tagFilter.has(tg.name)}<span class="ml-auto font-bold text-[var(--accent,#4f46e5)]">✓</span>{/if}
                  </button>
                </li>
              {:else}
                <li class="px-2 py-2 text-sm text-neutral-400">No tags</li>
              {/each}
            </ul>
            {#if tagFilter.size}
              <div class="mt-1.5 border-t border-neutral-100 pt-1.5 text-right dark:border-neutral-800">
                <button type="button" class="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200" onclick={() => { tagFilter = new Set(); resetDrill(); }}>Clear all</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    {#if tagFilter.size}
      <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Filtering</span>
        {#each [...tagFilter] as name (name)}
          <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style="background:{tagColor({ id: 0, color: allTagNames.find((x) => x.name === name)?.color ?? null })}1f;color:{tagColor({ id: 0, color: allTagNames.find((x) => x.name === name)?.color ?? null })}">
            {name}<button type="button" class="opacity-70 hover:opacity-100" aria-label="Remove" onclick={() => toggleTag(name)}>×</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  {#if app.dashboardLoading && !app.dashboard}
    <p class="p-8 text-sm text-neutral-400">Loading…</p>
  {:else}
    <!-- KPIs -->
    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {#snippet kpiCard(label: string, value: string, sub: string, d: { txt: string; dir: string } | null)}
        <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
          <div class="mt-1.5 text-3xl font-extrabold tabular-nums tracking-tight" style="color: var(--accent, #4f46e5)">{value}</div>
          <div class="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
            {sub}
            {#if d && d.txt}<span class="font-semibold {d.dir === 'up' ? 'text-emerald-500' : d.dir === 'down' ? 'text-red-500' : 'text-neutral-400'}">{d.txt}</span>{/if}
          </div>
        </div>
      {/snippet}
      {@render kpiCard("Completed", String(kpi.completed), `vs ${kpi.pcompleted} prev `, delta(kpi.completed, kpi.pcompleted))}
      {@render kpiCard("Planned", String(kpi.planned), "", delta(kpi.planned, kpi.pplanned))}
      {@render kpiCard("Completion", kpi.rate + "%", `${kpi.completed} of ${kpi.planned}`, null)}
      {@render kpiCard("Tracked time", fmtWork(kpi.workSec) || "0m", `${(kpi.workSec / 3600).toFixed(1)} hours`, null)}
    </div>

    <!-- Task mosaic -->
    <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="mb-3 flex items-baseline gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Tasks this period</h3>
        <span class="text-xs text-neutral-400">{cur.length} · size = tracked time · color = tags · click to open</span>
      </div>
      {#if mosaic.length === 0}
        <div class="py-8 text-center text-sm text-neutral-400">No tasks in this period.</div>
      {:else}
        <div class="flex flex-wrap items-center gap-1.5">
          {#each mosaic as m (m.t.id)}
            <button
              type="button"
              class="rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)] transition-transform hover:scale-110 hover:shadow-md {mosaicDim(m.t) ? 'opacity-20' : ''}"
              style="width:{m.size}px;height:{m.size}px;background:{squareBg(taskColors(m.t))}"
              title={`${m.t.text}\n${(tagsByTodo.get(m.t.id) ?? []).map((x) => x.name).join(', ') || 'no tags'} · ${fmtWork(m.t.workSeconds) || '0m'}`}
              aria-label={m.t.text}
              onclick={() => app.selectTodo(m.t.id)}
            ></button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tracked time per day -->
    <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="mb-3 flex items-baseline gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Tracked time per day</h3>
        <span class="text-xs text-neutral-400">peak {fmtWork(timePerDay.max) || "0m"} · total {fmtWork(timePerDay.total) || "0m"} · click a bar to focus</span>
      </div>
      <div class="flex h-40 items-end gap-1 pt-2">
        {#each days as d (d)}
          {@const h = Math.round((timePerDay.map[d] / timePerDay.max) * 100)}
          {@const active = drill?.kind === "day" && drill.key === d}
          {@const dim = drill?.kind === "day" && !active}
          <button type="button" class="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${niceDate(d)} · ${fmtWork(timePerDay.map[d]) || "0m"}`} onclick={() => drillDay(d)}>
            <span class="w-[70%] max-w-[26px] rounded-t transition-[height,opacity] duration-500 {dim ? 'opacity-25' : active ? 'opacity-100 ring-2 ring-[var(--accent,#4f46e5)]/50' : 'opacity-80 hover:opacity-100'}" style="height:{h}%;background:var(--accent,#4f46e5)"></span>
            <span class="mt-1 whitespace-nowrap text-[9px] text-neutral-400">{days.indexOf(d) % xLabelStep === 0 ? niceDate(d) : ""}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Treemap -->
    <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="mb-3 flex items-baseline gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Effort by tag</h3>
        <span class="text-xs text-neutral-400">area = tracked time · click a tag to focus</span>
      </div>
      {#if treemap.length === 0}
        <div class="py-8 text-center text-sm text-neutral-400">No tracked time to map.</div>
      {:else}
        <div class="relative w-full overflow-hidden rounded-lg" style="aspect-ratio:16/9">
          {#each treemap as r (r.name)}
            {@const active = drill?.kind === "tag" && drill.key === r.name}
            {@const dim = drill?.kind === "tag" && !active}
            {@const big = r.w > 12 && r.h > 10}
            <button
              type="button"
              class="absolute flex flex-col justify-end overflow-hidden rounded-md border-2 border-white p-1.5 text-left text-white transition-[transform,opacity] duration-500 dark:border-neutral-900 {dim ? 'opacity-30' : ''} {active ? 'ring-2 ring-inset ring-black/60 dark:ring-white/70' : ''}"
              style="left:{r.x}%;top:{r.y}%;width:{r.w}%;height:{r.h}%;background:{r.color}"
              title={`${r.name} · ${fmtWork(Math.round(r.value)) || "0m"}`}
              onclick={() => drillTag(r.name)}
            >
              {#if big}
                <span class="text-xs font-bold leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,.35)]">{r.name}</span>
                <span class="text-[10.5px] opacity-90 [text-shadow:0_1px_2px_rgba(0,0,0,.35)]">{fmtWork(Math.round(r.value)) || "0m"}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {#if drill}
        <div class="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style="background: color-mix(in srgb, var(--accent,#4f46e5) 12%, transparent); border-color: color-mix(in srgb, var(--accent,#4f46e5) 30%, transparent)">
          <span class="text-neutral-600 dark:text-neutral-300">Focused on {drill.kind}: <b style="color:var(--accent,#4f46e5)">{drill.label}</b></span>
          <button type="button" class="ml-auto rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" onclick={resetDrill}>← Back to overview</button>
        </div>
      {/if}
      <div class="mb-3 flex items-baseline gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Tasks <span class="font-normal text-neutral-400">({cur.filter(drillMatch).length})</span></h3>
        <span class="text-xs text-neutral-400">click a row for detail</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-neutral-700">
              <th class="px-2.5 py-2 font-semibold">Task</th><th class="px-2.5 py-2 font-semibold">Tags</th>
              <th class="px-2.5 py-2 font-semibold">Status</th><th class="px-2.5 py-2 font-semibold">Created</th>
              <th class="px-2.5 py-2 font-semibold">Work</th><th class="px-2.5 py-2 font-semibold">Cycle</th>
            </tr>
          </thead>
          <tbody>
            {#if tableRows.length === 0}
              <tr><td colspan="6" class="py-8 text-center text-sm text-neutral-400">No tasks.</td></tr>
            {:else}
              {#each tableRows as t (t.id)}
                <tr class="cursor-pointer border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-800/70 dark:hover:bg-neutral-800/40" onclick={() => app.selectTodo(t.id)}>
                  <td class="px-2.5 py-2 text-neutral-800 dark:text-neutral-200">{t.text}</td>
                  <td class="px-2.5 py-2">
                    <span class="inline-flex flex-wrap gap-1">
                      {#each tagsByTodo.get(t.id) ?? [] as tg (tg.id)}
                        <span class="rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style="background:{tagColor(tg)}1f;color:{tagColor(tg)}">{tg.name}</span>
                      {:else}
                        <span class="text-neutral-300 dark:text-neutral-600">—</span>
                      {/each}
                    </span>
                  </td>
                  <td class="px-2.5 py-2">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style="background:{STATUS[t.status].color}1f;color:{STATUS[t.status].color}">
                      <span class="h-1.5 w-1.5 rounded-full" style="background:{STATUS[t.status].color}"></span>{STATUS[t.status].label}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{niceDate(t.createdAt.slice(0, 10))}</td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{fmtWork(t.workSeconds) || "—"}</td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{cycle(t)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
  </div>
</main>
